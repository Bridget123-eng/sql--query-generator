export const ENV = {
  appId: process.env.VITE_APP_ID ?? (process.env.NODE_ENV === "production" ? "" : "local-sql-assistant"),
  cookieSecret: process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "local-development-secret-change-in-production"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  llmApiKey: process.env.GEMINI_API_KEY ?? "",
  llmModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  targetDatabaseUrl: process.env.TARGET_DATABASE_URL ?? "",
};
