import express from "express";
import { z } from "zod";
import { BlogEditSchema } from "../blog.schema.js";
import { approveDraft, publishDraft } from "../blog.publisher.js";
import { getGenerationState, startGeneration } from "../blog.jobs.js";
import { getBlogDraft, getBlogDrafts, updateBlogDraft } from "../blog.store.js";
import { abortOnDisconnect, errorDetail, singleFlight } from "../http.helpers.js";
import { attachHeroImage, toCatalogProduct } from "../blog.generator.js";
import { withGfClient } from "../gf.admin.client.js";
import { heroPath } from "../blog.image.js";
import { existsSync } from "node:fs";

const router = express.Router();
const fail = (res: express.Response, error: unknown, status = 500) => {
  console.error("Blog route error:", error);
  return res.status(error instanceof z.ZodError ? 400 : status).json({ success: false, error: errorDetail(error) });
};
const idOf = (req: express.Request) => String(req.params.id);

// Lightweight progress check for the dashboard (the full list carries every draft's article text).
router.get("/api/blogs/status", (_req, res) => {
  res.json({ success: true, generation: getGenerationState() });
});

// A draft is saved as soon as the text is written; its hero image is made right after, and publishing before then would miss it.
const imageInProgress = (draft: { createdAt: string }) => {
  const generation = getGenerationState();
  return generation.running && !!generation.startedAt && draft.createdAt >= generation.startedAt;
};
const imageBusyMessage = "The hero image is still being made for this draft. Try again in a minute.";

router.get("/api/blogs", async (_req, res) => {
  try {
    res.json({ success: true, blogs: await getBlogDrafts(), liveMode: process.env.BLOG_PUBLISH_LIVE === "true", generation: getGenerationState() });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/blogs/generate", (_req, res) => {
  startGeneration("manual")
    ? res.status(202).json({ success: true, started: true })
    : res.status(409).json({ success: false, error: "A draft is already being written. Please wait for it to finish." });
});

router.get("/api/blogs/:id/hero", (req, res) => {
  const file = heroPath(idOf(req));
  existsSync(file) ? res.sendFile(file) : res.status(404).json({ success: false, error: "No AI hero image" });
});

router.post("/api/blogs/:id/hero/regenerate", singleFlight("blog", async (req, res) => {
  try {
    const draft = await getBlogDraft(idOf(req));
    if (!draft || (draft.status !== "draft" && draft.status !== "failed" && draft.status !== "approved")) return res.status(409).json({ success: false, error: "Only unpublished posts can get a new image" });
    const products = await withGfClient((client) => client.searchProducts("", 100));
    const imageUrl = products.map(toCatalogProduct).find((p) => p.id === draft.heroProductId)?.imageUrl;
    res.json({ success: true, blog: await attachHeroImage(draft.id, draft, imageUrl, abortOnDisconnect(res)) });
  } catch (error) {
    fail(res, error);
  }
}));

router.patch("/api/blogs/:id", async (req, res) => {
  try {
    const edit = Object.fromEntries(Object.entries(BlogEditSchema.parse(req.body)).filter(([, v]) => v !== undefined));
    const blog = await updateBlogDraft(idOf(req), (d) => (d.status === "draft" || d.status === "failed" ? { ...d, ...edit } : null));
    blog ? res.json({ success: true, blog }) : res.status(409).json({ success: false, error: "Only drafts can be edited" });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/blogs/:id/approve", async (req, res) => {
  try {
    const current = await getBlogDraft(idOf(req));
    if (current && imageInProgress(current)) return res.status(409).json({ success: false, error: imageBusyMessage });
    const blog = await approveDraft(idOf(req));
    blog ? res.json({ success: true, blog }) : res.status(409).json({ success: false, error: "Only draft or failed posts can be approved" });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/blogs/:id/reject", async (req, res) => {
  try {
    const blog = await updateBlogDraft(idOf(req), (d) => (d.status === "published" ? null : { ...d, status: "rejected" }));
    blog ? res.json({ success: true, blog }) : res.status(409).json({ success: false, error: "Published posts cannot be rejected" });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/blogs/:id/publish-now", async (req, res) => {
  try {
    const current = await getBlogDraft(idOf(req));
    if (current && imageInProgress(current)) return res.status(409).json({ success: false, error: imageBusyMessage });
    const approved = await approveDraft(idOf(req)) ?? current;
    if (approved?.status !== "approved") return res.status(409).json({ success: false, error: "Post must be a draft or approved" });
    res.json({ success: true, blog: await publishDraft(approved.id) });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
