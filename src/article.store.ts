import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArticleDraft } from "./article.schema.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "articles.json");

async function readAll(): Promise<ArticleDraft[]> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(drafts: ArticleDraft[]) {
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

export const getArticleDrafts = () => locked(readAll).then((drafts) => drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
export const getArticleDraft = async (id: string) => (await getArticleDrafts()).find((draft) => draft.id === id);

export const addArticleDraft = (draft: Omit<ArticleDraft, "id" | "createdAt" | "updatedAt" | "status" | "attempts">) =>
  locked(async () => {
    const now = new Date().toISOString();
    const saved: ArticleDraft = { ...draft, id: randomUUID(), status: "draft", attempts: 0, createdAt: now, updatedAt: now };
    await writeAll([saved, ...(await readAll())]);
    return saved;
  });

export const updateArticleDraft = (id: string, update: (draft: ArticleDraft) => ArticleDraft | null) =>
  locked(async () => {
    const all = await readAll();
    const index = all.findIndex((draft) => draft.id === id);
    const current = all[index];
    if (!current) return null;
    const next = update(current);
    if (!next) return null;
    all[index] = { ...next, updatedAt: new Date().toISOString() };
    await writeAll(all);
    return all[index]!;
  });

export const deleteUnpublishedArticleDraft = (id: string) =>
  locked(async () => {
    const all = await readAll();
    const index = all.findIndex((draft) => draft.id === id);
    if (index === -1 || all[index]!.status === "published") return null;
    const [deleted] = all.splice(index, 1);
    await writeAll(all);
    return deleted!;
  });
