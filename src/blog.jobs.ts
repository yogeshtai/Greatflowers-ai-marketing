import { generateDailyBlogDraft } from "./blog.generator.js";
import { emitBlogEvent } from "./blog.notify.js";
import { tryAcquire } from "./ai.limits.js";
import { errorDetail } from "./http.helpers.js";

export interface GenerationState {
  running: boolean;
  trigger?: "manual" | "schedule";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

let state: GenerationState = { running: false };
export const getGenerationState = (): GenerationState => state;

// A draft is saved as soon as the text is written; its hero image is made right after, inside the same job.
export const isDraftImagePending = (draft: { createdAt: string }) =>
  !!(state.running && state.startedAt && draft.createdAt >= state.startedAt);

// Draft generation takes minutes (Hermes + hero image), longer than any proxy keeps an HTTP request open, so it runs in the background.
export function startGeneration(trigger: "manual" | "schedule"): boolean {
  const release = tryAcquire("blog");
  if (!release) return false;
  const startedAt = new Date().toISOString();
  state = { running: true, trigger, startedAt };
  generateDailyBlogDraft()
    .then((draft) => {
      console.log(`📝 Blog draft ready for approval: ${draft.title}`);
      state = { running: false, trigger, startedAt, finishedAt: new Date().toISOString() };
      emitBlogEvent({ type: "draft-ready", draft });
    })
    .catch((error) => {
      console.error("Blog draft generation failed:", error);
      const message = errorDetail(error);
      state = { running: false, trigger, startedAt, finishedAt: new Date().toISOString(), error: message };
      emitBlogEvent({ type: "draft-failed", error: message });
    })
    .finally(release);
  return true;
}
