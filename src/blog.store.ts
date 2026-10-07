import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BlogDraft } from "./blog.schema.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "blogs.json");

async function readAll(): Promise<BlogDraft[]> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(drafts: BlogDraft[]) {
  const temporary = `${DATA_FILE}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(drafts, null, 2));
  await rename(temporary, DATA_FILE);
}

let pending: Promise<unknown> = Promise.resolve();
function locked<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

export const getBlogDrafts = () => locked(readAll).then((d) => d.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
export const getBlogDraft = async (id: string) => (await getBlogDrafts()).find((d) => d.id === id);

export const addBlogDraft = (draft: Omit<BlogDraft, "id" | "createdAt" | "updatedAt" | "status" | "attempts">) =>
  locked(async () => {
    const now = new Date().toISOString();
    const saved: BlogDraft = { ...draft, id: randomUUID(), status: "draft", attempts: 0, createdAt: now, updatedAt: now };
    await writeAll([saved, ...(await readAll())]);
    return saved;
  });

export const updateBlogDraft = (id: string, update: (draft: BlogDraft) => BlogDraft | null) =>
  locked(async () => {
    const all = await readAll();
    const index = all.findIndex((d) => d.id === id);
    const current = all[index];
    if (!current) return null;
    const next = update(current);
    if (!next) return null;
    all[index] = { ...next, updatedAt: new Date().toISOString() };
    await writeAll(all);
    return all[index]!;
  });
