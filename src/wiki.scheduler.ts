import cron from "node-cron";
import { istDateKey } from "./blog.time.js";
import { startWikiGeneration } from "./wiki.jobs.js";
import { approveWikiFlow, publishWikiDraft, publishWikiImmediate, WIKI_PUBLISH_HOUR_ET } from "./wiki.publisher.js";
import { getWikiDrafts } from "./wiki.store.js";

export async function generateWikiDraftIfNeeded() {
  if (process.env.WIKI_AUTOGENERATE === "false") return false;
  const today = istDateKey();
  const drafts = await getWikiDrafts();
  if (drafts.some((draft) => draft.status !== "rejected" && istDateKey(new Date(draft.createdAt)) === today)) return false;
  return startWikiGeneration("schedule", process.env.WIKI_AUTOAPPROVE === "false" ? undefined : async (draft) => {
    const result = await approveWikiFlow(draft.id);
    if (result.outcome === "publish-failed") throw new Error(`automatic wiki publishing failed for ${draft.slug}`);
    if (result.outcome !== "approved" && result.outcome !== "published") throw new Error(`automatic wiki approval was not actionable: ${result.outcome}`);
  });
}

let publishing = false;
export async function publishDueWikis() {
  if (publishing) return;
  publishing = true;
  try {
    const now = Date.now();
    for (const draft of await getWikiDrafts()) {
      if (draft.status === "approved" && draft.publishAfter && Date.parse(draft.publishAfter) <= now) await publishWikiDraft(draft.id);
    }
  } finally {
    publishing = false;
  }
}

export function startWikiScheduler() {
  console.log(`📚 Wiki scheduler started (draft 19:00 IST, publish ${publishWikiImmediate() ? "on approve" : `${WIKI_PUBLISH_HOUR_ET}:00 ET`})`);
  cron.schedule("0 19 * * 2,4,6", () => void generateWikiDraftIfNeeded(), { timezone: "Asia/Kolkata" });
  cron.schedule("*/10 * * * *", () => void publishDueWikis());
}
