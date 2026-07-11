import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import {
  generateSQLQuery,
  explainSQLQuery,
  analyzeQueryImpact,
  generateCode,
  explainCode,
  debugCode,
  optimizeCode,
} from "../llm-helpers";
import {
  createQueryHistory,
  getQueryHistoryByUserId,
  updateQueryHistory,
  createCodeSnippet,
  getCodeSnippetsByUserId,
  getSchemaDefinitionById,
  createExecutionResult,
  getDb,
} from "../db";
import { queryHistory, executionResults } from "../../drizzle/schema";
import { executeMySqlQuery, inspectMySqlSchema, isTargetDatabaseConfigured } from "../target-database";

export const assistantRouter = router({
  /**
   * SQL Query Execution
   */
  executeSQL: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        schemaId: z.number().optional(),
        customSchema: z.string().optional(),
        queryHistoryId: z.number().optional(),
        isReadOnly: z.boolean().default(true), // Safety flag
      })
    )
    .mutation(async ({ ctx, input }) => {
      const statement = input.query.trim();
      const operation = statement.match(/^(SELECT|INSERT|UPDATE|DELETE)\b/i)?.[1]?.toUpperCase();
      if (!operation || statement.replace(/;\s*$/, "").includes(";")) {
        throw new Error("Only one SELECT, INSERT, UPDATE, or DELETE statement can be executed at a time.");
      }
      if (input.isReadOnly && operation !== "SELECT") {
        throw new Error("Write queries require explicit confirmation before execution.");
      }

      try {
        const startedAt = Date.now();
        let rowsAffected = 0;
        let rowsReturned = 0;
        let result: any = null;
        let error: string | null = null;
        let executionTimeMs = 0;
        let simulated = !isTargetDatabaseConfigured();

        if (isTargetDatabaseConfigured()) {
          const executed = await executeMySqlQuery(statement);
          rowsAffected = executed.rowsAffected;
          rowsReturned = executed.rowsReturned;
          result = executed.result;
          executionTimeMs = executed.executionTimeMs;
        } else if (operation === "SELECT") {
          const limit = Number(statement.match(/\bLIMIT\s+(\d+)/i)?.[1] ?? 25);
          rowsReturned = Math.min(Math.max(limit, 1), 100);
          result = [{ preview: "No database connection configured", query: statement }];
        } else if (operation === "UPDATE" || operation === "DELETE") {
          result = { preview: "Write query validated but not run: configure a database connection to execute it." };
        } else if (operation === "INSERT") {
          rowsAffected = 1;
          result = { preview: "Insert query validated but not run: configure a database connection to execute it." };
        }
        if (simulated) executionTimeMs = Date.now() - startedAt;

        // Record execution result
        if (input.queryHistoryId) {
          await createExecutionResult({
            queryHistoryId: input.queryHistoryId,
            rowsAffected,
            rowsReturned,
            result: result ? JSON.stringify(result) : undefined,
           error: error ?? undefined,
          });
          await updateQueryHistory(input.queryHistoryId, { executedAt: new Date() });
        }

        return { rowsAffected, rowsReturned, result, error, simulated, executionTimeMs };
      } catch (e: any) {
        console.error("SQL execution error:", e);
        const errorMessage = e.message || "Failed to execute query";
        if (input.queryHistoryId) {
          await createExecutionResult({
            queryHistoryId: input.queryHistoryId,
            rowsAffected: 0,
            rowsReturned: 0,
          result: undefined,
            error: errorMessage,
          });
          await updateQueryHistory(input.queryHistoryId, { executedAt: new Date() });
        }
        throw new Error(errorMessage);
      }
    }),
  /**
   * SQL Query Generation
   */
  generateSQL: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        schemaId: z.number().optional(),
        customSchema: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schema = input.customSchema || (input.schemaId ? await getSchemaDefinitionById(input.schemaId) : null);
      const discoveredSchema = !schema && isTargetDatabaseConfigured() ? await inspectMySqlSchema() : null;
      const schemaText = schema ? (typeof schema === "object" ? schema.schema : schema) : (discoveredSchema?.schema ?? "No schema provided");

      try {
        // Create query history record
        const historyRecord = await createQueryHistory({
          userId: ctx.user.id,
          type: "sql",
          input: input.prompt,
          schemaId: input.schemaId,
        });

        const historyId = (historyRecord as any)?.insertId || 0;

        // Generate SQL query
        const queries = await generateSQLQuery(input.prompt, schemaText);

        // For now, let's assume the first query is the primary one for initial analysis
        const primaryQuery = queries[0] || "";
        const analysis = await analyzeQueryImpact(primaryQuery, schemaText);

        // Extract tables involved (a simple regex for now, can be improved)
        const tablesInvolvedMatch = primaryQuery.match(/(?:FROM|JOIN)\s+([`"\w\d\.]+)/gi);
        const tablesInvolved = tablesInvolvedMatch ? Array.from(new Set(tablesInvolvedMatch.map(m => m.split(/\s+/)[1].replace(/[`"']/g, "")))).join(", ") : "Unknown";

        // Update history with generated queries and initial analysis
        if (historyId) {
          await updateQueryHistory(historyId, {
            query: JSON.stringify(queries),
            explanation: analysis.analysis, // Use analysis as initial explanation
            tablesInvolved: tablesInvolved,
            affectedRows: parseInt(analysis.estimatedRows) || 0,
            returnedRows: parseInt(analysis.estimatedRows) || 0, // Assuming for SELECT, estimatedRows is returnedRows
          });
        }

        return { queries, historyId, analysis };
      } catch (error) {
        console.error("SQL generation error:", error);
        throw new Error("Failed to generate SQL query");
      }
    }),

  /** Read tables, columns, primary keys, and foreign keys from the configured MySQL database. */
  inspectMySQLSchema: protectedProcedure.query(async () => {
    if (!isTargetDatabaseConfigured()) {
      return { configured: false, database: null, schema: null };
    }
    const discovered = await inspectMySqlSchema();
    return { configured: true, ...discovered };
  }),

  /**
   * SQL Query Explanation
   */
  explainSQL: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        queryIndex: z.number().optional(), // To select a specific query from the generated list
        schemaId: z.number().optional(),
        customSchema: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const schema = input.customSchema || (input.schemaId ? await getSchemaDefinitionById(input.schemaId) : null);
      const schemaText = schema ? (typeof schema === "object" ? schema.schema : schema) : "No schema provided";

      try {
        let queryToExplain = input.query;
        // If the query is a JSON string, parse it and select the appropriate query
        if (queryToExplain.startsWith("[") && queryToExplain.endsWith("]")) {
          const queries = JSON.parse(queryToExplain);
          if (Array.isArray(queries) && queries.length > 0) {
            queryToExplain = queries[input.queryIndex || 0];
          }
        }
        const explanation = await explainSQLQuery(queryToExplain, schemaText);
        return { explanation };
      } catch (error) {
        console.error("SQL explanation error:", error);
        throw new Error("Failed to explain SQL query");
      }
    }),

  /**
   * Query Impact Analysis
   */
  analyzeSQL: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        queryIndex: z.number().optional(), // To select a specific query from the generated list
        schemaId: z.number().optional(),
        customSchema: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const schema = input.customSchema || (input.schemaId ? await getSchemaDefinitionById(input.schemaId) : null);
      const schemaText = schema ? (typeof schema === "object" ? schema.schema : schema) : "No schema provided";

      try {
        let queryToAnalyze = input.query;
        // If the query is a JSON string, parse it and select the appropriate query
        if (queryToAnalyze.startsWith("[") && queryToAnalyze.endsWith("]")) {
          const queries = JSON.parse(queryToAnalyze);
          if (Array.isArray(queries) && queries.length > 0) {
            queryToAnalyze = queries[input.queryIndex || 0];
          }
        }
        const analysis = await analyzeQueryImpact(queryToAnalyze, schemaText);
        return analysis;
      } catch (error) {
        console.error("Query analysis error:", error);
        throw new Error("Failed to analyze query");
      }
    }),

  /**
   * Code Generation
   */
  generateCode: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        language: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const code = await generateCode(input.prompt, input.language);

        // Store in code snippets
        const snippet = await createCodeSnippet({
          userId: ctx.user.id,
          input: input.prompt,
          code,
          language: input.language,
          type: "generated",
        });

        const snippetId = (snippet as any)?.insertId || 0;

        return { code, snippetId };
      } catch (error) {
        console.error("Code generation error:", error);
        throw new Error("Failed to generate code");
      }
    }),

  /**
   * Code Explanation
   */
  explainCode: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1),
        language: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      try {
        const explanation = await explainCode(input.code, input.language);
        return { explanation };
      } catch (error) {
        console.error("Code explanation error:", error);
        throw new Error("Failed to explain code");
      }
    }),

  /**
   * Code Debugging
   */
  debugCode: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1),
        language: z.string().min(1),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await debugCode(input.code, input.language, input.errorMessage);

        // Store corrected code
        const snippet = await createCodeSnippet({
          userId: ctx.user.id,
          input: input.code,
          code: result.correctedCode,
          language: input.language,
          explanation: result.explanation,
          type: "debugged",
        });

        const snippetId = (snippet as any)?.insertId || 0;

        return { ...result, snippetId };
      } catch (error) {
        console.error("Code debugging error:", error);
        throw new Error("Failed to debug code");
      }
    }),

  /**
   * Code Optimization
   */
  optimizeCode: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1),
        language: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const optimized = await optimizeCode(input.code, input.language);

        // Store optimized code
        const snippet = await createCodeSnippet({
          userId: ctx.user.id,
          input: input.code,
          code: optimized,
          language: input.language,
          type: "optimized",
        });

        const snippetId = (snippet as any)?.insertId || 0;

        return { code: optimized, snippetId };
      } catch (error) {
        console.error("Code optimization error:", error);
        throw new Error("Failed to optimize code");
      }
    }),

  /**
   * Get Query History
   */
  getQueryHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        const history = await getQueryHistoryByUserId(ctx.user.id, input.limit);
        return history;
      } catch (error) {
        console.error("Query history error:", error);
        throw new Error("Failed to fetch query history");
      }
    }),

  /**
   * Get Code Snippets
   */
  getCodeSnippets: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        const snippets = await getCodeSnippetsByUserId(ctx.user.id, input.limit);
        return snippets;
      } catch (error) {
        console.error("Code snippets error:", error);
        throw new Error("Failed to fetch code snippets");
      }
    }),

  getExecutionResults: protectedProcedure
    .input(z.object({ queryHistoryId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // Verify ownership
        const history = await db
          .select()
          .from(queryHistory)
          .where(eq(queryHistory.id, input.queryHistoryId))
          .limit(1);
          
        if (history.length === 0 || history[0].userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        
        const results = await db
          .select()
          .from(executionResults)
          .where(eq(executionResults.queryHistoryId, input.queryHistoryId));
          
        return results;
      } catch (error) {
        console.error("Get execution results error:", error);
        throw new Error("Failed to fetch execution results");
      }
    }),

  deleteQueryHistory: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const result = await db
          .select()
          .from(queryHistory)
          .where(eq(queryHistory.id, input.id))
          .limit(1);
        
        if (result.length === 0 || result[0].userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        
        await db.delete(queryHistory).where(eq(queryHistory.id, input.id));
        return { success: true };
      } catch (error) {
        console.error("Delete query history error:", error);
        throw new Error("Failed to delete query history");
      }
    }),
});
