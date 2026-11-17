import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Reads a JSON array file, treating a missing file as empty.
export async function readJsonArray<T>(file: string): Promise<T[]> {
  await mkdir(path.dirname(file), { recursive: true });
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// Write to a temporary file and rename it, so a crash never leaves a half-written store.
export async function writeJsonAtomic(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}

// Serializes read-modify-write operations per file. Each project has its own files, so one
// brand's writes never wait for (or interleave with) another brand's.
const pending = new Map<string, Promise<unknown>>();
export function withFileLock<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const result = (pending.get(file) ?? Promise.resolve()).then(operation);
  pending.set(file, result.catch(() => undefined));
  return result;
}
