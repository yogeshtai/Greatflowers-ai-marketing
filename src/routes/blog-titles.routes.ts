import express from "express";
import { z } from "zod";
import { loadTitleSelectionContext } from "../blog.generator.js";
import { getGenerationState } from "../blog.jobs.js";
import { eligibleTitles, pickBlogTitle } from "../blog.title-selector.js";
import {
  addBlogTitles,
  checkBlogTitle,
  cleanTitleLine,
  deleteBlogTitle,
  getBlogTitles,
  titleSeason,
  updateBlogTitle,
  type BlogTitle,
} from "../blog.titles.js";
import { errorDetail, singleFlight } from "../http.helpers.js";
import { autogenerateEnabled } from "../projects/automation.js";
import { projectOf } from "../projects/http.js";
import { projectLockKey } from "../projects/index.js";
import { blogRunsPerWeek } from "../projects/schedule.js";

// The brand's blog title list: titles the AI can pick from when a blog is written.
const router = express.Router();
const fail = (res: express.Response, error: unknown, status = 500) => {
  console.error("Blog title route error:", error);
  return res.status(error instanceof z.ZodError ? 400 : status).json({ success: false, error: errorDetail(error) });
};
const idOf = (req: express.Request) => String(req.params.id);

const AddTitlesSchema = z.object({
  titles: z.array(z.string().max(300)).min(1).max(200),
});

const UpdateTitleSchema = z.object({
  title: z.string().max(300).optional(),
  pinned: z.boolean().optional(),
  status: z.enum(["queued", "skipped"]).optional(),
}).refine((update) => Object.keys(update).length > 0, { message: "Nothing to update" });

// The list as the dashboard shows it: each title with its season (a seasonal title waits until
// its occasion is near) and totals for the "titles left" estimate.
router.get("/api/blog-titles", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const project = projectOf(res);
    const today = new Date();
    const titles = (await getBlogTitles(project)).map((title) => ({ ...title, season: titleSeason(title.title, today) }));
    const queued = titles.filter((title) => title.status === "queued");
    const ready = queued.filter((title) => title.pinned || title.season.ready).length;
    const count = (status: BlogTitle["status"]) => titles.filter((title) => title.status === status).length;
    res.json({
      success: true,
      titles,
      stats: { ready, waiting: queued.length - ready, writing: count("writing"), used: count("used"), skipped: count("skipped"), failed: count("failed") },
      runsPerWeek: blogRunsPerWeek(project),
      usedBySchedule: project.env("BLOG_TITLE_LIST") !== "false" && autogenerateEnabled(project, "BLOG"),
      listSwitchedOff: project.env("BLOG_TITLE_LIST") === "false",
      generation: getGenerationState(project),
    });
  } catch (error) {
    fail(res, error);
  }
});

// Adds pasted titles. Each one is checked against the storefront's existing blogs, wiki entries
// and articles; the response lists what was added and why anything was rejected.
router.post("/api/blog-titles", async (req, res) => {
  try {
    const project = projectOf(res);
    const { titles } = AddTitlesSchema.parse(req.body ?? {});
    const { inventory } = await loadTitleSelectionContext(project);
    res.json({ success: true, ...(await addBlogTitles(project, titles, inventory)) });
  } catch (error) {
    fail(res, error, 400);
  }
});

router.patch("/api/blog-titles/:id", async (req, res) => {
  try {
    const project = projectOf(res);
    const update = UpdateTitleSchema.parse(req.body ?? {});
    const current = (await getBlogTitles(project)).find((title) => title.id === idOf(req));
    if (!current) return res.status(404).json({ success: false, error: "That title is no longer in the list." });
    if (current.status === "writing" || current.status === "used") {
      return res.status(409).json({ success: false, error: `This title is ${current.status === "used" ? "already written" : "being written right now"} and can't be changed.` });
    }
    // A reworded title goes through the same checks as a new one.
    let edited: { title: string; warnings: string[] } | undefined;
    if (update.title !== undefined) {
      const title = cleanTitleLine(update.title);
      const { inventory } = await loadTitleSelectionContext(project);
      const others = (await getBlogTitles(project)).filter((item) => item.id !== current.id).map((item) => item.title);
      const check = checkBlogTitle(title, { inventory, listTitles: others });
      if (!check.ok) return res.status(400).json({ success: false, error: check.reason });
      edited = { title, warnings: check.warnings };
    }
    const saved = await updateBlogTitle(project, current.id, (title) => {
      const next: BlogTitle = { ...title, ...(edited ?? {}) };
      if (update.pinned !== undefined) next.pinned = update.pinned;
      if (update.status) {
        next.status = update.status;
        // Restoring a skipped or failed title gives it a fresh start.
        if (update.status === "queued") {
          next.attempts = 0;
          delete next.error;
        }
      }
      if (!next.pinned) delete next.pinned;
      return next;
    });
    res.json({ success: true, title: saved });
  } catch (error) {
    fail(res, error, 400);
  }
});

router.delete("/api/blog-titles/:id", async (req, res) => {
  try {
    const outcome = await deleteBlogTitle(projectOf(res), idOf(req));
    if (outcome === "missing") return res.status(404).json({ success: false, error: "That title is no longer in the list." });
    if (outcome === "writing") return res.status(409).json({ success: false, error: "This title is being written right now. Delete it after the draft is ready." });
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
});

// Shows which title the AI would pick right now, without writing anything or changing the list.
router.post("/api/blog-titles/preview-pick", singleFlight((res) => projectLockKey(projectOf(res), "blog-title-pick"), async (_req, res) => {
  try {
    const project = projectOf(res);
    const context = await loadTitleSelectionContext(project, { products: true });
    const { eligible, overlapping } = eligibleTitles(await getBlogTitles(project), context);
    if (!eligible.length) return res.status(400).json({ success: false, error: "There are no ready titles in the list to choose from." });
    const pick = await pickBlogTitle(project, eligible, context);
    res.json({ success: true, titleId: pick.title.id, title: pick.title.title, reason: pick.reason, method: pick.method, overlapping: overlapping.map(({ title, reason }) => ({ title: title.title, reason })) });
  } catch (error) {
    fail(res, error);
  }
}));

export default router;
