import { withGfClient } from "./gf.admin.client.js";
import { toCatalogProduct, type CatalogProduct } from "./blog.generator.js";
import { nextNewYorkHour } from "./blog.time.js";
import { errorDetail } from "./http.helpers.js";
import { isWikiDraftImagePending } from "./wiki.jobs.js";
import { optimizeWikiImage, readWikiImage, WIKI_IMAGE_FILE_EXTENSION, WIKI_IMAGE_MIME_TYPE } from "./wiki.image.js";
import type { WikiDraft } from "./wiki.schema.js";
import { assertNoTitleCollision } from "./content.overlap.js";
import { getWikiDraft, updateWikiDraft } from "./wiki.store.js";
import { liveContentUrl, storefrontBase, type ProjectConfig } from "./projects/index.js";

export const wikiPublishHourEt = (project: ProjectConfig) => Number(project.env("WIKI_PUBLISH_HOUR_ET") ?? 10);
const MAX_ATTEMPTS = 3;
export const wikiLiveMode = (project: ProjectConfig) => project.env("WIKI_PUBLISH_LIVE") === "true";

export const publishWikiImmediate = (project: ProjectConfig) => (project.env("WIKI_PUBLISH_MODE") ?? "immediate") === "immediate";
export const wikiPublishAfterFor = (project: ProjectConfig, now: Date = new Date()) =>
  publishWikiImmediate(project) ? now : nextNewYorkHour(wikiPublishHourEt(project), now);

export const wikiStorefrontUrl = (project: ProjectConfig, slug: string) => liveContentUrl(project, "wiki", slug);

const publishingDraftIds = new Set<string>();
export const isWikiDraftPublishing = (id: string) => publishingDraftIds.has(id);

export function approveWikiDraft(project: ProjectConfig, id: string, now: Date = new Date()) {
  return updateWikiDraft(project, id, (draft) =>
    draft.status === "draft" || draft.status === "failed"
      ? { ...draft, status: "approved", approvedAt: now.toISOString(), publishAfter: wikiPublishAfterFor(project, now).toISOString(), attempts: 0 }
      : null,
  );
}

export const rejectWikiDraft = (project: ProjectConfig, id: string) =>
  updateWikiDraft(project, id, (draft) => (draft.status === "published" ? null : { ...draft, status: "rejected" }));

export type WikiApproveResult =
  | { outcome: "approved" | "published" | "publish-failed"; wiki: WikiDraft }
  | { outcome: "not-actionable"; status: WikiDraft["status"] }
  | { outcome: "image-pending" }
  | { outcome: "missing" };

export async function approveWikiFlow(project: ProjectConfig, id: string): Promise<WikiApproveResult> {
  const draft = await getWikiDraft(project, id);
  if (!draft) return { outcome: "missing" };
  if (isWikiDraftImagePending(project, draft)) return { outcome: "image-pending" };
  const approved = await approveWikiDraft(project, id);
  if (!approved) return { outcome: "not-actionable", status: draft.status };
  if (!publishWikiImmediate(project)) return { outcome: "approved", wiki: approved };
  const published = await publishWikiDraft(project, id);
  if (!published || published.status !== "published") return { outcome: "publish-failed", wiki: published ?? approved };
  return { outcome: "published", wiki: published };
}

async function productImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`wiki fallback image download failed (${response.status})`);
  return optimizeWikiImage(Buffer.from(await response.arrayBuffer()));
}

export const withoutLegacyProductEmbeds = (html: string) =>
  html.replace(/<div[^>]*class="blog-product-embed"[^>]*data-product-id="\d+"[^>]*>\s*<\/div>/gi, "");

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

export function buildWikiInlineProductCard(project: ProjectConfig, product: CatalogProduct, base: string): string {
  if (!product.imageUrl) throw new Error(`wiki inline product ${product.id} has no image`);
  const price = product.price == null ? "" : `<p><strong>From $${product.price.toFixed(2)}</strong></p>`;
  return `<p><strong>${escapeHtml(project.brand.productCardBadge)}</strong>&nbsp;</p>`
    + `<figure class="image"><img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}"></figure>`
    + `<p><a href="${base}/${project.storefront.paths.product}/${encodeURIComponent(product.slug)}"><strong>${escapeHtml(product.name)}</strong></a></p>${price}`;
}

export function injectWikiInlineProductCards(project: ProjectConfig, html: string, products: CatalogProduct[], base: string): string {
  const selected = products.filter((product) => product.imageUrl).slice(0, 2);
  if (!selected.length) return html;
  const first = buildWikiInlineProductCard(project, selected[0]!, base);
  const second = selected[1] ? buildWikiInlineProductCard(project, selected[1], base) : "";
  return `${first}${html}${second}`;
}

export function buildWikiPublishPayload(
  project: ProjectConfig,
  draft: WikiDraft,
  imageId: number,
  status: 0 | 1,
  products: CatalogProduct[] = [],
  base: string = storefrontBase(project),
) {
  const cleanContent = withoutLegacyProductEmbeds(draft.html);
  return {
    title: draft.title,
    slug: draft.slug,
    botanical_name: draft.botanicalName,
    author_name: draft.authorName,
    description: draft.description,
    content: injectWikiInlineProductCards(project, cleanContent, products, base),
    meta_title: draft.metaTitle,
    meta_description: draft.metaDescription,
    wiki_thumbnail_id: imageId,
    wiki_meta_image_id: imageId,
    products: draft.productIds,
    is_featured: 0,
    status,
  };
}

async function publish(project: ProjectConfig, draft: WikiDraft) {
  return withGfClient(project, async (client) => {
    const rawProducts = await client.searchProducts("", 100);
    const products = rawProducts.map(toCatalogProduct);
    const selectedProducts = draft.productIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is CatalogProduct => !!product);
    if (selectedProducts.length !== draft.productIds.length) throw new Error("one or more wiki products are no longer available");
    const [remoteWikis, remoteBlogs, remoteArticles] = await Promise.all([client.listWikis(), client.listBlogs(), client.listArticles()]);
    const existing = remoteWikis.find((wiki: any) => wiki.slug === draft.slug);
    if (existing) {
      if (existing.title !== draft.title) throw new Error(`wiki slug "${draft.slug}" already belongs to "${existing.title}"`);
      const existingImageId = Number(existing.wiki_thumbnail_id ?? existing.wiki_meta_image_id);
      if (!existingImageId) throw new Error(`existing wiki "${draft.slug}" has no reusable image id`);
      const existingStatus = Number(existing.status) === 1 ? 1 : 0;
      const targetStatus: 0 | 1 = (existingStatus === 1 || wikiLiveMode(project)) ? 1 : 0;
      await client.updateWiki(Number(existing.id), buildWikiPublishPayload(project, draft, existingImageId, targetStatus, selectedProducts));
      return { id: Number(existing.id), status: targetStatus, reused: true };
    }
    if (remoteWikis.some((wiki: any) => wiki.title === draft.title)) {
      throw new Error(`wiki title "${draft.title}" already exists under a different slug`);
    }
    assertNoTitleCollision(draft.title, [
      ...remoteBlogs.map((item: any) => ({ kind: "blog" as const, title: String(item.title), slug: String(item.slug ?? "") })),
      ...remoteArticles.map((item: any) => ({ kind: "article" as const, title: String(item.title), slug: String(item.slug ?? "") })),
    ]);

    const aiImage = await readWikiImage(project, draft.id);
    const hero = products.find((product) => product.id === draft.heroProductId);
    if (!aiImage && !hero?.imageUrl) throw new Error(`wiki hero product ${draft.heroProductId} has no image on the target environment`);
    const imageId = await client.uploadAttachment(aiImage ?? await productImage(hero!.imageUrl!), `${draft.slug}.${WIKI_IMAGE_FILE_EXTENSION}`, WIKI_IMAGE_MIME_TYPE);
    const targetStatus: 0 | 1 = wikiLiveMode(project) ? 1 : 0;
    const payload = buildWikiPublishPayload(project, draft, imageId, targetStatus, selectedProducts);
    // Keep the page hidden until the follow-up update has attached products.
    const created = await client.createWiki({ ...payload, status: 0 });
    const id = Number(created?.id ?? created?.data?.id);
    if (!id) throw new Error("create wiki returned no id");
    // The create endpoint stores the wiki body but does not currently sync its
    // product relation. The admin edit endpoint does, so mirror that operation.
    await client.updateWiki(id, payload);
    return { id, status: targetStatus, reused: false };
  });
}

export async function publishWikiDraft(project: ProjectConfig, id: string) {
  if (publishingDraftIds.has(id)) return getWikiDraft(project, id);
  publishingDraftIds.add(id);
  try {
    const draft = await getWikiDraft(project, id);
    if (!draft || draft.status !== "approved") return draft ?? null;
    if (isWikiDraftImagePending(project, draft)) return draft;
    const attempts = draft.attempts + 1;
    await updateWikiDraft(project, id, (current) => ({ ...current, attempts }));
    try {
      const result = await publish(project, draft);
      const url = wikiStorefrontUrl(project, draft.slug);
      return updateWikiDraft(project, id, (current) => ({
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
      return updateWikiDraft(project, id, (current) => ({
        ...current,
        error: message,
        status: attempts >= MAX_ATTEMPTS ? "failed" : "approved",
      }));
    }
  } finally {
    publishingDraftIds.delete(id);
  }
}
