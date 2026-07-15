import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { assistantRouter } from "./routers/assistant";
import { schemasRouter } from "./routers/schemas";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  assistant: assistantRouter,
  schemas: schemasRouter,
});

export type AppRouter = typeof appRouter;
