import cron from "node-cron";
import { startGeneration } from "./blog.jobs.js";
import { publishDraft } from "./blog.publisher.js";
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
  console.log("📝 Blog scheduler started (draft 19:00 IST, publish 10:00 ET)");
  cron.schedule("0 19 * * *", () => void generateDraftIfNeeded(), { timezone: "Asia/Kolkata" });
  cron.schedule("*/10 * * * *", () => void publishDueBlogs());
}
