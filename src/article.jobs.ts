import { tryAcquire } from "./ai.limits.js";
import { generateDailyArticleDraft } from "./article.generator.js";
import { errorDetail } from "./http.helpers.js";

export interface ArticleGenerationState {
  running: boolean;
  phase?: "article" | "image";
  trigger?: "manual" | "schedule";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

let state: ArticleGenerationState = { running: false };
const regeneratingImageIds = new Set<string>();
export const getArticleGenerationState = () => state;
export const beginArticleImageRegeneration = (id: string) => regeneratingImageIds.has(id) ? false : (regeneratingImageIds.add(id), true);
export const endArticleImageRegeneration = (id: string) => regeneratingImageIds.delete(id);
export const isArticleDraftImagePending = (draft: { id?: string; createdAt: string }) =>
  !!((state.running && state.startedAt && draft.createdAt >= state.startedAt) || (draft.id && regeneratingImageIds.has(draft.id)));

export function startArticleGeneration(trigger: "manual" | "schedule"): boolean {
  const release = tryAcquire("article");
  if (!release) return false;
  const startedAt = new Date().toISOString();
  state = { running: true, phase: "article", trigger, startedAt };
  generateDailyArticleDraft(undefined, () => {
    if (state.running && state.startedAt === startedAt) state = { ...state, phase: "image" };
  })
    .then((draft) => {
      console.log(`📝 Article draft ready for approval: ${draft.title}`);
      state = { running: false, trigger, startedAt, finishedAt: new Date().toISOString() };
    })
    .catch((error) => {
      const message = errorDetail(error);
      console.error("Article draft generation failed:", message);
      state = { running: false, trigger, startedAt, finishedAt: new Date().toISOString(), error: message };
    })
    .finally(release);
  return true;
}
