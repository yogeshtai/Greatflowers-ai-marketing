import cron from "node-cron";
import { startArticleGeneration } from "./article.jobs.js";
import { ARTICLE_PUBLISH_HOUR_ET, publishArticleDraft, publishArticleImmediate } from "./article.publisher.js";
import { getArticleDrafts } from "./article.store.js";
import { istDateKey } from "./blog.time.js";

export const ARTICLE_DRAFT_CRON = "30 18 * * *";

export async function generateArticleDraftIfNeeded() {
  if (process.env.ARTICLE_AUTOGENERATE === "false") return false;
  const today = istDateKey();
  const drafts = await getArticleDrafts();
  if (drafts.some((draft) => draft.status !== "rejected" && istDateKey(new Date(draft.createdAt)) === today)) return false;
  return startArticleGeneration("schedule");
}

let publishing = false;
export async function publishDueArticles() {
  if (publishing) return;
  publishing = true;
  try {
    const now = Date.now();
    for (const draft of await getArticleDrafts()) {
      if (draft.status === "approved" && draft.publishAfter && Date.parse(draft.publishAfter) <= now) await publishArticleDraft(draft.id);
    }
  } finally { publishing = false; }
}

export function startArticleScheduler() {
  console.log(`📝 Article scheduler started (draft 18:30 IST, publish ${publishArticleImmediate() ? "on approve" : `${ARTICLE_PUBLISH_HOUR_ET}:00 ET`})`);
  cron.schedule(ARTICLE_DRAFT_CRON, () => void generateArticleDraftIfNeeded(), { timezone: "Asia/Kolkata" });
  cron.schedule("*/10 * * * *", () => void publishDueArticles());
}
