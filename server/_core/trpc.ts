import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
// Kept as an alias so the feature routers remain compact while this local app
// has no sign-in flow.
export const protectedProcedure = publicProcedure;
