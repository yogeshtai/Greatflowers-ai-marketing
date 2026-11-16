import cron from "node-cron";
import { dateKeyIn } from "./blog.time.js";
import { startWikiGeneration } from "./wiki.jobs.js";
import { approveWikiFlow, publishWikiDraft, publishWikiImmediate, wikiPublishHourEt } from "./wiki.publisher.js";
import { getWikiDrafts } from "./wiki.store.js";
import { enabledProjects, type ProjectConfig } from "./projects/index.js";
import { autogenerateEnabled } from "./projects/automation.js";

// Each project's draft cron and recovery crons live in project.schedule. Recovery runs retry a
// timed-out scheduled generation later the same day; once a Wiki draft exists for that date,
// generateWikiDraftIfNeeded returns false.
export async function generateWikiDraftIfNeeded(project: ProjectConfig) {
  if (!autogenerateEnabled(project, "WIKI")) return false;
  const dateKey = (date?: Date) => dateKeyIn(project.schedule.timezone, date);
  const today = dateKey();
  const drafts = await getWikiDrafts(project);
  if (drafts.some((draft) => draft.status !== "rejected" && dateKey(new Date(draft.createdAt)) === today)) return false;
  return startWikiGeneration(project, "schedule", project.env("WIKI_AUTOAPPROVE") === "false" ? undefined : async (draft) => {
    const result = await approveWikiFlow(project, draft.id);
    if (result.outcome === "publish-failed") throw new Error(`automatic wiki publishing failed for ${draft.slug}`);
    if (result.outcome !== "approved" && result.outcome !== "published") throw new Error(`automatic wiki approval was not actionable: ${result.outcome}`);
  });
}

const publishing = new Set<string>();
export async function publishDueWikis(project: ProjectConfig) {
  if (publishing.has(project.id)) return;
  publishing.add(project.id);
  try {
    const now = Date.now();
    for (const draft of await getWikiDrafts(project)) {
      if (draft.status === "approved" && draft.publishAfter && Date.parse(draft.publishAfter) <= now) await publishWikiDraft(project, draft.id);
    }
  } finally {
    publishing.delete(project.id);
  }
}

export function startWikiScheduler() {
  for (const project of enabledProjects()) {
    const { timezone, wikiDraftCron, wikiRecoveryCrons } = project.schedule;
    console.log(`📚 [${project.id}] Wiki scheduler started (draft "${wikiDraftCron}" ${timezone}, publish ${publishWikiImmediate(project) ? "on approve" : `${wikiPublishHourEt(project)}:00 ET`})`);
    cron.schedule(wikiDraftCron, () => void generateWikiDraftIfNeeded(project), { timezone });
    wikiRecoveryCrons.forEach((expression) => {
      cron.schedule(expression, () => void generateWikiDraftIfNeeded(project), { timezone });
    });
    cron.schedule("*/10 * * * *", () => void publishDueWikis(project));
  }
}
