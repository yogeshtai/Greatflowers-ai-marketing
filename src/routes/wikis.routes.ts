import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import express from "express";
import { z } from "zod";
import { toCatalogProduct } from "../blog.generator.js";
import { withGfClient } from "../gf.admin.client.js";
import { abortOnDisconnect, errorDetail, singleFlight } from "../http.helpers.js";
import { attachWikiImage } from "../wiki.generator.js";
import { beginWikiImageRegeneration, endWikiImageRegeneration, getWikiGenerationState, isWikiDraftImagePending, startWikiGeneration } from "../wiki.jobs.js";
import { wikiImagePath } from "../wiki.image.js";
import { approveWikiDraft, approveWikiFlow, isWikiDraftPublishing, publishWikiDraft, publishWikiImmediate, rejectWikiDraft } from "../wiki.publisher.js";
import { WikiEditSchema } from "../wiki.schema.js";
import { deleteUnpublishedWikiDraft, getWikiDraft, getWikiDrafts, updateWikiDraft } from "../wiki.store.js";

const router = express.Router();
const idOf = (req: express.Request) => z.string().uuid().parse(String(req.params.id));
const fail = (res: express.Response, error: unknown, status = 500) => {
  console.error("Wiki route error:", error);
  return res.status(error instanceof z.ZodError ? 400 : status).json({ success: false, error: errorDetail(error) });
};
const imageBusyMessage = "The wiki image is still being made for this draft. Try again in a minute.";

router.get("/api/wikis/status", (_req, res) => {
  res.json({ success: true, generation: getWikiGenerationState() });
});

router.get("/api/wikis", async (_req, res) => {
  try {
    res.json({
      success: true,
      wikis: await getWikiDrafts(),
      liveMode: process.env.WIKI_PUBLISH_LIVE === "true",
      publishMode: publishWikiImmediate() ? "immediate" : "scheduled",
      generation: getWikiGenerationState(),
    });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/wikis/generate", (_req, res) => {
  startWikiGeneration("manual")
    ? res.status(202).json({ success: true, started: true })
    : res.status(409).json({ success: false, error: "A wiki draft is already being written. Please wait for it to finish." });
});

router.get("/api/wikis/:id/image", (req, res) => {
  try {
    const file = wikiImagePath(idOf(req));
    existsSync(file) ? res.sendFile(file) : res.status(404).json({ success: false, error: "No AI wiki image" });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/wikis/:id/image/regenerate", singleFlight("wiki", async (req, res) => {
  let id = "";
  let markedPending = false;
  try {
    id = idOf(req);
    const draft = await getWikiDraft(id);
    if (!draft || !["draft", "failed", "approved"].includes(draft.status)) {
      return res.status(409).json({ success: false, error: "Only unpublished wiki entries can get a new image" });
    }
    if (isWikiDraftPublishing(id)) return res.status(409).json({ success: false, error: "This wiki entry is currently publishing" });
    markedPending = beginWikiImageRegeneration(id);
    if (!markedPending) return res.status(409).json({ success: false, error: imageBusyMessage });
    const products = await withGfClient((client) => client.searchProducts("", 100));
    const imageUrl = products.map(toCatalogProduct).find((product) => product.id === draft.heroProductId)?.imageUrl;
    res.json({ success: true, wiki: await attachWikiImage(draft.id, draft, imageUrl, abortOnDisconnect(res)) });
  } catch (error) {
    fail(res, error);
  } finally {
    if (markedPending) endWikiImageRegeneration(id);
  }
}));

router.patch("/api/wikis/:id", async (req, res) => {
  try {
    const edit = Object.fromEntries(Object.entries(WikiEditSchema.parse(req.body)).filter(([, value]) => value !== undefined));
    const wiki = await updateWikiDraft(idOf(req), (draft) =>
      draft.status === "draft" || draft.status === "failed" ? { ...draft, ...edit } : null,
    );
    wiki ? res.json({ success: true, wiki }) : res.status(409).json({ success: false, error: "Only drafts can be edited" });
  } catch (error) {
    fail(res, error);
  }
});

router.delete("/api/wikis/:id", async (req, res) => {
  try {
    const id = idOf(req);
    const current = await getWikiDraft(id);
    if (!current) return res.status(404).json({ success: false, error: "Wiki queue entry not found" });
    if (current.status === "published") return res.status(409).json({ success: false, error: "Published wiki entries cannot be deleted from the queue" });
    if (isWikiDraftPublishing(id)) return res.status(409).json({ success: false, error: "This wiki entry is currently publishing and cannot be deleted" });
    if (isWikiDraftImagePending(current)) return res.status(409).json({ success: false, error: "Wait for the wiki image to finish before deleting this entry" });
    const deleted = await deleteUnpublishedWikiDraft(id);
    if (!deleted) return res.status(409).json({ success: false, error: "This entry was published or removed before it could be deleted" });
    await unlink(wikiImagePath(id)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") console.error(`Could not remove image for deleted wiki ${id}:`, error);
    });
    return res.json({ success: true });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/api/wikis/:id/approve", async (req, res) => {
  try {
    const result = await approveWikiFlow(idOf(req));
    if (result.outcome === "image-pending") return res.status(409).json({ success: false, error: imageBusyMessage });
    if (result.outcome === "missing" || result.outcome === "not-actionable") return res.status(409).json({ success: false, error: "Only draft or failed wiki entries can be approved" });
    res.json({ success: true, wiki: result.wiki });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/wikis/:id/reject", async (req, res) => {
  try {
    const id = idOf(req);
    if (isWikiDraftPublishing(id)) return res.status(409).json({ success: false, error: "This wiki entry is currently publishing and cannot be rejected" });
    const wiki = await rejectWikiDraft(id);
    wiki ? res.json({ success: true, wiki }) : res.status(409).json({ success: false, error: "Published wiki entries cannot be rejected" });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/api/wikis/:id/publish-now", async (req, res) => {
  try {
    const current = await getWikiDraft(idOf(req));
    if (current && isWikiDraftImagePending(current)) return res.status(409).json({ success: false, error: imageBusyMessage });
    const approved = await approveWikiDraft(idOf(req)) ?? current;
    if (approved?.status !== "approved") return res.status(409).json({ success: false, error: "Wiki entry must be a draft or approved" });
    res.json({ success: true, wiki: await publishWikiDraft(approved.id) });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
