export type SqlValidation = {
  valid: boolean;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | null;
  tables: string[];
  columns: string[];
  errors: string[];
  warnings: string[];
  suggestions: string[];
};

const supportedOperations = /^(SELECT|INSERT|UPDATE|DELETE)\b/i;
const dangerousKeywords = /\b(?:ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|HANDLER|LOAD\s+DATA|INTO\s+OUTFILE|INTO\s+DUMPFILE|SET\s+GLOBAL|KILL|SHUTDOWN)\b|--|\/\*/i;

function normalize(identifier: string) {
  return identifier.replace(/[`"']/g, "").split(".").pop()?.toLowerCase() ?? "";
}

function schemaTables(schema: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const matches = schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([\w.]+)[`"]?\s*\(([\s\S]*?)\);/gi);
  for (const match of matches) {
    const columns = new Set<string>();
    for (const definition of match[2].split(",")) {
      const candidate = definition.trim().match(/^[`"]?([A-Za-z_]\w*)[`"]?\s+/)?.[1];
      if (candidate && !/^(PRIMARY|FOREIGN|CONSTRAINT|UNIQUE|CHECK|KEY|INDEX)$/i.test(candidate)) columns.add(candidate.toLowerCase());
    }
    tables.set(normalize(match[1]), columns);
  }
  return tables;
}

function extractTables(query: string): string[] {
  return Array.from(new Set(Array.from(query.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([`"\w.]+)/gi), match => normalize(match[1]))));
}

function extractColumns(query: string): string[] {
  const columns = new Set<string>();
  for (const clause of query.matchAll(/\b(?:WHERE|ON|SET|ORDER\s+BY|GROUP\s+BY|HAVING)\s+([\s\S]*?)(?=\b(?:WHERE|ON|SET|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|$))/gi)) {
    for (const match of clause[1].matchAll(/(?:\b\w+\.)?[`"]?([A-Za-z_]\w*)[`"]?\s*(?:=|<>|!=|<=|>=|<|>|LIKE|IN\b|IS\b)/gi)) columns.add(match[1].toLowerCase());
  }
  return Array.from(columns);
}

export function validateSql(query: string, schema = ""): SqlValidation {
  const statement = query.trim().replace(/;\s*$/, "");
  const operation = statement.match(supportedOperations)?.[1]?.toUpperCase() as SqlValidation["operation"] | undefined;
  const tables = extractTables(statement);
  const columns = extractColumns(statement);
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!operation) errors.push("Start the query with SELECT, INSERT, UPDATE, or DELETE.");
  if (statement.includes(";")) errors.push("Only one SQL statement can be run at a time.");
  if (dangerousKeywords.test(statement)) errors.push("The query contains an unsupported or unsafe SQL operation.");
  if ((operation === "UPDATE" || operation === "DELETE") && !/\bWHERE\b/i.test(statement)) warnings.push(`${operation} has no WHERE clause and can affect every row.`);
  if (operation === "SELECT" && !/\bLIMIT\s+\d+/i.test(statement)) warnings.push("No LIMIT clause is present; a large table may return many rows.");
  if (/^\s*SELECT\s+\*/i.test(statement)) suggestions.push("Select only the columns you need instead of SELECT *.");
  if (/\bJOIN\b/i.test(statement) && !/\bON\b|\bUSING\b/i.test(statement)) errors.push("A JOIN needs an ON or USING condition.");
  if (/\bORDER\s+BY\b/i.test(statement) && !/\bLIMIT\b/i.test(statement)) suggestions.push("Add LIMIT when you only need the first results after ordering.");

  const knownTables = schemaTables(schema);
  if (knownTables.size > 0) {
    for (const table of tables) if (!knownTables.has(table)) errors.push(`Table '${table}' is not present in the selected schema.`);
    if (tables.length === 1) {
      const knownColumns = knownTables.get(tables[0]);
      for (const column of columns) if (knownColumns && !knownColumns.has(column)) errors.push(`Column '${column}' is not present in table '${tables[0]}'.`);
    }
  }

  return { valid: errors.length === 0, operation: operation ?? null, tables, columns, errors, warnings, suggestions };
}

export function optimizeSql(query: string): string[] {
  const advice: string[] = [];
  if (/^\s*SELECT\s+\*/i.test(query)) advice.push("Replace SELECT * with the specific columns required by the screen or report.");
  if (/\bWHERE\s+([`"\w.]+)/i.test(query)) advice.push("Consider an index on the columns used in WHERE, JOIN, and ORDER BY clauses.");
  if (/\bORDER\s+BY\b/i.test(query) && !/\bLIMIT\b/i.test(query)) advice.push("Ordering a full table can be expensive; use LIMIT where appropriate.");
  if (/\b(?:UPDATE|DELETE)\b/i.test(query) && !/\bWHERE\b/i.test(query)) advice.push("Add a selective WHERE clause before executing this data-changing query.");
  if (/\bJOIN\b/gi.test(query) && (query.match(/\bJOIN\b/gi)?.length ?? 0) > 2) advice.push("Review each join and remove joins whose columns are not selected or filtered.");
  return advice.length ? advice : ["No obvious optimization issue was detected. Verify the execution plan against your database before deploying."];
}
