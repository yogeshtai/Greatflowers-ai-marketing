import type { BlogDraft } from "./blog.schema.js";

export type BlogEvent =
  | { type: "draft-ready"; draft: BlogDraft }
  | { type: "draft-failed"; error: string }
  | { type: "published"; draft: BlogDraft }
  | { type: "publish-failed"; draft: BlogDraft };

type Listener = (event: BlogEvent) => void;
const listeners = new Set<Listener>();

export const onBlogEvent = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emitBlogEvent = (event: BlogEvent) => {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      console.error("Blog event listener failed:", error);
    }
  }
};
