export const ENV = {
  appId: process.env.VITE_APP_ID ?? (process.env.NODE_ENV === "production" ? "" : "local-sql-assistant"),
  cookieSecret: process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "local-development-secret-change-in-production"),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Local deployments can call OpenAI directly. The existing Forge variables
  // remain supported for the hosted/runtime integration.
  llmApiUrl: process.env.OPENAI_BASE_URL ?? process.env.BUILT_IN_FORGE_API_URL ?? "https://api.openai.com",
  llmApiKey: process.env.OPENAI_API_KEY ?? process.env.BUILT_IN_FORGE_API_KEY ?? "",
  llmModel: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  targetDatabaseUrl: process.env.TARGET_DATABASE_URL ?? "",
};
