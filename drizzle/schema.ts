import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, longtext, boolean } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Schema Definitions - user-provided database schemas
 */
export const schemaDefinitions = mysqlTable("schemaDefinitions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  schema: longtext("schema").notNull(), // DDL or JSON representation
  format: mysqlEnum("format", ["sql", "json"]).default("sql").notNull(),
  description: text("description"),
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SchemaDefinition = typeof schemaDefinitions.$inferSelect;
export type InsertSchemaDefinition = typeof schemaDefinitions.$inferInsert;

/**
 * Query History - tracks all SQL and code generation requests
 */
export const queryHistory = mysqlTable("queryHistory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["sql", "code"]).notNull(),
  language: varchar("language", { length: 32 }), // e.g., "python", "java", "javascript"
  input: longtext("input").notNull(), // natural language prompt
  query: longtext("query"), // generated SQL or code
  explanation: longtext("explanation"), // AI explanation
  tablesInvolved: text("tablesInvolved"), // Tables identified in the query
  affectedRows: int("affectedRows"), // Estimated or actual affected rows
  returnedRows: int("returnedRows"), // Estimated or actual returned rows
  schemaId: int("schemaId"), // reference to schema used (nullable)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  executedAt: timestamp("executedAt"),
});

export type QueryHistory = typeof queryHistory.$inferSelect;
export type InsertQueryHistory = typeof queryHistory.$inferInsert;

/**
 * Code Snippets - stores generated and debugged code
 */
export const codeSnippets = mysqlTable("codeSnippets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  input: longtext("input").notNull(), // original prompt or code to debug
  code: longtext("code").notNull(), // generated or corrected code
  language: varchar("language", { length: 32 }).notNull(), // python, java, javascript, etc.
  explanation: longtext("explanation"), // explanation of the code
  type: mysqlEnum("type", ["generated", "debugged", "optimized"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CodeSnippet = typeof codeSnippets.$inferSelect;
export type InsertCodeSnippet = typeof codeSnippets.$inferInsert;

/**
 * Execution Results - stores query execution outcomes
 */
export const executionResults = mysqlTable("executionResults", {
  id: int("id").autoincrement().primaryKey(),
  queryHistoryId: int("queryHistoryId").notNull(),
  rowsAffected: int("rowsAffected"),
  rowsReturned: int("rowsReturned"),
  result: longtext("result"), // JSON stringified result data
  error: text("error"), // error message if execution failed
  executedAt: timestamp("executedAt").defaultNow().notNull(),
});

export type ExecutionResult = typeof executionResults.$inferSelect;
export type InsertExecutionResult = typeof executionResults.$inferInsert;

/**
 * Relations
 */
export const userRelations = relations(users, ({ many }) => ({
  queryHistories: many(queryHistory),
  schemaDefinitions: many(schemaDefinitions),
  codeSnippets: many(codeSnippets),
}));

export const queryHistoryRelations = relations(queryHistory, ({ one, many }) => ({
  user: one(users, { fields: [queryHistory.userId], references: [users.id] }),
  schema: one(schemaDefinitions, { fields: [queryHistory.schemaId], references: [schemaDefinitions.id] }),
  executionResults: many(executionResults),
}));

export const schemaDefinitionRelations = relations(schemaDefinitions, ({ one, many }) => ({
  user: one(users, { fields: [schemaDefinitions.userId], references: [users.id] }),
  queryHistories: many(queryHistory),
}));

export const codeSnippetRelations = relations(codeSnippets, ({ one }) => ({
  user: one(users, { fields: [codeSnippets.userId], references: [users.id] }),
}));

export const executionResultRelations = relations(executionResults, ({ one }) => ({
  queryHistory: one(queryHistory, { fields: [executionResults.queryHistoryId], references: [queryHistory.id] }),
}));
