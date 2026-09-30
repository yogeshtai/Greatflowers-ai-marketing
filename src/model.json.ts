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

export function parseModelJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return JSON.parse(escapeControlCharsInStrings(text));
  }
}
