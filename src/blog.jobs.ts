import { generateDailyBlogDraft } from "./blog.generator.js";
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
    })
    .catch((error) => {
      console.error("Blog draft generation failed:", error);
      state = { running: false, trigger, startedAt, finishedAt: new Date().toISOString(), error: errorDetail(error) };
    })
    .finally(release);
  return true;
}
