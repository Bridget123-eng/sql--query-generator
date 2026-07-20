import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { validateSql } from "./sql-analysis";

type QueryImpact = {
  warnings: string[];
  estimatedRows: string;
  riskLevel: "low" | "medium" | "high";
  analysis: string;
};

export type SqlResult = string;

const FALLBACK_SQL = "-- ERROR: Failed to generate query";

/* ======================
   CONSTANTS & HELPERS
   ====================== */

const RESERVED_WORDS = new Set([
  "all", "the", "a", "an", "records", "record", "data", "details", "whose", "where", "with",
  "first", "second", "third", "top", "highest", "lowest", "largest", "smallest", "distinct",
  "salary", "result", "results",
]);

const MYSQL_FORBIDDEN_PATTERNS = [
  /::/g,              // PostgreSQL casting
  /DATE_TRUNC/i,      // PostgreSQL
  /QUALIFY/i,         // Snowflake/BigQuery
  /INTERVAL\s+['"]/i, // Interval with quotes (MySQL uses unquoted)
  /\bSCHEMA\b/i,      // Use DATABASE instead in MySQL
  /\bILIKE\b/i,       // PostgreSQL case-insensitive LIKE
  /\bSTRING_AGG\b/i,  // Use GROUP_CONCAT in MySQL
  /\bARRAY\[/i,       // PostgreSQL arrays
];

/* ======================
   CORE HELPERS
   ====================== */

function identifier(value: string): string | undefined {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, "");
  return cleaned && !RESERVED_WORDS.has(cleaned.toLowerCase()) ? cleaned : undefined;
}

function extractTable(prompt: string, schema: string): string | undefined {
  const fromPrompt = prompt.match(/\bfrom\s+([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:top|first)\s+\d+\s+([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:increase|raise|change|update)\s+.+?\b(?:of|in|for)\s+(?:all\s+)?(?:the\s+)?([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:show|list|find|get|display|retrieve|delete|remove|update|change|add)\s+(?:all\s+)?(?:the\s+)?([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:how many|count|number of)\s+(?:all\s+)?(?:the\s+)?([a-zA-Z_]\w*)/i)?.[1];
  const requested = identifier(fromPrompt ?? "");
  const schemaTables = [...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-zA-Z_]\w*)/gi)].map(match => match[1]);
  if (!requested) return schemaTables.length === 1 ? schemaTables[0] : undefined;
  const normalized = requested.toLowerCase().replace(/s$/, "");
  return schemaTables.find(table => table.toLowerCase() === requested.toLowerCase())
    ?? schemaTables.find(table => table.toLowerCase().replace(/s$/, "") === normalized)
    ?? requested;
}

function findTableContainingColumn(schema: string, column: string): string | undefined {
  const matches = [...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-zA-Z_]\w*)[`"]?\s*\(([\s\S]*?)\);/gi)]
    .filter(([, , definition]) => new RegExp(`\\b[\\\`\"]?${column}[\\\`\"]?\\s+`, "i").test(definition))
    .map(([, table]) => table);
  return matches.length === 1 ? matches[0] : undefined;
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

/* ======================
   STRING SAFETY HELPER
   ====================== */

function ensureString(str: unknown): string {
  if (typeof str === 'string') {
    const trimmed = str.trim();
    return trimmed.length > 0 ? trimmed : FALLBACK_SQL;
  }
  return FALLBACK_SQL;
}

/* ======================
   SQL VALIDATION & REPAIR
   ====================== */

function isSupportedSql(statement: string): boolean {
  const normalized = statement.trim();
  return /^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(normalized)
    || (/^WITH\b/i.test(normalized) && !/\b(?:INSERT|UPDATE|DELETE)\b/i.test(normalized));
}

function isMySQL8Compatible(sql: string): boolean {
  return !MYSQL_FORBIDDEN_PATTERNS.some(pattern => pattern.test(sql));
}

function extractSqlFromResponse(content: string): string | null {
  // Try to extract SQL from markdown code blocks first
  const sqlBlockMatch = content.match(/```(?:sql)?\s*\n([\s\S]*?)\n```/i);
  if (sqlBlockMatch) return sqlBlockMatch[1].trim();

  // Fallback: look for SQL statement at start of content
  const sqlStartMatch = content.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i);
  if (sqlStartMatch) {
    // Find end of statement (semicolon or end of string)
    const startIndex = sqlStartMatch.index ?? 0;
    const endMatch = content.slice(startIndex).match(/;|$/);
    if (endMatch) {
      const endIndex = startIndex + (endMatch.index ?? 0) + (endMatch[0] === ";" ? 1 : 0);
      return content.slice(startIndex, endIndex).trim();
    }
  }

  // Last resort: return trimmed content if it looks like SQL
  const trimmed = content.trim();
  if (/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(trimmed)) return trimmed;
  return null;
}

function validateSqlWithSchema(sql: string, schema: string): boolean {
  if (!isSupportedSql(sql)) return false;
  if (!isMySQL8Compatible(sql)) return false;
  return validateSql(sql, schema).valid;
}

function repairSql(sql: string, schema: string): string | null {
  // Try fixing common issues
  let repaired = sql;

  // 1. Remove leading/trailing whitespace and ensure single statement
  repaired = repaired.trim();
  if (repaired.endsWith(";")) repaired = repaired.slice(0, -1).trim();

  // 2. Fix missing semicolon (MySQL allows omitting it for single statements, but we prefer it)
  if (!repaired.endsWith(";")) repaired += ";";

  // 3. Fix common keyword misspellings (Qwen 2.5 Coder specific)
  const corrections: [RegExp, string][] = [
    [/SELECY/g, "SELECT"],
    [/FRROM/g, "FROM"],
    [/WHERe/g, "WHERE"],
    [/ORDER BYy/g, "ORDER BY"],
    [/LIMiT/g, "LIMIT"],
    [/INSERT INT0/g, "INSERT INTO"],
    [/UPDATTE/g, "UPDATE"],
    [/DELLET/g, "DELETE"],
  ];

  for (const [pattern, replacement] of corrections) {
    repaired = repaired.replace(pattern, replacement);
  }

  // 4. Fix missing quotes around string literals (basic heuristic)
  repaired = repaired.replace(/(=|\s+)(['"]?)([^'";\s]+)\2(?=\s|$|;)/g, (match, p1, p2, p3) => {
    if (!p2 && !/^-?\d+(?:\.\d+)?$/.test(p3)) {
      return `${p1}'${p3}'`;
    }
    return match;
  });

  // Validate repaired version
  return validateSqlWithSchema(repaired, schema) ? repaired : null;
}

/* ======================
   FALLBACK LOGIC (IMPROVED)
   ====================== */

export function localSqlFallback(input: string, schema = ""): string[] {
  const prompt = input.replace(/[\u20b9,$]/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
  const isSecondHighestSalary = /\bsecond\s+(?:highest|largest)\s+(?:distinct\s+)?salary\b/i.test(prompt);
  const table = extractTable(prompt, schema)
    ?? (isSecondHighestSalary ? findTableContainingColumn(schema, "salary") : undefined);
  if (!table) {
    return [ensureString("-- Please name the table to query, or select/paste a database schema so I can identify it safely.")];
  }

  // Handle highest salary per department (grouped ranking)
  const highestSalaryPerDepartment = /\b(?:employees?|staff)\b[\s\S]*?\bhighest\s+salary\b[\s\S]*?\b(?:in|for)\s+each\s+department\b/i.test(prompt)
    || /\bhighest\s+salary\b[\s\S]*?\b(?:in|for)\s+each\s+department\b/i.test(prompt);
  if (highestSalaryPerDepartment) {
    return [ensureString(
      `SELECT e.*\nFROM ${table} AS e\nINNER JOIN (\n  SELECT department, MAX(salary) AS highest_salary\n  FROM ${table}\n  GROUP BY department\n) AS department_max\n  ON department_max.department = e.department\n AND department_max.highest_salary = e.salary;`
    )];
  }

  const filter = extractFilter(prompt);
  const limit = prompt.match(/\b(?:top|first|limit)\s+(\d+)/i)?.[1];
  const sort = prompt.match(/\b(?:highest|largest|most)\s+([a-zA-Z_]\w*)/i)?.[1]
    ?? prompt.match(/\b(?:lowest|smallest|least)\s+([a-zA-Z_]\w*)/i)?.[1];
  const descending = /\b(highest|largest|most|descending|desc)\b/i.test(prompt);

  if (/\b(delete|remove)\b/i.test(prompt)) {
    return [ensureString(`DELETE FROM ${table}${filter ? `\nWHERE ${filter}` : ""};`)];
  }
  if (/\b(increase|raise)\b/i.test(prompt)) {
    const field = prompt.match(/\b(increase|raise)\s+([a-zA-Z_]\w*)/i)?.[2];
    const percentage = prompt.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
    if (field && percentage) {
      return [ensureString(`UPDATE ${table}\nSET ${field} = ${field} * ${(1 + Number(percentage) / 100).toFixed(4)}${filter ? `\nWHERE ${filter}` : ""};`)];
    }
  }
  if (/\b(update|change|set)\b/i.test(prompt)) {
    const assignment = prompt.match(/\b(?:set|change)\s+([a-zA-Z_]\w*)\s+(?:to|=)\s+['"]?([a-zA-Z0-9_ .-]+)['"]?/i);
    if (assignment) return [ensureString(`UPDATE ${table}\nSET ${assignment[1]} = ${quoteValue(assignment[2])}${filter ? `\nWHERE ${filter}` : ""};`)];
  }
  if (/\b(count|how many|number of)\b/i.test(prompt)) {
    return [ensureString(`SELECT COUNT(*) AS total\nFROM ${table}${filter ? `\nWHERE ${filter}` : ""};`)];
  }

  if (isSecondHighestSalary) {
    return [ensureString(`SELECT DISTINCT salary\nFROM ${table}\nORDER BY salary DESC\nLIMIT 1 OFFSET 1;`)];
  }

  const query = [`SELECT *`, `FROM ${table}`];
  if (filter) query.push(`WHERE ${filter}`);
  if (sort) query.push(`ORDER BY ${sort} ${descending ? "DESC" : "ASC"}`);
  if (limit) query.push(`LIMIT ${limit}`);
  return [ensureString(`${query.join("\n")};`)];
}

function isUsableFallback(queries: string[]): boolean {
  return queries.length > 0 && !queries[0].trim().startsWith("--");
}

function shouldUseLocalSqlFallback(input: string, queries: string[]): boolean {
  if (!isUsableFallback(queries)) return false;
  const prompt = input.toLowerCase();
  if (/\bhighest\s+salary\b[\s\S]*?\b(?:in|for)\s+each\s+department\b/.test(prompt)) return true;

  const unsupportedIntent = /\b(?:each|per|group(?:ed|ing)?|average|avg|sum|total|join|between|last|next|today|yesterday|month|year|date|duplicate|unique|project|rank|percentile|window)\b/;
  if (unsupportedIntent.test(prompt)) return false;

  return /\b(?:show|list|find|get|display|retrieve|count|how many|number of|delete|remove|increase|raise|update|change|set)\b/.test(prompt);
}

/* ======================
   MAIN FUNCTION (OPTIMIZED FOR QWEN 2.5 CODER)
   ====================== */

export async function generateSQLQuery(
  input: string,
  schema: string,
  previousContext?: string
): Promise<string[]> {
  // Step 1: Try rule-based fallback first for simple, deterministic cases
  const fallback = localSqlFallback(input, schema);
  if (!input.trim()) return fallback;
  if (shouldUseLocalSqlFallback(input, fallback)) return fallback;

  // Step 2: Generate with LLM (Qwen 2.5 Coder optimized prompt)
  const systemPrompt = `You are Qwen 2.5 Coder, an expert MySQL 8.0+ SQL generator. Follow these rules STRICTLY:

  1. OUTPUT ONLY VALID MYSQL 8.0+ SQL - NO EXPLANATIONS, MARKDOWN, OR COMMENTS
  2. USE EXACT TABLE/COLUMN NAMES FROM SCHEMA - NEVER INVENT NAMES
  3. FOR AGGREGATIONS: 
     - Use GROUP BY for "per"/"each" requests
     - Use window functions (ROW_NUMBER, RANK) for rankings
     - Never use ::date - use CAST(... AS DATE) or DATE_FORMAT
  4. FOR FILTERS:
     - Use = for exact matches, LIKE for partial
     - Never use ILIKE - use LOWER(column) = LOWER(value) or MySQL 8.0+'s REGEXP
  5. FOR UPDATES:
     - Always include WHERE unless explicitly asked to update all rows
     - Use SET column = column * (1 + percentage/100) for percentage increases
  6. FOR DATE OPERATIONS:
     - Use DATE_SUB(CURDATE(), INTERVAL n UNIT) for past dates
     - Use DATE_ADD(CURDATE(), INTERVAL n UNIT) for future dates
  7. AVOIDE THESE POSTGRESQL-SPECIFIC CONSTRUCTS:
     - :: casting, DATE_TRUNC, QUALIFY, INTERVAL with quotes, STRING_AGG, ARRAY[]
  8. SINGLE STATEMENT ONLY - NO MULTIPLE QUERIES
  9. END WITH SEMICOLON
  10. If unsure about table/column, output: -- ERROR: [specific missing element]

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
      max_tokens: 256,
    });

    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") throw new Error("Empty LLM response");

    // Step 3: Extract SQL from response
    let sql = extractSqlFromResponse(content);
    if (!sql) {
      // Fallback to raw content if extraction failed
      sql = content.trim();
    }

    // Step 4: Validate initial SQL
    if (validateSqlWithSchema(sql, schema)) {
      return [ensureString(sql)];
    }

    // Step 5: Attempt repair (max 2 attempts)
    let attempts = 0;
    const maxAttempts = 2;
    let repairedSql: string | null = null;

    while (attempts < maxAttempts && !repairedSql) {
      repairedSql = repairSql(sql, schema);
      if (repairedSql && validateSqlWithSchema(repairedSql, schema)) {
        break;
      }
      sql = repairedSql || sql; // Use repaired version for next attempt if available
      attempts++;
    }

    if (repairedSql) {
      return [ensureString(repairedSql)];
    }

    // Step 6: Fallback to rule-based if LLM+repair failed
    console.warn("LLM SQL generation failed after repair attempts, using fallback");
    return fallback;

  } catch (error) {
    console.error("Ollama SQL generation failed", error);
    // Return fallback on any LLM error
    return fallback;
  }
}

/* ======================
   UNCHANGED HELPERS (EXPLANATION, IMPACT, ETC.)
   ====================== */
export function localExplanation(query: string): string {
  const operation = query.trim().match(/^(SELECT|INSERT|UPDATE|DELETE)/i)?.[1]?.toUpperCase();
  const tables = [...query.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([`"\w.]+)/gi)].map((match) => match[1].replace(/[`"]+/g, ""));
  const selectList = query.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM\b/i)?.[1]?.trim();
  const whereClause = query.match(/\bWHERE\s+([\s\S]*?)(?=\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT)\b|;?$)/i)?.[1]?.trim();
  const orderBy = query.match(/\bORDER\s+BY\s+([\s\S]*?)(?=\bLIMIT\b|;?$)/i)?.[1]?.trim();
  const limit = query.match(/\bLIMIT\s+(\d+)/i)?.[1];
  const tableText = tables.length ? `It uses ${tables.join(", ")}.` : "It does not identify a table.";
  if (operation === "SELECT") {
    const attributes = !selectList || selectList === "*" ? "all available columns" : `the selected attributes: ${selectList}`;
    return `Returns ${attributes} from ${tables.join(", ") || "the source table"}. ${whereClause ? `It filters rows where ${whereClause}.` : "It does not apply a row filter."}${orderBy ? ` Results are sorted by ${orderBy}.` : ""}${limit ? ` It returns at most ${limit} row(s).` : ""}`;
  }
  if (operation === "UPDATE") return `Updates records in ${tables.join(", ") || "the target table"}. ${whereClause ? `Only rows where ${whereClause} are changed.` : "There is no WHERE clause, so every row may be updated."}`;
  if (operation === "DELETE") return `Deletes records from ${tables.join(", ") || "the target table"}. ${whereClause ? `Only rows where ${whereClause} are removed.` : "There is no WHERE clause, so every row may be removed."}`;
  if (operation === "INSERT") return `Adds new record(s). ${tableText}`;
  return "The generated text is not a recognized SQL statement.";
}

export function localImpact(query: string): QueryImpact {
  const operation = query.trim().match(/^(SELECT|INSERT|UPDATE|DELETE)/i)?.[1]?.toUpperCase();
  const hasWhere = /\bWHERE\b/i.test(query);
  const limit = query.match(/\bLIMIT\s+(\d+)/i)?.[1];
  if (operation === "DELETE" || operation === "UPDATE") {
    const risky = !hasWhere;
    return { 
      warnings: risky ? [`${operation} has no WHERE clause and may change every row.`] : ["Review the matching rows before executing this write operation."], 
      estimatedRows: risky ? "All rows in the target table" : "Depends on rows matching the filter", 
      riskLevel: risky ? "high" : "medium", 
      analysis: risky ? "This is a broad data-changing operation." : "This is a filtered data-changing operation; confirm the preview before execution." 
    };
  }
  if (operation === "INSERT") return { warnings: [], estimatedRows: "1 or more rows", riskLevel: "medium", analysis: "This inserts data. Verify required columns and constraints first." };
  if (operation === "SELECT") return { 
    warnings: hasWhere ? [] : ["No WHERE clause may return a large result set."], 
    estimatedRows: limit ? `${limit} rows at most` : "Depends on the table size and filters", 
    riskLevel: hasWhere || limit ? "low" : "medium", 
    analysis: "Read-only query; no database records will be changed." 
  };
  return { warnings: ["The SQL statement could not be validated."], estimatedRows: "Unknown", riskLevel: "high", analysis: "Only SELECT, INSERT, UPDATE, and DELETE statements are supported." };
}

export function explainSQLQuery(query: string, schema: string): Promise<string> {
  if (!ENV.ollamaAuxiliaryAi) return Promise.resolve(localExplanation(query));
  const systemPrompt = `You are an expert SQL query explainer. Your task is to explain SQL queries in simple, clear language.

When explaining:
1. Describe what the query does in plain English
2. Explain each major clause (SELECT, WHERE, JOIN, GROUP BY, etc.)
3. Highlight any special operations or optimizations
4. Note potential performance implications
5. Keep explanations concise but thorough

Database schema context:
${schema}`;

  return invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Explain this SQL query:\n\n${query}` },
    ],
    max_tokens: 1500,
  }).then(response => {
    const content = response.choices[0]?.message.content;
    return typeof content === "string" && content.trim() ? content : localExplanation(query);
  }).catch(() => localExplanation(query));
}

export function analyzeQueryImpact(
  query: string,
  schema: string
): Promise<QueryImpact> {
  if (!ENV.ollamaAuxiliaryAi) return Promise.resolve(localImpact(query));
  const systemPrompt = `You are a SQL query analyzer. Analyze the provided query for potential issues and estimate its impact.

Return a JSON object with:
{
  "warnings": ["array of potential issues or risky operations"],
  "estimatedRows": "estimated number of rows affected/returned",
  "riskLevel": "low|medium|high",
  "analysis": "brief analysis of query impact"
}

Focus on:
1. Missing WHERE clauses in UPDATE/DELETE
2. Potential performance issues
3. Data loss risks
4. Locking implications

Database schema:
${schema}`;

  return invokeLLM({
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
  }).then(response => {
    try {
      const content = response.choices[0]?.message.content;
      if (!content || typeof content !== "string") throw new Error("No response from LLM");
      return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")) as QueryImpact;
    } catch (error) {
      console.error("Failed to parse query analysis:", error);
      return localImpact(query);
    }
  }).catch(() => localImpact(query));
}

export function generateCode(prompt: string, language: string): Promise<string> {
  const systemPrompt = `You are an expert ${language} programmer. Return only complete, runnable code that fulfills the user's request. Do not include markdown fences or explanations.`;

  return invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    max_tokens: 2500,
  }).then(response => {
    const content = response.choices[0]?.message.content;
    return typeof content === "string" ? content.trim() : "";
  }).catch(() => "");
}

export function explainCode(code: string, language: string): Promise<string> {
  const systemPrompt = `You are an expert ${language} code explainer. Your task is to explain code in simple, clear language.

When explaining:
1. Describe what the code does overall
2. Break down key sections and their purpose
3. Explain important algorithms or patterns
4. Note any potential improvements
5. Keep explanations concise but thorough`;

  return invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Explain this ${language} code:\n\n${code}` },
    ],
    max_tokens: 1500,
  }).then(response => {
    const content = response.choices[0]?.message.content;
    return typeof content === "string" ? content : "";
  }).catch(() => "");
}

export function debugCode(
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

  return invokeLLM({
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
  }).then(response => {
    try {
      const content = response.choices[0]?.message.content;
      if (!content || typeof content !== "string") throw new Error("No response from LLM");
      return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")) as {
        issues: string[];
        correctedCode: string;
        explanation: string;
      };
    } catch (error) {
      console.error("Failed to parse debug response:", error);
      return {
        issues: ["Unable to debug code"],
        correctedCode: code,
        explanation: "Could not parse debug response",
      };
    }
  }).catch(() => ({
    issues: ["Unable to debug code"],
    correctedCode: code,
    explanation: "Could not parse debug response",
  }));
}

export function optimizeCode(code: string, language: string): Promise<string> {
  const systemPrompt = `You are an expert ${language} code optimizer. Your task is to improve code for performance, readability, and maintainability.

When optimizing:
1. Return ONLY the optimized code
2. Preserve the original functionality
3. Use modern ${language} patterns and features
4. Improve performance where possible
5. Enhance code clarity`;

  return invokeLLM({
    model: ENV.llmModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Optimize this ${language} code:\n\n${code}` },
    ],
    max_tokens: 2500,
  }).then(response => {
    const content = response.choices[0]?.message.content;
    return typeof content === "string" ? content : "";
  }).catch(() => "");
}
