import { and, eq, desc, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  queryHistory,
  schemaDefinitions,
  codeSnippets,
  executionResults,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Query History Functions
 */
export async function createQueryHistory(data: {
  userId: number;
  type: "sql" | "code";
  input: string;
  language?: string;
  schemaId?: number;
}) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(queryHistory).values(data);
  return result;
}

export async function getQueryHistoryByUserId(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(queryHistory)
    .where(and(eq(queryHistory.userId, userId), isNotNull(queryHistory.executedAt)))
    .orderBy((t) => desc(t.createdAt))
    .limit(limit);
}

export async function updateQueryHistory(
  id: number,
  data: { query?: string; explanation?: string; executedAt?: Date; tablesInvolved?: string; affectedRows?: number; returnedRows?: number }
) {
  const db = await getDb();
  if (!db) return null;

  return await db
    .update(queryHistory)
    .set(data)
    .where(eq(queryHistory.id, id));
}

/**
 * Schema Definition Functions
 */
export async function createSchemaDefinition(data: {
  userId: number;
  name: string;
  schema: string;
  format?: "sql" | "json";
  description?: string;
  isDefault?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;

  return await db.insert(schemaDefinitions).values(data);
}

export async function getSchemaDefinitionsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(schemaDefinitions)
    .where(eq(schemaDefinitions.userId, userId))
    .orderBy((t) => desc(t.updatedAt));
}

export async function getSchemaDefinitionById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(schemaDefinitions)
    .where(eq(schemaDefinitions.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateSchemaDefinition(
  id: number,
  data: { name?: string; schema?: string; description?: string; isDefault?: boolean }
) {
  const db = await getDb();
  if (!db) return null;

  return await db
    .update(schemaDefinitions)
    .set(data)
    .where(eq(schemaDefinitions.id, id));
}

export async function deleteSchemaDefinition(id: number) {
  const db = await getDb();
  if (!db) return null;

  return await db
    .delete(schemaDefinitions)
    .where(eq(schemaDefinitions.id, id));
}

/**
 * Code Snippet Functions
 */
export async function createCodeSnippet(data: {
  userId: number;
  input: string;
  code: string;
  language: string;
  explanation?: string;
  type: "generated" | "debugged" | "optimized";
}) {
  const db = await getDb();
  if (!db) return null;

  return await db.insert(codeSnippets).values(data);
}

export async function getCodeSnippetsByUserId(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(codeSnippets)
    .where(eq(codeSnippets.userId, userId))
    .orderBy((t) => desc(t.createdAt))
    .limit(limit);
}

/**
 * Execution Result Functions
 */
export async function createExecutionResult(data: {
  queryHistoryId: number;
  rowsAffected?: number;
  rowsReturned?: number;
  result?: string;
  error?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  return await db.insert(executionResults).values(data);
}

export async function getExecutionResultsByQueryHistoryId(queryHistoryId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(executionResults)
    .where(eq(executionResults.queryHistoryId, queryHistoryId))
    .orderBy((t) => desc(t.executedAt));
}

// TODO: add additional feature queries here as your schema grows.
