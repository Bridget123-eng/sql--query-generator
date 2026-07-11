import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createSchemaDefinition,
  getSchemaDefinitionsByUserId,
  getSchemaDefinitionById,
  updateSchemaDefinition,
  deleteSchemaDefinition,
} from "../db";

export const schemasRouter = router({
  /**
   * Create a new schema definition
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        schema: z.string().min(1),
        format: z.enum(["sql", "json"]).default("sql"),
        description: z.string().optional(),
        isDefault: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createSchemaDefinition({
          userId: ctx.user.id,
          name: input.name,
          schema: input.schema,
          format: input.format,
          description: input.description,
          isDefault: input.isDefault,
        });

        const schemaId = (result as any)?.insertId || 0;
        return { id: schemaId, ...input };
      } catch (error) {
        console.error("Schema creation error:", error);
        throw new Error("Failed to create schema");
      }
    }),

  /**
   * List all schemas for current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const schemas = await getSchemaDefinitionsByUserId(ctx.user.id);
      return schemas;
    } catch (error) {
      console.error("Schema list error:", error);
      throw new Error("Failed to fetch schemas");
    }
  }),

  /**
   * Get a specific schema
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      try {
        const schema = await getSchemaDefinitionById(input.id);
        if (!schema) {
          throw new Error("Schema not found");
        }
        return schema;
      } catch (error) {
        console.error("Schema get error:", error);
        throw new Error("Failed to fetch schema");
      }
    }),

  /**
   * Update a schema
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        schema: z.string().min(1).optional(),
        description: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify ownership
        const schema = await getSchemaDefinitionById(input.id);
        if (!schema || schema.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.schema !== undefined) updateData.schema = input.schema;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;

        await updateSchemaDefinition(input.id, updateData);
        return { id: input.id, ...updateData };
      } catch (error) {
        console.error("Schema update error:", error);
        throw new Error("Failed to update schema");
      }
    }),

  /**
   * Delete a schema
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify ownership
        const schema = await getSchemaDefinitionById(input.id);
        if (!schema || schema.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        await deleteSchemaDefinition(input.id);
        return { success: true };
      } catch (error) {
        console.error("Schema delete error:", error);
        throw new Error("Failed to delete schema");
      }
    }),
});
