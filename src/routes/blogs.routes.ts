import express from "express";
import { z } from "zod";
import { blogEditSchema, BlogGenerateRequestSchema } from "../blog.schema.js";
import { approveDraft, approveFlow, isDraftPublishing, liveMode, publishDraft, publishImmediate, rejectDraft } from "../blog.publisher.js";
import { getGenerationState, isDraftImagePending, startGeneration } from "../blog.jobs.js";
import { deleteUnpublishedBlogDraft, getBlogDraft, getBlogDrafts, updateBlogDraft } from "../blog.store.js";
import { abortOnDisconnect, errorDetail, singleFlight } from "../http.helpers.js";
import { attachHeroImage, toCatalogProduct } from "../blog.generator.js";
import { withGfClient } from "../gf.admin.client.js";
import { existingHeroPath, heroImagePaths } from "../blog.image.js";
import { unlink } from "node:fs/promises";
import { contentAuthors, defaultContentAuthor } from "../content.authors.js";
import { projectLockKey } from "../projects/index.js";
import { projectOf } from "../projects/http.js";
import { draftSchedule } from "../projects/schedule.js";
import { getBlogTitles, titleSeason } from "../blog.titles.js";
import type { BlogTitleSource } from "../blog.title-selector.js";

const router = express.Router();
const fail = (res: express.Response, error: unknown, status = 500) => {
  console.error("Blog route error:", error);
  return res.status(error instanceof z.ZodError ? 400 : status).json({ success: false, error: errorDetail(error) });
};
const idOf = (req: express.Request) => String(req.params.id);

// Lightweight progress check for the dashboard (the full list carries every draft's article text).
router.get("/api/blogs/status", (_req, res) => {
  res.json({ success: true, generation: getGenerationState(projectOf(res)) });
});

// A draft is saved as soon as the text is written; its hero image is made right after, and publishing before then would miss it.
const imageBusyMessage = "The hero image is still being made for this draft. Try again in a minute.";

router.get("/api/blogs", async (_req, res) => {
  try {
    const project = projectOf(res);
    const blogs = (await getBlogDrafts(project)).map((blog) => ({ ...blog, authorName: blog.authorName ?? defaultContentAuthor(project) }));
    res.json({ success: true, blogs, authors: contentAuthors(project), liveMode: liveMode(project), publishMode: publishImmediate(project) ? "immediate" : "scheduled", generation: getGenerationState(project), schedule: draftSchedule(project, "BLOG") });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/blogs/generate", async (req, res) => {
  try {
    const project = projectOf(res);
    const { occasion, titleId, source } = BlogGenerateRequestSchema.parse(req.body ?? {});
    const titleSource: BlogTitleSource | undefined = titleId ? { kind: "title", titleId } : source === "title-list" ? { kind: "pick", fallbackToAuto: false } : undefined;
    // Fail fast instead of starting a background run that cannot pick anything.
    if (source === "title-list") {
      const ready = (await getBlogTitles(project)).filter((title) => title.status === "queued" && (title.pinned || titleSeason(title.title).ready));
      if (!ready.length) return res.status(400).json({ success: false, error: "There are no ready titles in the list. Add titles, or pin a seasonal title to write it now." });
    }
    if (titleId) {
      const chosen = (await getBlogTitles(project)).find((title) => title.id === titleId);
      if (!chosen) return res.status(404).json({ success: false, error: "That title is no longer in the list." });
      if (chosen.status === "used" || chosen.status === "writing") return res.status(409).json({ success: false, error: `That title is already ${chosen.status === "used" ? "written" : "being written"}.` });
    }
    startGeneration(project, "manual", occasion, undefined, titleSource)
      ? res.status(202).json({ success: true, started: true })
      : res.status(409).json({ success: false, error: "A draft is already being written. Please wait for it to finish." });
  } catch (error) {
    fail(res, error, 400);
  }
});

router.get("/api/blogs/:id/hero", (req, res) => {
  const file = existingHeroPath(projectOf(res), idOf(req));
  file ? res.sendFile(file) : res.status(404).json({ success: false, error: "No AI hero image" });
});

router.post("/api/blogs/:id/hero/regenerate", singleFlight((res) => projectLockKey(projectOf(res), "blog"), async (req, res) => {
  try {
    const project = projectOf(res);
    const draft = await getBlogDraft(project, idOf(req));
    if (!draft || (draft.status !== "draft" && draft.status !== "failed" && draft.status !== "approved")) return res.status(409).json({ success: false, error: "Only unpublished posts can get a new image" });
    const products = await withGfClient(project, (client) => client.searchProducts("", 100));
    const imageUrl = products.map(toCatalogProduct).find((p) => p.id === draft.heroProductId)?.imageUrl;
    res.json({ success: true, blog: await attachHeroImage(project, draft.id, draft, imageUrl, abortOnDisconnect(res)) });
  } catch (error) {
    fail(res, error);
  }
}));

router.patch("/api/blogs/:id", async (req, res) => {
  try {
    const project = projectOf(res);
    const edit = Object.fromEntries(Object.entries(blogEditSchema(project).parse(req.body)).filter(([, v]) => v !== undefined));
    const blog = await updateBlogDraft(project, idOf(req), (d) => (d.status === "draft" || d.status === "failed" ? { ...d, ...edit } : null));
    blog ? res.json({ success: true, blog }) : res.status(409).json({ success: false, error: "Only drafts can be edited" });
  } catch (error) {
    fail(res, error);
  }
});

router.delete("/api/blogs/:id", async (req, res) => {
  try {
    const project = projectOf(res);
    const id = idOf(req);
    const current = await getBlogDraft(project, id);
    if (!current) return res.status(404).json({ success: false, error: "Blog queue entry not found" });
    if (current.status === "published") return res.status(409).json({ success: false, error: "Published posts cannot be deleted from the blog queue" });
    if (isDraftPublishing(id)) return res.status(409).json({ success: false, error: "This post is currently publishing and cannot be deleted" });
    if (isDraftImagePending(project, current)) return res.status(409).json({ success: false, error: "Wait for the hero image to finish before deleting this entry" });

    const deleted = await deleteUnpublishedBlogDraft(project, id);
    if (!deleted) return res.status(409).json({ success: false, error: "This entry was published or removed before it could be deleted" });

    // Queue deletion is intentionally local. A post already created on the storefront stays intact.
    await Promise.all(heroImagePaths(project, id).map((file) => unlink(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") console.error(`Could not remove hero for deleted blog ${id}:`, error);
    })));
    return res.json({ success: true });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/api/blogs/:id/approve", async (req, res) => {
  try {
    const result = await approveFlow(projectOf(res), idOf(req));
    if (result.outcome === "image-pending") return res.status(409).json({ success: false, error: imageBusyMessage });
    if (result.outcome === "missing" || result.outcome === "not-actionable") return res.status(409).json({ success: false, error: "Only draft or failed posts can be approved" });
    res.json({ success: true, blog: result.blog });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/blogs/:id/reject", async (req, res) => {
  try {
    const blog = await rejectDraft(projectOf(res), idOf(req));
    blog ? res.json({ success: true, blog }) : res.status(409).json({ success: false, error: "Published posts cannot be rejected" });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/blogs/:id/publish-now", async (req, res) => {
  try {
    const project = projectOf(res);
    const current = await getBlogDraft(project, idOf(req));
    if (current && isDraftImagePending(project, current)) return res.status(409).json({ success: false, error: imageBusyMessage });
    const approved = await approveDraft(project, idOf(req)) ?? current;
    if (approved?.status !== "approved") return res.status(409).json({ success: false, error: "Post must be a draft or approved" });
    res.json({ success: true, blog: await publishDraft(project, approved.id) });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
