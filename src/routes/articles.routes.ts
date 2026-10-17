import { unlink } from "node:fs/promises";
import express from "express";
import { z } from "zod";
import { attachArticleImage } from "../article.generator.js";
import { articleImagePaths, existingArticleImagePath } from "../article.image.js";
import { beginArticleImageRegeneration, endArticleImageRegeneration, getArticleGenerationState, isArticleDraftImagePending, startArticleGeneration } from "../article.jobs.js";
import { approveArticleDraft, approveArticleFlow, isArticleDraftPublishing, publishArticleDraft, publishArticleImmediate, rejectArticleDraft } from "../article.publisher.js";
import { ArticleEditSchema } from "../article.schema.js";
import { deleteUnpublishedArticleDraft, getArticleDraft, getArticleDrafts, updateArticleDraft } from "../article.store.js";
import { toCatalogProduct } from "../blog.generator.js";
import { withGfClient } from "../gf.admin.client.js";
import { abortOnDisconnect, errorDetail, singleFlight } from "../http.helpers.js";

const router = express.Router();
const idOf = (req: express.Request) => z.string().uuid().parse(String(req.params.id));
const fail = (res: express.Response, error: unknown, status = 500) => {
  console.error("Article route error:", error);
  return res.status(error instanceof z.ZodError ? 400 : status).json({ success: false, error: errorDetail(error) });
};
const imageBusyMessage = "The article image is still being made for this draft. Try again in a minute.";

router.get("/api/articles/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ success: true, generation: getArticleGenerationState() });
});

router.get("/api/articles", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const [articles, topicRows] = await Promise.all([
      getArticleDrafts(),
      withGfClient((client) => client.listArticleTopics()),
    ]);
    const topics = topicRows.map((topic: any) => String(topic.name ?? topic.id ?? topic));
    res.json({ success: true, articles, topics, liveMode: process.env.ARTICLE_PUBLISH_LIVE === "true", publishMode: publishArticleImmediate() ? "immediate" : "scheduled", generation: getArticleGenerationState() });
  } catch (error) { fail(res, error); }
});

router.post("/api/articles/generate", (_req, res) => {
  startArticleGeneration("manual")
    ? res.status(202).json({ success: true, started: true })
    : res.status(409).json({ success: false, error: "An article draft is already being written. Please wait for it to finish." });
});

router.get("/api/articles/:id/image", (req, res) => {
  try {
    const file = existingArticleImagePath(idOf(req));
    file ? res.sendFile(file) : res.status(404).json({ success: false, error: "No AI article image" });
  } catch (error) { fail(res, error); }
});

router.post("/api/articles/:id/image/regenerate", singleFlight("article", async (req, res) => {
  let id = "";
  let markedPending = false;
  try {
    id = idOf(req);
    const draft = await getArticleDraft(id);
    if (!draft || !["draft", "failed", "approved"].includes(draft.status)) return res.status(409).json({ success: false, error: "Only unpublished articles can get a new image" });
    if (isArticleDraftPublishing(id)) return res.status(409).json({ success: false, error: "This article is currently publishing" });
    markedPending = beginArticleImageRegeneration(id);
    if (!markedPending) return res.status(409).json({ success: false, error: imageBusyMessage });
    const products = await withGfClient((client) => client.searchProducts("", 100));
    const imageUrl = products.map(toCatalogProduct).find((product) => product.id === draft.heroProductId)?.imageUrl;
    res.json({ success: true, article: await attachArticleImage(draft.id, draft, imageUrl, abortOnDisconnect(res)) });
  } catch (error) { fail(res, error); }
  finally { if (markedPending) endArticleImageRegeneration(id); }
}));

router.patch("/api/articles/:id", async (req, res) => {
  try {
    const edit = Object.fromEntries(Object.entries(ArticleEditSchema.parse(req.body)).filter(([, value]) => value !== undefined));
    if (edit.topic) {
      const topicRows = await withGfClient((client) => client.listArticleTopics());
      const topics = topicRows.map((topic: any) => String(topic.name ?? topic.id ?? topic));
      if (!topics.includes(String(edit.topic))) return res.status(400).json({ success: false, error: "Topic must be selected from Great Flowers Admin" });
    }
    const article = await updateArticleDraft(idOf(req), (draft) => draft.status === "draft" || draft.status === "failed" ? { ...draft, ...edit } : null);
    article ? res.json({ success: true, article }) : res.status(409).json({ success: false, error: "Only drafts can be edited" });
  } catch (error) { fail(res, error); }
});

router.delete("/api/articles/:id", async (req, res) => {
  try {
    const id = idOf(req);
    const current = await getArticleDraft(id);
    if (!current) return res.status(404).json({ success: false, error: "Article queue entry not found" });
    if (current.status === "published") return res.status(409).json({ success: false, error: "Published article entries cannot be deleted from the queue" });
    if (isArticleDraftPublishing(id)) return res.status(409).json({ success: false, error: "This article is currently publishing and cannot be deleted" });
    if (isArticleDraftImagePending(current)) return res.status(409).json({ success: false, error: "Wait for the article image to finish before deleting this entry" });
    const deleted = await deleteUnpublishedArticleDraft(id);
    if (!deleted) return res.status(409).json({ success: false, error: "This entry was published or removed before it could be deleted" });
    await Promise.all(articleImagePaths(id).map((file) => unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") console.error(`Could not remove image for deleted article ${id}:`, error); })));
    return res.json({ success: true });
  } catch (error) { return fail(res, error); }
});

router.post("/api/articles/:id/approve", async (req, res) => {
  try {
    const result = await approveArticleFlow(idOf(req));
    if (result.outcome === "image-pending") return res.status(409).json({ success: false, error: imageBusyMessage });
    if (result.outcome === "missing" || result.outcome === "not-actionable") return res.status(409).json({ success: false, error: "Only draft or failed articles can be approved" });
    res.json({ success: true, article: result.article });
  } catch (error) { fail(res, error); }
});

router.post("/api/articles/:id/reject", async (req, res) => {
  try {
    const id = idOf(req);
    if (isArticleDraftPublishing(id)) return res.status(409).json({ success: false, error: "This article is currently publishing and cannot be rejected" });
    const article = await rejectArticleDraft(id);
    article ? res.json({ success: true, article }) : res.status(409).json({ success: false, error: "Published articles cannot be rejected" });
  } catch (error) { fail(res, error); }
});

router.post("/api/articles/:id/publish-now", async (req, res) => {
  try {
    const id = idOf(req);
    const current = await getArticleDraft(id);
    if (current && isArticleDraftImagePending(current)) return res.status(409).json({ success: false, error: imageBusyMessage });
    const approved = await approveArticleDraft(id) ?? current;
    if (approved?.status !== "approved") return res.status(409).json({ success: false, error: "Article must be a draft or approved" });
    res.json({ success: true, article: await publishArticleDraft(approved.id) });
  } catch (error) { fail(res, error); }
});

export default router;
