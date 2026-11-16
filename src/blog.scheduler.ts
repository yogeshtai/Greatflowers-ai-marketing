import cron from "node-cron";
import { startGeneration } from "./blog.jobs.js";
import { approveFlow, publishDraft, publishHourEt, publishImmediate } from "./blog.publisher.js";
import { getBlogDrafts } from "./blog.store.js";
import { dateKeyIn } from "./blog.time.js";
import { enabledProjects, type ProjectConfig } from "./projects/index.js";
import { autogenerateEnabled } from "./projects/automation.js";

export async function generateDraftIfNeeded(project: ProjectConfig) {
  if (!autogenerateEnabled(project, "BLOG")) return false;
  const dateKey = (date?: Date) => dateKeyIn(project.schedule.timezone, date);
  const today = dateKey();
  const drafts = await getBlogDrafts(project);
  if (drafts.some((d) => d.status !== "rejected" && dateKey(new Date(d.createdAt)) === today)) return false;
  return startGeneration(project, "schedule", undefined, project.env("BLOG_AUTOAPPROVE") === "false" ? undefined : async (draft) => {
    const result = await approveFlow(project, draft.id);
    if (result.outcome === "publish-failed") throw new Error(`automatic blog publishing failed for ${draft.slug}`);
    if (result.outcome !== "approved" && result.outcome !== "published") throw new Error(`automatic blog approval was not actionable: ${result.outcome}`);
  });
}

const publishing = new Set<string>();
export async function publishDueBlogs(project: ProjectConfig) {
  if (publishing.has(project.id)) return;
  publishing.add(project.id);
  try {
    const now = Date.now();
    for (const draft of await getBlogDrafts(project)) {
      if (draft.status === "approved" && draft.publishAfter && Date.parse(draft.publishAfter) <= now) await publishDraft(project, draft.id);
    }
  } finally {
    publishing.delete(project.id);
  }
}

export function startBlogScheduler() {
  for (const project of enabledProjects()) {
    console.log(`📝 [${project.id}] Blog scheduler started (draft "${project.schedule.blogDraftCron}" ${project.schedule.timezone}, publish ${publishImmediate(project) ? "on approve" : `${publishHourEt(project)}:00 ET`})`);
    cron.schedule(project.schedule.blogDraftCron, () => void generateDraftIfNeeded(project), { timezone: project.schedule.timezone });
    cron.schedule("*/10 * * * *", () => void publishDueBlogs(project));
  }
}
