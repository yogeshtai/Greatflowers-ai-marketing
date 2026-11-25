import { tryAcquire } from "./ai.limits.js";
import { generateDailyArticleDraft } from "./article.generator.js";
import { errorDetail } from "./http.helpers.js";
import { projectLockKey, type ProjectConfig } from "./projects/index.js";

export interface ArticleGenerationState {
  running: boolean;
  phase?: "article" | "image";
  trigger?: "manual" | "schedule";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

// One generation state per project. Draft ids are UUIDs, so one regeneration set is safe for all.
const states = new Map<string, ArticleGenerationState>();
const regeneratingImageIds = new Set<string>();
export const getArticleGenerationState = (project: ProjectConfig): ArticleGenerationState => states.get(project.id) ?? { running: false };
const setState = (project: ProjectConfig, state: ArticleGenerationState) => states.set(project.id, state);
export const beginArticleImageRegeneration = (id: string) => regeneratingImageIds.has(id) ? false : (regeneratingImageIds.add(id), true);
export const endArticleImageRegeneration = (id: string) => regeneratingImageIds.delete(id);
export const isArticleDraftImagePending = (project: ProjectConfig, draft: { id?: string; createdAt: string }) => {
  const state = getArticleGenerationState(project);
  return !!((state.running && state.startedAt && draft.createdAt >= state.startedAt) || (draft.id && regeneratingImageIds.has(draft.id)));
};

export function startArticleGeneration(
  project: ProjectConfig,
  trigger: "manual" | "schedule",
  onComplete?: (draft: Awaited<ReturnType<typeof generateDailyArticleDraft>>) => void | Promise<void>,
): boolean {
  const release = tryAcquire(projectLockKey(project, "article"));
  if (!release) return false;
  const startedAt = new Date().toISOString();
  setState(project, { running: true, phase: "article", trigger, startedAt });
  generateDailyArticleDraft(project, undefined, () => {
    const state = getArticleGenerationState(project);
    if (state.running && state.startedAt === startedAt) setState(project, { ...state, phase: "image" });
  })
    .then(async (draft) => {
      setState(project, { running: false, trigger, startedAt, finishedAt: new Date().toISOString() });
      if (onComplete) await onComplete(draft);
      console.log(`📝 [${project.id}] Article draft ready${onComplete ? " and automatic approval processed" : " for approval"}: ${draft.title}`);
    })
    .catch((error) => {
      const message = errorDetail(error);
      console.error(`[${project.id}] Article draft generation failed:`, message);
      setState(project, { running: false, trigger, startedAt, finishedAt: new Date().toISOString(), error: message });
    })
    .finally(release);
  return true;
}
