import cron from "node-cron";
import { startGeneration } from "./blog.jobs.js";
import { PUBLISH_HOUR_ET, publishDraft, publishImmediate } from "./blog.publisher.js";
import { getBlogDrafts } from "./blog.store.js";
import { istDateKey } from "./blog.time.js";

export async function generateDraftIfNeeded() {
  if (process.env.BLOG_AUTOGENERATE === "false") return false;
  const today = istDateKey();
  const drafts = await getBlogDrafts();
  if (drafts.some((d) => d.status !== "rejected" && istDateKey(new Date(d.createdAt)) === today)) return false;
  return startGeneration("schedule");
}

let publishing = false;
export async function publishDueBlogs() {
  if (publishing) return;
  publishing = true;
  try {
    const now = Date.now();
    for (const draft of await getBlogDrafts()) {
      if (draft.status === "approved" && draft.publishAfter && Date.parse(draft.publishAfter) <= now) await publishDraft(draft.id);
    }
  } finally {
    publishing = false;
  }
}

export function startBlogScheduler() {
  console.log(`📝 Blog scheduler started (draft 18:00 IST, publish ${publishImmediate() ? "on approve" : `${PUBLISH_HOUR_ET}:00 ET`})`);
  cron.schedule("0 18 * * *", () => void generateDraftIfNeeded(), { timezone: "Asia/Kolkata" });
  cron.schedule("*/10 * * * *", () => void publishDueBlogs());
}
