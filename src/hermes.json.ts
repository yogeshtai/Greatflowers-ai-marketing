import { hermesDispatcher, hermesSignal } from "./ai.limits.js";

export class HermesOutputError extends Error {
  override name = "HermesOutputError";
}

// One format/schema repair, keeping the original evidence and validating both replies.
// The same deadline covers both calls, so recovery cannot double the request timeout.
export async function requestHermesJSON<T>(
  prompt: string,
  validate: (output: string) => T,
  signal?: AbortSignal,
  jsonSchema?: object,
): Promise<T> {
  const apiKey = process.env.HERMES_API_KEY;
  if (!apiKey) throw new Error("HERMES_API_KEY is not configured");
  const requestSignal = hermesSignal(signal);
  const contract = jsonSchema
    ? `\nREQUIRED OUTPUT JSON SCHEMA (exact property names, all required fields):\n${JSON.stringify(jsonSchema)}\nDo not substitute aliases such as productId for selectedProductId. Do not wrap the object in a report or another object.`
    : "";
  const messages = [
    { role: "system", content: "You are responding to a backend API. Return only the complete JSON object specified in the user request, directly in your final response. No Markdown, prose, files or file paths. The API output contract takes precedence over any report-formatting instructions in a skill." + contract },
    { role: "user", content: prompt + contract },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(process.env.HERMES_API_URL || "http://127.0.0.1:8642/v1/chat/completions", {
      method: "POST", signal: requestSignal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "hermes-agent", messages }),
      dispatcher: hermesDispatcher,
    } as RequestInit);
    if (!response.ok) throw new Error(`Hermes API failed (${response.status}): ${await response.text()}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const output = data.choices?.[0]?.message?.content;
    try {
      if (typeof output !== "string" || !output.trim()) throw new Error("Hermes returned no message content");
      return validate(output);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (attempt === 1) throw new HermesOutputError(`Hermes output remained invalid after one repair: ${detail.slice(0, 1500)}`);
      requestSignal.throwIfAborted();
      console.warn("Hermes output failed validation; requesting one JSON repair:", detail.slice(0, 500));
      if (typeof output === "string" && output.trim()) messages.push({ role: "assistant", content: output.slice(0, 24000) });
      messages.push({ role: "user", content: `${prompt}\n\nJSON REPAIR INSTRUCTION:\nYour previous response did not satisfy the backend JSON contract. Validation error: ${detail.slice(0, 1500)}\nReturn the COMPLETE required JSON object now, with every required field and the assigned content theme and visual treatment. Use the original supplied catalog, website, GA4 and history as the only evidence; your previous response is not evidence. Do not invent facts to fill missing fields. Do not run research, tools or skills again, write files, or produce a report. Correct formatting/schema errors and any invalid selections. Return JSON only.${contract}` });
    }
  }
  throw new HermesOutputError("Hermes returned no valid JSON");
}
