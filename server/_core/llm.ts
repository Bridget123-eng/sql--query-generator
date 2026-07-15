import { GoogleGenAI } from "@google/genai";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = { type: "text"; text: string };
export type ImageContent = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
export type FileContent = {
  type: "file_url";
  file_url: { url: string; mime_type?: string };
};
export type MessageContent = string | TextContent | ImageContent | FileContent;
export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};
export type ToolChoice = "none" | "auto" | "required" | { name: string } | {
  type: "function";
  function: { name: string };
};
export type JsonSchema = { name: string; schema: Record<string, unknown>; strict?: boolean };
export type OutputSchema = JsonSchema;
export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: Role; content: string; tool_calls?: ToolCall[] };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

const assertApiKey = () => {
  if (!ENV.llmApiKey.trim()) throw new Error("GEMINI_API_KEY is not configured");
};

const toText = (content: MessageContent | MessageContent[]): string =>
  (Array.isArray(content) ? content : [content])
    .map(part => typeof part === "string" ? part : part.type === "text" ? part.text : JSON.stringify(part))
    .join("\n");

const toGeminiContents = (messages: Message[]) => messages
  .filter(message => message.role !== "system")
  .map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: toText(message.content) }],
  }));

const getSchema = (params: InvokeParams): JsonSchema | undefined => {
  const format = params.responseFormat ?? params.response_format;
  if (format?.type === "json_schema") return format.json_schema;
  return params.outputSchema ?? params.output_schema;
};

/**
 * Invoke Gemini through Google's native SDK. The result intentionally keeps the
 * former adapter's response shape so existing application features need no UI
 * changes while using only the Gemini Developer API.
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const ai = new GoogleGenAI({ apiKey: ENV.llmApiKey });
  const systemInstruction = params.messages
    .filter(message => message.role === "system")
    .map(message => toText(message.content))
    .join("\n\n");
  const schema = getSchema(params);
  const maxOutputTokens = params.max_tokens ?? params.maxTokens;
  const config: Record<string, unknown> = {
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(typeof maxOutputTokens === "number" ? { maxOutputTokens } : {}),
    ...(schema ? { responseMimeType: "application/json", responseJsonSchema: schema.schema } : {}),
  };

  if (params.tools?.length) {
    config.tools = [{ functionDeclarations: params.tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parametersJsonSchema: tool.function.parameters,
    })) }];
  }

  const response = await ai.models.generateContent({
    model: params.model ?? ENV.llmModel,
    contents: toGeminiContents(params.messages),
    config,
  });
  const toolCalls = response.functionCalls?.map((call, index) => ({
    id: `${response.responseId ?? "gemini"}-${index}`,
    type: "function" as const,
    function: { name: call.name ?? "", arguments: JSON.stringify(call.args ?? {}) },
  }));
  const usage = response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? 0;
  const completionTokens = usage?.candidatesTokenCount ?? 0;

  return {
    id: response.responseId ?? crypto.randomUUID(),
    created: Math.floor(Date.now() / 1000),
    model: response.modelVersion ?? params.model ?? ENV.llmModel,
    choices: [{
      index: 0,
      message: { role: "assistant", content: response.text ?? "", ...(toolCalls?.length ? { tool_calls: toolCalls } : {}) },
      finish_reason: response.candidates?.[0]?.finishReason ?? null,
    }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: usage?.totalTokenCount ?? promptTokens + completionTokens },
  };
}

export type ModelInfo = { id: string; object: string; created: number; owned_by: string };
export type ModelsResponse = { object: string; data: ModelInfo[] };

// The Gemini SDK does not need a model-list request for this application.
// Retain the public helper for callers and return the configured model.
export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();
  return { object: "list", data: [{ id: ENV.llmModel, object: "model", created: 0, owned_by: "google" }] };
}
