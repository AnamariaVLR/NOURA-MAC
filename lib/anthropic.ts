/**
 * The only place the Anthropic SDK is constructed.
 *
 * With no ANTHROPIC_API_KEY the app does not break and does not pretend: it runs
 * in mock mode, every screen still works, and the mode is shown to the user.
 */
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, apiKey } from "./config";

let client: Anthropic | null = null;

export function anthropic(): Anthropic | null {
  const key = apiKey();
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}

export type ToolCallArgs = {
  system: string;
  messages: Anthropic.MessageParam[];
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens?: number;
};

/**
 * One round trip that must come back as a single tool call. Returns the raw tool
 * input for the caller to validate with Zod — this function never trusts it.
 * Returns null on any failure so callers can fall back rather than throw a 500
 * into the user's face.
 */
export async function callTool(args: ToolCallArgs): Promise<unknown | null> {
  const sdk = anthropic();
  if (!sdk) return null;

  try {
    const response = await sdk.messages.create({
      model: MODEL,
      max_tokens: args.maxTokens ?? 1024,
      system: args.system,
      messages: args.messages,
      tools: [args.tool as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: args.tool.name },
    });

    const block = response.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === args.tool.name,
    );
    return block ? block.input : null;
  } catch (error) {
    console.error("[anthropic] tool call failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
