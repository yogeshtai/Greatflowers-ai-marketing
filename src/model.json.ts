// LLMs sometimes emit raw newlines/tabs inside JSON strings, which JSON.parse rejects.
// Repairing locally is far cheaper than re-running the whole agent call.
function escapeControlCharsInStrings(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      } else if (char < " ") {
        result +=
          char === "\n" ? "\\n" :
          char === "\r" ? "\\r" :
          char === "\t" ? "\\t" :
          `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (char === '"') {
      inString = true;
    }
    result += char;
  }

  return result;
}

// V8 reports the exact offset when an otherwise valid array item or object
// property is missing its separator. Fix only that narrow, deterministic case;
// anything more ambiguous is left for the model repair/validator to handle.
function repairMissingSeparators(text: string): string {
  let repaired = text;

  for (let repairCount = 0; repairCount < 20; repairCount++) {
    try {
      JSON.parse(repaired);
      return repaired;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;

      const match = error.message.match(
        /Expected ',' or '[}\]]' after (?:array element|property value) in JSON at position (\d+)/
      );
      if (!match) throw error;

      const position = Number(match[1]);
      if (!Number.isSafeInteger(position) || position < 1 || position >= repaired.length) {
        throw error;
      }

      repaired = `${repaired.slice(0, position)},${repaired.slice(position)}`;
    }
  }

  throw new SyntaxError("JSON contains too many missing separators to repair safely");
}

export function parseModelJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return JSON.parse(repairMissingSeparators(escapeControlCharsInStrings(text)));
  }
}
