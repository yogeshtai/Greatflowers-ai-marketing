import { randomUUID } from "node:crypto";
import type { ArticleDraft } from "./article.schema.js";
import { readJsonArray, withFileLock, writeJsonAtomic } from "./json.file.js";
import { projectDataPath, type ProjectConfig } from "./projects/index.js";

// Each project keeps its own articles.json; GreatFlowers still uses data/articles.json.
const dataFile = (project: ProjectConfig) => projectDataPath(project, "articles.json");
const readAll = (project: ProjectConfig) => readJsonArray<ArticleDraft>(dataFile(project));
const writeAll = (project: ProjectConfig, drafts: ArticleDraft[]) => writeJsonAtomic(dataFile(project), drafts);
const locked = <R>(project: ProjectConfig, operation: () => Promise<R>) => withFileLock(dataFile(project), operation);

export const getArticleDrafts = (project: ProjectConfig) =>
  locked(project, () => readAll(project)).then((drafts) => drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
export const getArticleDraft = async (project: ProjectConfig, id: string) => (await getArticleDrafts(project)).find((draft) => draft.id === id);

export const addArticleDraft = (project: ProjectConfig, draft: Omit<ArticleDraft, "id" | "createdAt" | "updatedAt" | "status" | "attempts">) =>
  locked(project, async () => {
    const now = new Date().toISOString();
    const saved: ArticleDraft = { ...draft, id: randomUUID(), status: "draft", attempts: 0, createdAt: now, updatedAt: now };
    await writeAll(project, [saved, ...(await readAll(project))]);
    return saved;
  });

export const updateArticleDraft = (project: ProjectConfig, id: string, update: (draft: ArticleDraft) => ArticleDraft | null) =>
  locked(project, async () => {
    const all = await readAll(project);
    const index = all.findIndex((draft) => draft.id === id);
    const current = all[index];
    if (!current) return null;
    const next = update(current);
    if (!next) return null;
    all[index] = { ...next, updatedAt: new Date().toISOString() };
    await writeAll(project, all);
    return all[index]!;
  });

// The status check lives inside the file lock so a publish completion and a delete
// cannot both win based on stale state.
export const deleteUnpublishedArticleDraft = (project: ProjectConfig, id: string) =>
  locked(project, async () => {
    const all = await readAll(project);
    const index = all.findIndex((draft) => draft.id === id);
    if (index === -1 || all[index]!.status === "published") return null;
    const [deleted] = all.splice(index, 1);
    await writeAll(project, all);
    return deleted!;
  });
