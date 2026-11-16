import { tryAcquire } from "./ai.limits.js";
import { errorDetail } from "./http.helpers.js";
import { generateDailyWikiDraft } from "./wiki.generator.js";
import { projectLockKey, type ProjectConfig } from "./projects/index.js";

export interface WikiGenerationState {
  running: boolean;
  phase?: "article" | "image";
  trigger?: "manual" | "schedule";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

// One generation state per project. Draft ids are UUIDs, so one regeneration set is safe for all.
const states = new Map<string, WikiGenerationState>();
const regeneratingImageIds = new Set<string>();
export const getWikiGenerationState = (project: ProjectConfig): WikiGenerationState => states.get(project.id) ?? { running: false };
const setState = (project: ProjectConfig, state: WikiGenerationState) => states.set(project.id, state);

export const beginWikiImageRegeneration = (id: string) => {
  if (regeneratingImageIds.has(id)) return false;
  regeneratingImageIds.add(id);
  return true;
};
export const endWikiImageRegeneration = (id: string) => regeneratingImageIds.delete(id);
export const isWikiDraftImagePending = (project: ProjectConfig, draft: { id?: string; createdAt: string }) => {
  const state = getWikiGenerationState(project);
  return !!((state.running && state.startedAt && draft.createdAt >= state.startedAt) || (draft.id && regeneratingImageIds.has(draft.id)));
};

export function startWikiGeneration(
  project: ProjectConfig,
  trigger: "manual" | "schedule",
  onComplete?: (draft: Awaited<ReturnType<typeof generateDailyWikiDraft>>) => void | Promise<void>,
): boolean {
  const release = tryAcquire(projectLockKey(project, "wiki"));
  if (!release) return false;
  const startedAt = new Date().toISOString();
  setState(project, { running: true, phase: "article", trigger, startedAt });
  generateDailyWikiDraft(project, undefined, () => {
    // The article is already in the queue at this point; only its image remains.
    // Keep the same run identity so a stale callback cannot overwrite a newer job.
    const state = getWikiGenerationState(project);
    if (state.running && state.startedAt === startedAt) setState(project, { ...state, phase: "image" });
  })
    .then(async (draft) => {
      setState(project, { running: false, trigger, startedAt, finishedAt: new Date().toISOString() });
      if (onComplete) await onComplete(draft);
      console.log(`📚 [${project.id}] Wiki draft ready${onComplete ? " and automatic approval processed" : " for approval"}: ${draft.title}`);
    })
    .catch((error) => {
      const message = errorDetail(error);
      console.error(`[${project.id}] Wiki draft generation failed:`, message);
      setState(project, { running: false, trigger, startedAt, finishedAt: new Date().toISOString(), error: message });
    })
    .finally(release);
  return true;
}
