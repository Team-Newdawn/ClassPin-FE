import Anthropic from "@anthropic-ai/sdk";
import type { AiContent, AiUsage, InsightAi } from "../insight-ai.ts";

const client = () => {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("ANALYSIS_NOT_CONFIGURED");
  return new Anthropic({ apiKey, maxRetries: 2 });
};
const model = () => process.env.INSIGHT_AI_MODEL || "claude-haiku-5-5";
// Haiku 5.5 bills a whole request at 5x once its prompt (input + cache read + cache write) passes 100K tokens.
const usage = (value: Anthropic.Usage): AiUsage => {
  const cacheRead = value.cache_read_input_tokens ?? 0, cacheWrite = value.cache_creation_input_tokens ?? 0;
  return { input: value.input_tokens, cacheRead, cacheWrite, output: value.output_tokens, overTier: value.input_tokens + cacheRead + cacheWrite > 100_000 };
};
const blocks = (content: AiContent): string | (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] => typeof content === "string" ? content
  : content.map((part) => part.type === "text" ? part : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: part.data } });

/**
 * Long edge (px) for rendering every page so that no image exceeds Claude's 1568px / 1568-token budget;
 * then Claude sees the image unresized and PIN pixel coordinates match what it sees.
 */
export const slideImageEdge = (sizes: readonly { width: number; height: number }[]) => Math.min(...sizes.map(({ width, height }) => {
  const ratio = Math.min(width, height) / Math.max(width, height);
  let edge = 1568;
  // +1px absorbs pdftoppm rounding so the rendered image never crosses a 28px patch boundary.
  while (Math.ceil((edge + 1) / 28) * Math.ceil((edge * ratio + 1) / 28) > 1568) edge--;
  return edge;
}), 1568);

export const claude: InsightAi = {
  name: "claude", model, configured: () => Boolean(process.env.CLAUDE_API_KEY), imageEdge: slideImageEdge,

  async json({ system, schema, content, signal, onUsage }) {
    const message = await client().messages.stream({
      model: model(), max_tokens: 32000, system,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: blocks(content) }],
    }, { signal }).finalMessage();
    onUsage(usage(message.usage));
    if (message.stop_reason === "refusal") throw new Error("AI_REFUSED");
    if (message.stop_reason !== "end_turn") throw new Error("AI_TRUNCATED");
    const block = message.content.find((block) => block.type === "text");
    if (!block) throw new Error("AI_INVALID_OUTPUT");
    try { return JSON.parse(block.text); } catch { throw new Error("AI_INVALID_OUTPUT"); }
  },

  async* chat({ system, context, messages: history, tools: list, runTool, signal, onUsage }) {
    const messages: Anthropic.MessageParam[] = history.map((item) => ({ role: item.role, content: blocks(item.content) }));
    const tools: Anthropic.Tool[] = list.map((tool) => ({ name: tool.name, strict: true, description: tool.description, input_schema: tool.parameters as Anthropic.Tool.InputSchema }));
    let said = false;
    for (let round = 0; ; round++) {
      const stream = client().messages.stream({
        // A propose_document call may carry whole rewritten sections, so the cap is far above a chat answer.
        model: model(), max_tokens: 16000, output_config: { effort: "low" }, tools, tool_choice: { type: round < 3 ? "auto" : "none" },
        // The report context is the same for every question on a report, so it is cached for an hour.
        system: [{ type: "text", text: system }, { type: "text", text: context, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages,
      }, { signal });
      let gap = said;
      for await (const event of stream) {
        if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
        yield (gap ? "\n\n" : "") + event.delta.text; gap = false; said = true;
      }
      const final = await stream.finalMessage();
      onUsage(usage(final.usage));
      // An aborted stream can end without throwing; never let the caller save a cut-off answer.
      signal?.throwIfAborted();
      if (final.stop_reason === "refusal") throw new Error("AI_REFUSED");
      if (final.stop_reason !== "tool_use") return;
      messages.push({ role: "assistant", content: final.content }, { role: "user", content: await Promise.all(final.content.filter((block) => block.type === "tool_use")
        .map(async (block) => ({ type: "tool_result" as const, tool_use_id: block.id, content: blocks(await runTool(block.name, block.input)) }))) });
    }
  },
};
