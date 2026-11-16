import cron from "node-cron";
import { startArticleGeneration } from "./article.jobs.js";
import { approveArticleFlow, articlePublishHourEt, publishArticleDraft, publishArticleImmediate } from "./article.publisher.js";
import { getArticleDrafts } from "./article.store.js";
import { dateKeyIn } from "./blog.time.js";
import { enabledProjects, type ProjectConfig } from "./projects/index.js";

// Each project's draft cron and recovery cron live in project.schedule. If the scheduled Hermes
// request times out, the recovery cron retries later the same day; the date guard below makes every
// retry a no-op as soon as one draft has been saved successfully.
export async function generateArticleDraftIfNeeded(project: ProjectConfig) {
  if (project.env("ARTICLE_AUTOGENERATE") === "false") return false;
  const dateKey = (date?: Date) => dateKeyIn(project.schedule.timezone, date);
  const today = dateKey();
  const drafts = await getArticleDrafts(project);
  if (drafts.some((draft) => draft.status !== "rejected" && dateKey(new Date(draft.createdAt)) === today)) return false;
  return startArticleGeneration(project, "schedule", project.env("ARTICLE_AUTOAPPROVE") === "false" ? undefined : async (draft) => {
    const result = await approveArticleFlow(project, draft.id);
    if (result.outcome === "publish-failed") throw new Error(`automatic article publishing failed for ${draft.slug}`);
    if (result.outcome !== "approved" && result.outcome !== "published") throw new Error(`automatic article approval was not actionable: ${result.outcome}`);
  });
}

const publishing = new Set<string>();
export async function publishDueArticles(project: ProjectConfig) {
  if (publishing.has(project.id)) return;
  publishing.add(project.id);
  try {
    const now = Date.now();
    for (const draft of await getArticleDrafts(project)) {
      if (draft.status === "approved" && draft.publishAfter && Date.parse(draft.publishAfter) <= now) await publishArticleDraft(project, draft.id);
    }
  } finally { publishing.delete(project.id); }
}

export function startArticleScheduler() {
  for (const project of enabledProjects()) {
    const { timezone, articleDraftCron, articleRecoveryCron } = project.schedule;
    console.log(`📝 [${project.id}] Article scheduler started (draft "${articleDraftCron}" ${timezone}, publish ${publishArticleImmediate(project) ? "on approve" : `${articlePublishHourEt(project)}:00 ET`})`);
    cron.schedule(articleDraftCron, () => void generateArticleDraftIfNeeded(project), { timezone });
    cron.schedule(articleRecoveryCron, () => void generateArticleDraftIfNeeded(project), { timezone });
    cron.schedule("*/10 * * * *", () => void publishDueArticles(project));
  }
}
