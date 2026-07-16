import axios from "axios";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";
export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };
export type FileContent = { type: "file_url"; file_url: { url: string; mime_type?: string } };
export type MessageContent = string | TextContent | ImageContent | FileContent;
export type Message = { role: Role; content: MessageContent | MessageContent[]; name?: string; tool_call_id?: string };
export type Tool = { type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } };
export type ToolChoice = "none" | "auto" | "required" | { name: string } | { type: "function"; function: { name: string } };
export type JsonSchema = { name: string; schema: Record<string, unknown>; strict?: boolean };
export type OutputSchema = JsonSchema;
export type ResponseFormat = { type: "text" } | { type: "json_object" } | { type: "json_schema"; json_schema: JsonSchema };
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
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{ index: number; message: { role: Role; content: string; tool_calls?: ToolCall[] }; finish_reason: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

type OllamaGenerateResponse = {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};

const toText = (content: MessageContent | MessageContent[]): string =>
  (Array.isArray(content) ? content : [content])
    .map(part => typeof part === "string" ? part : part.type === "text" ? part.text : JSON.stringify(part))
    .join("\n");

const getSchema = (params: InvokeParams): JsonSchema | undefined => {
  const format = params.responseFormat ?? params.response_format;
  return format?.type === "json_schema" ? format.json_schema : params.outputSchema ?? params.output_schema;
};

const buildPrompt = (params: InvokeParams): string => {
  const conversation = params.messages
    .map(message => `${message.role.toUpperCase()}:\n${toText(message.content)}`)
    .join("\n\n");
  const schema = getSchema(params);
  if (!schema) return conversation;

  return `${conversation}\n\nReturn only valid JSON. It must conform exactly to this JSON schema:\n${JSON.stringify(schema.schema)}`;
};

/** Uses a locally running Ollama model while retaining the app's existing LLM response shape. */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const model = params.model ?? ENV.llmModel;
  const requestedMaxTokens = params.max_tokens ?? params.maxTokens;
  const maxTokens = typeof requestedMaxTokens === "number"
    ? Math.min(requestedMaxTokens, ENV.ollamaMaxTokens)
    : ENV.ollamaMaxTokens;

  try {
    const { data } = await axios.post<OllamaGenerateResponse>(
      `${ENV.ollamaBaseUrl.replace(/\/$/, "")}/api/generate`,
      {
        model,
        prompt: buildPrompt(params),
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.1,
          num_predict: maxTokens,
        },
      },
      { timeout: ENV.ollamaTimeoutMs }
    );

    const promptTokens = data.prompt_eval_count ?? 0;
    const completionTokens = data.eval_count ?? 0;
    return {
      id: crypto.randomUUID(),
      created: Math.floor(Date.now() / 1000),
      model: data.model || model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: data.response.trim() },
        finish_reason: data.done ? "stop" : null,
      }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail = typeof error.response?.data === "string" ? error.response.data : JSON.stringify(error.response?.data ?? error.message);
      throw new Error(`Ollama request failed: ${detail}`);
    }
    throw error;
  }
}

export type ModelInfo = { id: string; object: string; created: number; owned_by: string };
export type ModelsResponse = { object: string; data: ModelInfo[] };

export async function listLLMModels(): Promise<ModelsResponse> {
  try {
    const { data } = await axios.get<{ models?: Array<{ name: string }> }>(`${ENV.ollamaBaseUrl.replace(/\/$/, "")}/api/tags`, { timeout: 10_000 });
    return {
      object: "list",
      data: (data.models ?? []).map(model => ({ id: model.name, object: "model", created: 0, owned_by: "ollama" })),
    };
  } catch {
    return { object: "list", data: [{ id: ENV.llmModel, object: "model", created: 0, owned_by: "ollama" }] };
  }
}
