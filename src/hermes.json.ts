import { hermesDispatcher, hermesSignal } from "./ai.limits.js";

export class HermesOutputError extends Error {
  override name = "HermesOutputError";
}

export class HermesUpstreamError extends Error {
  override name = "HermesUpstreamError";
}

function upstreamFailureMessage(output: string): string | null {
  const compact = output.trim().replace(/\s+/g, " ");
  const looksLikeJSON = /^(?:```(?:json)?\s*)?[\[{]/i.test(compact);
  if (looksLikeJSON) return null;
  if (/^api call failed after \d+ retries\b/i.test(compact) ||
      /\b(?:request|operation|upstream)\b.{0,50}\b(?:timed out|timeout)\b/i.test(compact) ||
      /\b(?:gateway timeout|service unavailable|rate limit(?:ed)?)\b/i.test(compact)) {
    return "Hermes upstream generation timed out before producing JSON. Please try again.";
  }
  return null;
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
    if (!response.ok) {
      const responseBody = await response.text();
      if (response.status === 408 || response.status === 504) {
        throw new HermesUpstreamError(
          `Hermes upstream generation timed out (HTTP ${response.status}). Please try again.`
        );
      }
      throw new Error(`Hermes API failed (${response.status}): ${responseBody}`);
    }
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
      error?: string | { message?: unknown };
    };
    if (data.error) {
      const upstreamDetail = typeof data.error === "string" ? data.error : data.error.message;
      throw new HermesUpstreamError(
        typeof upstreamDetail === "string" && upstreamDetail.trim()
          ? `Hermes upstream generation failed: ${upstreamDetail.trim().slice(0, 500)}`
          : "Hermes upstream generation failed before producing JSON. Please try again."
      );
    }
    const output = data.choices?.[0]?.message?.content;
    if (typeof output === "string") {
      const upstreamFailure = upstreamFailureMessage(output);
      if (upstreamFailure) throw new HermesUpstreamError(upstreamFailure);
    }
    try {
      if (typeof output !== "string" || !output.trim()) throw new Error("Hermes returned no message content");
      return validate(output);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (attempt === 1) throw new HermesOutputError(`Hermes output remained invalid after one repair: ${detail.slice(0, 1500)}`);
      requestSignal.throwIfAborted();
      const syntaxFailure = error instanceof SyntaxError
        && typeof output === "string"
        && /^[\s\uFEFF]*(?:```(?:json)?\s*)?[\[{]/i.test(output);
      console.warn(`Hermes output failed validation; requesting one ${syntaxFailure ? "syntax" : "schema/content"} repair:`, detail.slice(0, 500));
      if (typeof output === "string" && output.trim()) messages.push({ role: "assistant", content: output.slice(0, 24000) });
      messages.push({ role: "user", content: syntaxFailure
        ? `JSON SYNTAX REPAIR:\nCorrect only the syntax of your immediately preceding JSON response. Preserve every value and field; do not rethink or regenerate the strategy. Ensure commas separate every array item and object property and close every bracket, brace and quote. Return the complete corrected JSON object only.\nValidation error: ${detail.slice(0, 1500)}`
        : `${prompt}\n\nJSON CONTRACT REPAIR:\nYour previous response did not satisfy the backend JSON contract. Validation error: ${detail.slice(0, 1500)}\nReturn the COMPLETE required JSON object now, with every required field and the assigned content theme and visual treatment. Use the original supplied catalog, website, GA4 and history as the only evidence; your previous response is not evidence. Do not invent facts to fill missing fields. Do not run research, tools or skills again, write files, or produce a report. Correct formatting/schema errors and any invalid selections. Return JSON only.${contract}` });
    }
  }
  throw new HermesOutputError("Hermes returned no valid JSON");
}
