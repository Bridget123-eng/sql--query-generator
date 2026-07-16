import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { ENV } from "./env";
import { isTargetDatabaseConfigured } from "../target-database";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
      llmProvider: "Ollama",
      llmModel: ENV.llmModel,
      databaseConfigured: isTargetDatabaseConfigured(),
    })),
});
