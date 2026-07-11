import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { ENV } from "./_core/env";

let pool: Pool | undefined;

export function isTargetDatabaseConfigured(): boolean {
  return Boolean(ENV.targetDatabaseUrl);
}

function getPool(): Pool {
  if (!ENV.targetDatabaseUrl) {
    throw new Error("MySQL is not configured. Set TARGET_DATABASE_URL on the server and restart it.");
  }
  pool ??= createPool({
    uri: ENV.targetDatabaseUrl,
    connectionLimit: 5,
    waitForConnections: true,
    multipleStatements: false,
  });
  return pool;
}

const blockedSql = /\b(?:ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|HANDLER|LOAD\s+DATA|INTO\s+OUTFILE|INTO\s+DUMPFILE|SET\s+GLOBAL|KILL|SHUTDOWN)\b|--|\/\*/i;

function prepareStatement(sql: string): { statement: string; operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" } {
  const statement = sql.trim().replace(/;\s*$/, "");
  const operation = statement.match(/^(SELECT|INSERT|UPDATE|DELETE)\b/i)?.[1]?.toUpperCase() as "SELECT" | "INSERT" | "UPDATE" | "DELETE" | undefined;
  if (!operation || statement.includes(";") || blockedSql.test(statement)) {
    throw new Error("Only one safe SELECT, INSERT, UPDATE, or DELETE statement can be executed.");
  }
  // A bounded read prevents an accidental full result set from exhausting the server or browser.
  return { statement: operation === "SELECT" && !/\bLIMIT\s+\d+/i.test(statement) ? `${statement} LIMIT 500` : statement, operation };
}

export async function inspectMySqlSchema(): Promise<{ database: string; schema: string }> {
  const connection = getPool();
  const [databaseRows] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS databaseName");
  const database = String(databaseRows[0]?.databaseName ?? "");
  if (!database) throw new Error("The MySQL connection does not specify a database name.");

  const [tables] = await connection.query<RowDataPacket[]>(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const definitions: string[] = [];
  for (const { tableName } of tables) {
    const [columns] = await connection.query<RowDataPacket[]>(
      `SELECT column_name AS columnName, column_type AS columnType, is_nullable AS isNullable,
              column_key AS columnKey, column_default AS columnDefault, extra
       FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?
       ORDER BY ordinal_position`,
      [tableName]
    );
    const [foreignKeys] = await connection.query<RowDataPacket[]>(
      `SELECT column_name AS columnName, referenced_table_name AS referencedTable, referenced_column_name AS referencedColumn
       FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL`,
      [tableName]
    );
    const columnLines = columns.map((column) => {
      const attributes = [
        `\`${column.columnName}\` ${column.columnType}`,
        column.isNullable === "NO" ? "NOT NULL" : "",
        column.columnKey === "PRI" ? "PRIMARY KEY" : "",
        column.extra ?? "",
      ].filter(Boolean).join(" ");
      return `  ${attributes}`;
    });
    for (const foreignKey of foreignKeys) {
      columnLines.push(`  FOREIGN KEY (\`${foreignKey.columnName}\`) REFERENCES \`${foreignKey.referencedTable}\`(\`${foreignKey.referencedColumn}\`)`);
    }
    definitions.push(`CREATE TABLE \`${tableName}\` (\n${columnLines.join(",\n")}\n);`);
  }
  return { database, schema: definitions.join("\n\n") || "-- No tables found in the selected database." };
}

export async function executeMySqlQuery(sql: string): Promise<{ rowsAffected: number; rowsReturned: number; result: unknown; executionTimeMs: number }> {
  const { statement, operation } = prepareStatement(sql);
  const startedAt = performance.now();
  const [result] = await getPool().query<RowDataPacket[] | ResultSetHeader>(statement);
  const executionTimeMs = Math.round(performance.now() - startedAt);
  if (operation === "SELECT") {
    const rows = result as RowDataPacket[];
    return { rowsAffected: 0, rowsReturned: rows.length, result: rows, executionTimeMs };
  }
  const writeResult = result as ResultSetHeader;
  return { rowsAffected: writeResult.affectedRows, rowsReturned: 0, result: { insertId: writeResult.insertId, warningStatus: writeResult.warningStatus }, executionTimeMs };
}
