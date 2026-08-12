import { aiConfig } from "@/lib/ai-config";

interface ClaudeJsonRequest {
  system: string;
  userMessage: string;
  maxTokens: number;
  temperature: number;
  jsonSchema: Record<string, unknown>;
}

interface ClaudeTextBlock {
  type: string;
  text?: string;
}

interface ClaudeMessageResponse {
  content?: ClaudeTextBlock[];
  stop_reason?: string | null;
}

export async function callClaudeJson({
  system,
  userMessage,
  maxTokens,
  temperature,
  jsonSchema,
}: ClaudeJsonRequest): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Anthropic API key not configured");

  const configuredBaseUrl = process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com";
  const baseUrl = configuredBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": aiConfig.apiVersion,
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL?.trim() || aiConfig.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        format: {
          type: "json_schema",
          schema: jsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as ClaudeMessageResponse;
  if (data.stop_reason === "max_tokens") {
    throw new Error("Claude response exceeded the configured token limit");
  }
  if (data.stop_reason === "refusal") {
    throw new Error("Claude declined to process this conversation");
  }

  const content = data.content
    ?.filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  if (!content) throw new Error("Claude returned an empty response");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Claude response is not valid JSON");
  }
}
