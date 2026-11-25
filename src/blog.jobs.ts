import { generateDailyBlogDraft } from "./blog.generator.js";
import { emitBlogEvent } from "./blog.notify.js";
import { tryAcquire } from "./ai.limits.js";
import { errorDetail } from "./http.helpers.js";
import { projectLockKey, type ProjectConfig } from "./projects/index.js";
import type { BlogTitleSource } from "./blog.title-selector.js";

export interface GenerationState {
  running: boolean;
  trigger?: "manual" | "schedule";
  occasion?: string;
  /** The title-list title being written, once the AI (or the user) has chosen it. */
  title?: string;
  titleReason?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

// One generation state per project, so one brand's job never shows up in another brand's queue.
const states = new Map<string, GenerationState>();
export const getGenerationState = (project: ProjectConfig): GenerationState => states.get(project.id) ?? { running: false };
const setState = (project: ProjectConfig, state: GenerationState) => states.set(project.id, state);

// A draft is saved as soon as the text is written; its hero image is made right after, inside the same job.
export const isDraftImagePending = (project: ProjectConfig, draft: { createdAt: string }) => {
  const state = getGenerationState(project);
  return !!(state.running && state.startedAt && draft.createdAt >= state.startedAt);
};

// Draft generation takes minutes (Hermes + hero image), longer than any proxy keeps an HTTP request open, so it runs in the background.
export function startGeneration(
  project: ProjectConfig,
  trigger: "manual" | "schedule",
  occasion?: string,
  onComplete?: (draft: Awaited<ReturnType<typeof generateDailyBlogDraft>>) => void | Promise<void>,
  titleSource?: BlogTitleSource,
): boolean {
  const release = tryAcquire(projectLockKey(project, "blog"));
  if (!release) return false;
  const startedAt = new Date().toISOString();
  let details: Pick<GenerationState, "occasion" | "title" | "titleReason"> = occasion ? { occasion } : {};
  setState(project, { running: true, trigger, ...details, startedAt });
  const onTitleSelected = (assignment: { title: string; reason: string }) => {
    details = { ...details, title: assignment.title, titleReason: assignment.reason };
    setState(project, { running: true, trigger, ...details, startedAt });
  };
  generateDailyBlogDraft(project, undefined, occasion, titleSource ? { titleSource, onTitleSelected } : {})
    .then(async (draft) => {
      setState(project, { running: false, trigger, ...details, startedAt, finishedAt: new Date().toISOString() });
      if (onComplete) await onComplete(draft);
      console.log(`📝 [${project.id}] Blog draft ready${onComplete ? " and automatic approval processed" : " for approval"}: ${draft.title}`);
      emitBlogEvent({ type: "draft-ready", draft });
    })
    .catch((error) => {
      console.error(`[${project.id}] Blog draft generation failed:`, error);
      const message = error instanceof Error && error.name === "HermesOutputError"
        ? `Hermes could not produce a valid blog after automatic repair and a fresh retry: ${error.message.replace(/^Hermes output remained invalid after one repair:\s*/i, "").slice(0, 500)}`
        : errorDetail(error);
      setState(project, { running: false, trigger, ...details, startedAt, finishedAt: new Date().toISOString(), error: message });
      emitBlogEvent({ type: "draft-failed", error: message });
    })
    .finally(release);
  return true;
}
