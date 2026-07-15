import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

type QueryImpact = {
  warnings: string[];
  estimatedRows: string;
  riskLevel: "low" | "medium" | "high";
  analysis: string;
};

const reservedWords = new Set(["all", "the", "a", "an", "records", "record", "data", "details", "whose", "where", "with"]);

function identifier(value: string): string | undefined {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, "");
  return cleaned && !reservedWords.has(cleaned.toLowerCase()) ? cleaned : undefined;
}

function extractTable(prompt: string, schema: string): string | undefined {
  const fromPrompt = prompt.match(/\bfrom\s+([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:top|first)\s+\d+\s+([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:increase|raise|change|update)\s+.+?\b(?:of|in|for)\s+(?:all\s+)?(?:the\s+)?([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:show|list|find|get|display|retrieve|delete|remove|update|change|add)\s+(?:all\s+)?(?:the\s+)?([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:how many|count|number of)\s+(?:all\s+)?(?:the\s+)?([a-zA-Z_]\w*)/i)?.[1];
  const requested = identifier(fromPrompt ?? "");
  if (!requested) return undefined;

  const schemaTables = [...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-zA-Z_]\w*)/gi)].map(match => match[1]);
  const normalized = requested.toLowerCase().replace(/s$/, "");
  return schemaTables.find(table => table.toLowerCase() === requested.toLowerCase())
    ?? schemaTables.find(table => table.toLowerCase().replace(/s$/, "") === normalized)
    ?? requested;
}

function quoteValue(value: string): string {
  const trimmed = value.trim().replace(/[.,;]+$/, "");
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, "''")}'`;
}

function extractFilter(prompt: string): string | undefined {
  const comparison = prompt.match(/\b([a-zA-Z_]\w*)\s*(?:is\s+)?(>=|<=|!=|<>|=|>|<|greater than|more than|above|over|less than|below)\s*(?:than\s+)?(?:₹|\$)?([\w.-]+)/i);
  if (comparison) {
    const operator = ({ "greater than": ">", "more than": ">", above: ">", over: ">", "less than": "<", below: "<" } as Record<string, string>)[comparison[2].toLowerCase()] ?? comparison[2];
    return `${comparison[1]} ${operator} ${quoteValue(comparison[3])}`;
  }
  const department = prompt.match(/\b(?:in|for)\s+([a-zA-Z0-9_ -]+?)\s+department\b/i);
  if (department) return `Department = ${quoteValue(department[1])}`;
  const equality = prompt.match(/\b(?:where|with|whose)\s+([a-zA-Z_]\w*)\s+(?:is|equals?|is equal to)\s+['"]?([a-zA-Z0-9_ -]+)['"]?/i);
  return equality ? `${equality[1]} = ${quoteValue(equality[2])}` : undefined;
}

/**
 * Generates syntactically-valid SQL for common plain-English requests when the
 * hosted AI service is unavailable. It intentionally derives names from the
 * request/schema instead of using a fixed list of sample tables.
 */
export function localSqlFallback(input: string, schema = ""): string[] {
  const prompt = input.replace(/[\u20b9,$]/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
  const table = extractTable(prompt, schema);
  if (!table) {
    return ["-- Please name the table to query, or select/paste a database schema so I can identify it safely."];
  }

  const filter = extractFilter(prompt);
  const limit = prompt.match(/\b(?:top|first|limit)\s+(\d+)/i)?.[1];
  const sort = prompt.match(/\b(?:highest|largest|most)\s+([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:lowest|smallest|least)\s+([a-zA-Z_]\w*)/i)?.[1];
  const descending = /\b(highest|largest|most|descending|desc)\b/i.test(prompt);

  if (/\b(delete|remove)\b/i.test(prompt)) {
    return [`DELETE FROM ${table}${filter ? `\nWHERE ${filter}` : ""};`];
  }
  if (/\b(increase|raise)\b/i.test(prompt)) {
    const field = prompt.match(/\b(increase|raise)\s+([a-zA-Z_]\w*)/i)?.[2];
    const percentage = prompt.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
    if (field && percentage) {
      return [`UPDATE ${table}\nSET ${field} = ${field} * ${(1 + Number(percentage) / 100).toFixed(4)}${filter ? `\nWHERE ${filter}` : ""};`];
    }
  }
  if (/\b(update|change|set)\b/i.test(prompt)) {
    const assignment = prompt.match(/\b(?:set|change)\s+([a-zA-Z_]\w*)\s+(?:to|=)\s+['"]?([a-zA-Z0-9_ .-]+)['"]?/i);
    if (assignment) return [`UPDATE ${table}\nSET ${assignment[1]} = ${quoteValue(assignment[2])}${filter ? `\nWHERE ${filter}` : ""};`];
  }
  if (/\b(count|how many|number of)\b/i.test(prompt)) {
    return [`SELECT COUNT(*) AS total\nFROM ${table}${filter ? `\nWHERE ${filter}` : ""};`];
  }

  const query = [`SELECT *`, `FROM ${table}`];
  if (filter) query.push(`WHERE ${filter}`);
  if (sort) query.push(`ORDER BY ${sort} ${descending ? "DESC" : "ASC"}`);
  if (limit) query.push(`LIMIT ${limit}`);
  return [`${query.join("\n")};`];
}

function isSupportedSql(statement: string): boolean {
  const normalized = statement.trim();
  return /^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(normalized)
    || (/^WITH\b/i.test(normalized) && !/\b(?:INSERT|UPDATE|DELETE)\b/i.test(normalized));
}

function localExplanation(query: string): string {
  const operation = query.trim().match(/^(SELECT|INSERT|UPDATE|DELETE)/i)?.[1]?.toUpperCase();
  const tables = [...query.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([`"\w.]+)/gi)].map((match) => match[1].replace(/[`"]+/g, ""));
  const where = /\bWHERE\b/i.test(query);
  const limit = query.match(/\bLIMIT\s+(\d+)/i)?.[1];
  const tableText = tables.length ? `It uses ${tables.join(", ")}.` : "It does not identify a table.";
  if (operation === "SELECT") return `Returns matching records. ${tableText} ${where ? "The WHERE clause filters the rows." : "No WHERE clause is applied."}${limit ? ` LIMIT restricts the response to ${limit} row(s).` : ""}`;
  if (operation === "UPDATE") return `Changes existing records. ${tableText} ${where ? "The WHERE clause limits which rows are updated." : "There is no WHERE clause, so every row may be updated."}`;
  if (operation === "DELETE") return `Removes records. ${tableText} ${where ? "The WHERE clause limits which rows are removed." : "There is no WHERE clause, so every row may be removed."}`;
  if (operation === "INSERT") return `Adds new record(s). ${tableText}`;
  return "The generated text is not a recognized SQL statement.";
}

function localImpact(query: string): QueryImpact {
  const operation = query.trim().match(/^(SELECT|INSERT|UPDATE|DELETE)/i)?.[1]?.toUpperCase();
  const hasWhere = /\bWHERE\b/i.test(query);
  const limit = query.match(/\bLIMIT\s+(\d+)/i)?.[1];
  if (operation === "DELETE" || operation === "UPDATE") {
    const risky = !hasWhere;
    return { warnings: risky ? [`${operation} has no WHERE clause and may change every row.`] : ["Review the matching rows before executing this write operation."], estimatedRows: risky ? "All rows in the target table" : "Depends on rows matching the filter", riskLevel: risky ? "high" : "medium", analysis: risky ? "This is a broad data-changing operation." : "This is a filtered data-changing operation; confirm the preview before execution." };
  }
  if (operation === "INSERT") return { warnings: [], estimatedRows: "1 or more rows", riskLevel: "medium", analysis: "This inserts data. Verify required columns and constraints first." };
  if (operation === "SELECT") return { warnings: hasWhere ? [] : ["No WHERE clause may return a large result set."], estimatedRows: limit ? `${limit} rows at most` : "Depends on the table size and filters", riskLevel: hasWhere || limit ? "low" : "medium", analysis: "Read-only query; no database records will be changed." };
  return { warnings: ["The SQL statement could not be validated."], estimatedRows: "Unknown", riskLevel: "high", analysis: "Only SELECT, INSERT, UPDATE, and DELETE statements are supported." };
}

/**
 * Generate SQL query from natural language with streaming support
 * Returns the full response for streaming to client
 */
export async function generateSQLQuery(
  input: string,
  schema: string,
  previousContext?: string
): Promise<string[]> {
  const systemPrompt = `You are an expert MySQL 8+ query generator. Your task is to convert natural language requirements into valid, optimized MySQL queries.

When generating queries:
1. Understand ordinary, conversational user requests and return ONLY the SQL query code, no explanation. If multiple valid interpretations exist, return up to 3 distinct queries, each enclosed in triple backticks with sql language tag.
2. Use MySQL 8+ syntax only. Do not use PostgreSQL-only syntax such as ::date, DATE_TRUNC, QUALIFY, or INTERVAL '6 months'; use CAST(... AS DATE), DATE_FORMAT, a CTE/subquery, and DATE_SUB(CURDATE(), INTERVAL 6 MONTH) instead.
3. Use proper formatting and indentation
4. Include comments for complex logic
5. Optimize for performance
6. Use the supplied schema exactly when it is available. If no schema is supplied, infer sensible table and column names from the request instead of refusing to generate a query.
7. Be capable of SELECT, INSERT, UPDATE, DELETE, joins, subqueries, CTEs (including recursive CTEs), window functions, grouping, ranking, date functions, duplicate detection, reporting, and index recommendations. For index recommendations, return the CREATE INDEX statement but clearly do not treat it as a data query.

Available database schema:
${schema}

${previousContext ? `Previous context:\n${previousContext}` : ""}`;

  try {
  const response = await invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ],
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message.content;
  if (typeof content !== "string") return localSqlFallback(input, schema);

  // Extract all SQL blocks
  const queries = content.match(/```(?:sql)?\s*\n([\s\S]*?)\n```/gi);
  if (queries) {
    const extracted = queries
      .map(q => q.replace(/^```(?:sql)?\s*\n|\n```$/gi, "").trim())
      .filter(isSupportedSql)
      .slice(0, 3);
    return extracted.length ? extracted : localSqlFallback(input, schema);
  } else {
    // A provider can return a prose refusal or an error message. Never show it
    // as though it were executable SQL.
    return isSupportedSql(content) ? [content.trim()] : localSqlFallback(input, schema);
  }
  } catch (error) {
    console.warn("AI SQL generation unavailable; using local fallback", error);
    return localSqlFallback(input, schema);
  }
}

/**
 * Generate SQL explanation from a query
 */
export async function explainSQLQuery(query: string, schema: string): Promise<string> {
  const systemPrompt = `You are an expert SQL query explainer. Your task is to explain SQL queries in simple, clear language.

When explaining:
1. Describe what the query does in plain English
2. Explain each major clause (SELECT, WHERE, JOIN, GROUP BY, etc.)
3. Highlight any special operations or optimizations
4. Note potential performance implications
5. Keep explanations concise but thorough

Database schema context:
${schema}`;

  try {
  const response = await invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Explain this SQL query:\n\n${query}` },
    ],
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message.content;
  return typeof content === "string" && content.trim() ? content : localExplanation(query);
  } catch (error) {
    console.warn("AI SQL explanation unavailable; using local explanation", error);
    return localExplanation(query);
  }
}

/**
 * Analyze query for potential issues and estimate impact
 */
export async function analyzeQueryImpact(
  query: string,
  schema: string
): Promise<{
  warnings: string[];
  estimatedRows: string;
  riskLevel: "low" | "medium" | "high";
  analysis: string;
}> {
  const systemPrompt = `You are a SQL query analyzer. Analyze the provided query for potential issues and estimate its impact.

Return a JSON object with:
{
  "warnings": ["array of potential issues or risky operations"],
  "estimatedRows": "estimated number of rows affected/returned",
  "riskLevel": "low|medium|high",
  "analysis": "brief analysis of the query impact"
}

Focus on:
1. Missing WHERE clauses in UPDATE/DELETE
2. Potential performance issues
3. Data loss risks
4. Locking implications

Database schema:
${schema}`;

  try {
  const response = await invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze this query:\n\n${query}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "query_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            warnings: {
              type: "array",
              items: { type: "string" },
              description: "Array of warnings or potential issues",
            },
            estimatedRows: {
              type: "string",
              description: "Estimated number of rows affected",
            },
            riskLevel: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Risk level of the operation",
            },
            analysis: {
              type: "string",
              description: "Brief analysis of query impact",
            },
          },
          required: ["warnings", "estimatedRows", "riskLevel", "analysis"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") throw new Error("No response from LLM");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse query analysis:", error);
    return localImpact(query);
  }
  } catch (error) {
    console.warn("AI query analysis unavailable; using local analysis", error);
    return localImpact(query);
  }
}

/**
 * Generate code from natural language
 */
export async function generateCode(
  input: string,
  language: string,
  previousContext?: string
): Promise<string> {
  const systemPrompt = `You are an expert ${language} programmer. Your task is to generate clean, well-structured code from natural language requirements.

When generating code:
1. Return ONLY the code, no explanation or markdown
2. Use best practices and industry standards for ${language}
3. Include meaningful variable names and comments
4. Handle edge cases appropriately
5. Optimize for readability and performance

${previousContext ? `Previous context:\n${previousContext}` : ""}`;

  const response = await invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ],
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message.content;
  return typeof content === "string" ? content : "";
}

/**
 * Explain code
 */
export async function explainCode(code: string, language: string): Promise<string> {
  const systemPrompt = `You are an expert ${language} code explainer. Your task is to explain code in simple, clear language.

When explaining:
1. Describe what the code does overall
2. Break down key sections and their purpose
3. Explain important algorithms or patterns
4. Note any potential improvements
5. Keep explanations concise but thorough`;

  const response = await invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Explain this ${language} code:\n\n${code}` },
    ],
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message.content;
  return typeof content === "string" ? content : "";
}

/**
 * Debug code and suggest fixes
 */
export async function debugCode(
  code: string,
  language: string,
  errorMessage?: string
): Promise<{
  issues: string[];
  correctedCode: string;
  explanation: string;
}> {
  const systemPrompt = `You are an expert ${language} debugger. Analyze the provided code for errors and suggest fixes.

Return a JSON object with:
{
  "issues": ["array of identified issues"],
  "correctedCode": "fixed version of the code",
  "explanation": "explanation of the issues and fixes"
}

Be thorough in identifying:
1. Syntax errors
2. Logic errors
3. Potential runtime exceptions
4. Best practice violations`;

  const userMessage = errorMessage
    ? `Debug this ${language} code (error: ${errorMessage}):\n\n${code}`
    : `Debug this ${language} code:\n\n${code}`;

  const response = await invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "code_debug",
        strict: true,
        schema: {
          type: "object",
          properties: {
            issues: {
              type: "array",
              items: { type: "string" },
              description: "Array of identified issues",
            },
            correctedCode: {
              type: "string",
              description: "Fixed version of the code",
            },
            explanation: {
              type: "string",
              description: "Explanation of issues and fixes",
            },
          },
          required: ["issues", "correctedCode", "explanation"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") throw new Error("No response from LLM");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse debug response:", error);
    return {
      issues: ["Unable to debug code"],
      correctedCode: code,
      explanation: "Could not parse debug response",
    };
  }
}

/**
 * Optimize code
 */
export async function optimizeCode(code: string, language: string): Promise<string> {
  const systemPrompt = `You are an expert ${language} code optimizer. Your task is to improve code for performance, readability, and maintainability.

When optimizing:
1. Return ONLY the optimized code
2. Preserve the original functionality
3. Use modern ${language} patterns and features
4. Improve performance where possible
5. Enhance code clarity`;

  const response = await invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Optimize this ${language} code:\n\n${code}` },
    ],
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message.content;
  return typeof content === "string" ? content : "";
}
