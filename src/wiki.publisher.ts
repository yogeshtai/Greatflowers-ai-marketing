import { withGfClient } from "./gf.admin.client.js";
import { toCatalogProduct } from "./blog.generator.js";
import { nextNewYorkHour } from "./blog.time.js";
import { errorDetail } from "./http.helpers.js";
import { isWikiDraftImagePending } from "./wiki.jobs.js";
import { optimizeWikiImage, readWikiImage, WIKI_IMAGE_FILE_EXTENSION, WIKI_IMAGE_MIME_TYPE } from "./wiki.image.js";
import type { WikiDraft } from "./wiki.schema.js";
import { getWikiDraft, updateWikiDraft } from "./wiki.store.js";

export const WIKI_PUBLISH_HOUR_ET = Number(process.env.WIKI_PUBLISH_HOUR_ET ?? 10);
const MAX_ATTEMPTS = 3;
const liveMode = () => process.env.WIKI_PUBLISH_LIVE === "true";

export const publishWikiImmediate = () => (process.env.WIKI_PUBLISH_MODE ?? "immediate") === "immediate";
export const wikiPublishAfterFor = (now: Date = new Date()) =>
  publishWikiImmediate() ? now : nextNewYorkHour(WIKI_PUBLISH_HOUR_ET, now);

export const wikiStorefrontUrl = (slug: string) =>
  process.env.GF_STOREFRONT_URL
    ? `${process.env.GF_STOREFRONT_URL.replace(/\/+$/, "")}/greatflowers-wiki/${slug}/`
    : undefined;

const publishingDraftIds = new Set<string>();
export const isWikiDraftPublishing = (id: string) => publishingDraftIds.has(id);

export function approveWikiDraft(id: string, now: Date = new Date()) {
  return updateWikiDraft(id, (draft) =>
    draft.status === "draft" || draft.status === "failed"
      ? { ...draft, status: "approved", approvedAt: now.toISOString(), publishAfter: wikiPublishAfterFor(now).toISOString(), attempts: 0 }
      : null,
  );
}

export const rejectWikiDraft = (id: string) =>
  updateWikiDraft(id, (draft) => (draft.status === "published" ? null : { ...draft, status: "rejected" }));

export type WikiApproveResult =
  | { outcome: "approved" | "published" | "publish-failed"; wiki: WikiDraft }
  | { outcome: "not-actionable"; status: WikiDraft["status"] }
  | { outcome: "image-pending" }
  | { outcome: "missing" };

export async function approveWikiFlow(id: string): Promise<WikiApproveResult> {
  const draft = await getWikiDraft(id);
  if (!draft) return { outcome: "missing" };
  if (isWikiDraftImagePending(draft)) return { outcome: "image-pending" };
  const approved = await approveWikiDraft(id);
  if (!approved) return { outcome: "not-actionable", status: draft.status };
  if (!publishWikiImmediate()) return { outcome: "approved", wiki: approved };
  const published = await publishWikiDraft(id);
  if (!published || published.status !== "published") return { outcome: "publish-failed", wiki: published ?? approved };
  return { outcome: "published", wiki: published };
}

async function productImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`wiki fallback image download failed (${response.status})`);
  return optimizeWikiImage(Buffer.from(await response.arrayBuffer()));
}

async function publish(draft: WikiDraft) {
  return withGfClient(async (client) => {
    const rawProducts = await client.searchProducts("", 100);
    const products = rawProducts.map(toCatalogProduct);
    const remoteWikis = await client.listWikis();
    const existing = remoteWikis.find((wiki: any) => wiki.slug === draft.slug);
    if (existing) {
      if (existing.title !== draft.title) throw new Error(`wiki slug "${draft.slug}" already belongs to "${existing.title}"`);
      return { id: Number(existing.id), status: Number(existing.status) as 0 | 1, reused: true };
    }
    if (remoteWikis.some((wiki: any) => wiki.title === draft.title)) {
      throw new Error(`wiki title "${draft.title}" already exists under a different slug`);
    }

    const aiImage = await readWikiImage(draft.id);
    const hero = products.find((product) => product.id === draft.heroProductId);
    if (!aiImage && !hero?.imageUrl) throw new Error(`wiki hero product ${draft.heroProductId} has no image on the target environment`);
    const imageId = await client.uploadAttachment(aiImage ?? await productImage(hero!.imageUrl!), `${draft.slug}.${WIKI_IMAGE_FILE_EXTENSION}`, WIKI_IMAGE_MIME_TYPE);
    const status: 0 | 1 = liveMode() ? 1 : 0;
    const created = await client.createWiki({
      title: draft.title,
      slug: draft.slug,
      botanical_name: draft.botanicalName,
      author_name: draft.authorName,
      description: draft.description,
      content: draft.html,
      meta_title: draft.metaTitle,
      meta_description: draft.metaDescription,
      wiki_thumbnail_id: imageId,
      wiki_meta_image_id: imageId,
      products: draft.productIds,
      is_featured: 0,
      status,
    });
    const id = Number(created?.id ?? created?.data?.id);
    if (!id) throw new Error("create wiki returned no id");
    return { id, status, reused: false };
  });
}

export async function publishWikiDraft(id: string) {
  if (publishingDraftIds.has(id)) return getWikiDraft(id);
  publishingDraftIds.add(id);
  try {
    const draft = await getWikiDraft(id);
    if (!draft || draft.status !== "approved") return draft ?? null;
    if (isWikiDraftImagePending(draft)) return draft;
    const attempts = draft.attempts + 1;
    await updateWikiDraft(id, (current) => ({ ...current, attempts }));
    try {
      const result = await publish(draft);
      const url = wikiStorefrontUrl(draft.slug);
      return updateWikiDraft(id, (current) => ({
        ...current,
        status: "published",
        publishedAt: new Date().toISOString(),
        remoteId: result.id,
        remoteStatus: result.status,
        ...(url ? { url } : {}),
      }));
    } catch (error) {
      const message = errorDetail(error);
      console.error(`Wiki publish failed (${attempts}/${MAX_ATTEMPTS}) for ${draft.slug}:`, message);
      return updateWikiDraft(id, (current) => ({
        ...current,
        error: message,
        status: attempts >= MAX_ATTEMPTS ? "failed" : "approved",
      }));
    }
  } finally {
    publishingDraftIds.delete(id);
  }
}
