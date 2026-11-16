import { randomUUID } from "node:crypto";
import type { WikiDraft } from "./wiki.schema.js";
import { readJsonArray, withFileLock, writeJsonAtomic } from "./json.file.js";
import { projectDataPath, type ProjectConfig } from "./projects/index.js";

// Each project keeps its own wikis.json; GreatFlowers still uses data/wikis.json.
const dataFile = (project: ProjectConfig) => projectDataPath(project, "wikis.json");
const readAll = (project: ProjectConfig) => readJsonArray<WikiDraft>(dataFile(project));
const writeAll = (project: ProjectConfig, drafts: WikiDraft[]) => writeJsonAtomic(dataFile(project), drafts);
const locked = <R>(project: ProjectConfig, operation: () => Promise<R>) => withFileLock(dataFile(project), operation);

export const getWikiDrafts = (project: ProjectConfig) =>
  locked(project, () => readAll(project)).then((drafts) => drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
export const getWikiDraft = async (project: ProjectConfig, id: string) => (await getWikiDrafts(project)).find((draft) => draft.id === id);

export const addWikiDraft = (project: ProjectConfig, draft: Omit<WikiDraft, "id" | "createdAt" | "updatedAt" | "status" | "attempts">) =>
  locked(project, async () => {
    const now = new Date().toISOString();
    const saved: WikiDraft = { ...draft, id: randomUUID(), status: "draft", attempts: 0, createdAt: now, updatedAt: now };
    await writeAll(project, [saved, ...(await readAll(project))]);
    return saved;
  });

export const updateWikiDraft = (project: ProjectConfig, id: string, update: (draft: WikiDraft) => WikiDraft | null) =>
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
export const deleteUnpublishedWikiDraft = (project: ProjectConfig, id: string) =>
  locked(project, async () => {
    const all = await readAll(project);
    const index = all.findIndex((draft) => draft.id === id);
    if (index === -1 || all[index]!.status === "published") return null;
    const [deleted] = all.splice(index, 1);
    await writeAll(project, all);
    return deleted!;
  });
