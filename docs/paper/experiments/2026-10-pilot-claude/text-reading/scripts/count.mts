import Anthropic from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/@anthropic-ai/sdk/index.mjs";
import { PDFDocument } from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/pdf-lib/cjs/index.js";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const count = async (content: any[]) => (await client.messages.countTokens({ model: "claude-haiku-5-5", messages: [{ role: "user", content: [...content, { type: "text", text: "x" }] }] })).input_tokens;
for (const [file, page, png] of [["synth.pdf", 1, "y-1.png"], ["synth.pdf", 3, "y-3.png"], ["../exp/deck.pdf", 2, "soi-02.png"], ["../exp/deck.pdf", 12, "soi-12.png"]] as const) {
  const doc = await PDFDocument.load(readFileSync(file)); const p = await PDFDocument.create(); p.addPage((await p.copyPages(doc, [page - 1]))[0]);
  const pdf = { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(await p.save()).toString("base64") } };
  const img = { type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(png).toString("base64") } };
  const text = execFileSync("pdftotext", ["-f", String(page), "-l", String(page), "-layout", file, "-"]).toString();
  console.log(file.split("/").pop(), page, "PDF", await count([pdf]), "IMG", await count([img]), "IMG+TXT", await count([img, { type: "text", text }]));
}
