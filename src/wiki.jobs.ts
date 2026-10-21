import { tryAcquire } from "./ai.limits.js";
import { errorDetail } from "./http.helpers.js";
import { generateDailyWikiDraft } from "./wiki.generator.js";

export interface WikiGenerationState {
  running: boolean;
  phase?: "article" | "image";
  trigger?: "manual" | "schedule";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

let state: WikiGenerationState = { running: false };
const regeneratingImageIds = new Set<string>();
export const getWikiGenerationState = (): WikiGenerationState => state;

export const beginWikiImageRegeneration = (id: string) => {
  if (regeneratingImageIds.has(id)) return false;
  regeneratingImageIds.add(id);
  return true;
};
export const endWikiImageRegeneration = (id: string) => regeneratingImageIds.delete(id);
export const isWikiDraftImagePending = (draft: { id?: string; createdAt: string }) =>
  !!((state.running && state.startedAt && draft.createdAt >= state.startedAt) || (draft.id && regeneratingImageIds.has(draft.id)));

export function startWikiGeneration(
  trigger: "manual" | "schedule",
  onComplete?: (draft: Awaited<ReturnType<typeof generateDailyWikiDraft>>) => void | Promise<void>,
): boolean {
  const release = tryAcquire("wiki");
  if (!release) return false;
  const startedAt = new Date().toISOString();
  state = { running: true, phase: "article", trigger, startedAt };
  generateDailyWikiDraft(undefined, () => {
    // The article is already in the queue at this point; only its image remains.
    // Keep the same run identity so a stale callback cannot overwrite a newer job.
    if (state.running && state.startedAt === startedAt) state = { ...state, phase: "image" };
  })
    .then(async (draft) => {
      state = { running: false, trigger, startedAt, finishedAt: new Date().toISOString() };
      if (onComplete) await onComplete(draft);
      console.log(`📚 Wiki draft ready${onComplete ? " and automatic approval processed" : " for approval"}: ${draft.title}`);
    })
    .catch((error) => {
      const message = errorDetail(error);
      console.error("Wiki draft generation failed:", message);
      state = { running: false, trigger, startedAt, finishedAt: new Date().toISOString(), error: message };
    })
    .finally(release);
  return true;
}
