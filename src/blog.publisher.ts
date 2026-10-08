import sharp from "sharp";
import { withGfClient } from "./gf.admin.client.js";
import { NO_CATEGORY, toCatalogProduct } from "./blog.generator.js";
import { getBlogDraft, updateBlogDraft } from "./blog.store.js";
import { HERO_HEIGHT, HERO_WIDTH, readHeroImage } from "./blog.image.js";
import { isDraftImagePending } from "./blog.jobs.js";
import { emitBlogEvent } from "./blog.notify.js";
import { errorDetail } from "./http.helpers.js";
import { nextNewYorkHour } from "./blog.time.js";
import type { BlogDraft } from "./blog.schema.js";

export const PUBLISH_HOUR_ET = Number(process.env.BLOG_PUBLISH_HOUR_ET ?? 10);
const MAX_ATTEMPTS = 3;
const BRAND_SUFFIX = " | Great Flowers";
const liveMode = () => process.env.BLOG_PUBLISH_LIVE === "true";

// "immediate" (default) publishes the moment a draft is approved; "scheduled" waits for the daily BLOG_PUBLISH_HOUR_ET slot.
export const publishImmediate = () => (process.env.BLOG_PUBLISH_MODE ?? "immediate") === "immediate";
export const publishAfterFor = (now: Date = new Date()) => (publishImmediate() ? now : nextNewYorkHour(PUBLISH_HOUR_ET, now));

export const storefrontUrl = (slug: string) =>
  process.env.GF_STOREFRONT_URL ? `${process.env.GF_STOREFRONT_URL.replace(/\/+$/, "")}/blogs/${slug}/` : undefined;

export function approveDraft(id: string, now: Date = new Date()) {
  return updateBlogDraft(id, (d) =>
    d.status === "draft" || d.status === "failed"
      ? { ...d, status: "approved", approvedAt: now.toISOString(), publishAfter: publishAfterFor(now).toISOString(), attempts: 0 }
      : null,
  );
}

export const rejectDraft = (id: string) =>
  updateBlogDraft(id, (d) => (d.status === "published" ? null : { ...d, status: "rejected" }));

export type ApproveResult =
  | { outcome: "approved" | "published" | "publish-failed"; blog: BlogDraft }
  | { outcome: "not-actionable"; status: BlogDraft["status"] }
  | { outcome: "image-pending" }
  | { outcome: "missing" };

// Approve plus, in immediate mode, the publish that follows it. Kept as one function so every approval path applies the same rules.
export async function approveFlow(id: string): Promise<ApproveResult> {
  const draft = await getBlogDraft(id);
  if (!draft) return { outcome: "missing" };
  if (isDraftImagePending(draft)) return { outcome: "image-pending" };
  const approved = await approveDraft(id);
  if (!approved) return { outcome: "not-actionable", status: draft.status };
  if (!publishImmediate()) return { outcome: "approved", blog: approved };
  const published = await publishDraft(id);
  if (!published || published.status !== "published") return { outcome: "publish-failed", blog: published ?? approved };
  return { outcome: "published", blog: published };
}

async function heroImage(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`hero image download failed (${res.status})`);
  return sharp(Buffer.from(await res.arrayBuffer())).resize(HERO_WIDTH, HERO_HEIGHT, { fit: "cover" }).png().toBuffer();
}

async function publish(draft: BlogDraft) {
  return withGfClient(async (client) => {
    const [categories, products] = await Promise.all([client.listBlogCategories(), client.searchProducts("", 100)]);
    const categoryIds = [draft.categorySlug, ...(draft.secondCategorySlug ? [draft.secondCategorySlug] : [])].filter((slug) => slug !== NO_CATEGORY).map((slug) => {
      const category = categories.find((c: any) => c.slug === slug);
      if (!category) throw new Error(`category "${slug}" not found`);
      return Number(category.id);
    });
    const aiHero = await readHeroImage(draft.id);
    const hero = products.map(toCatalogProduct).find((p) => p.id === draft.heroProductId);
    if (!aiHero && !hero?.imageUrl) throw new Error(`hero product ${draft.heroProductId} has no image on the target environment`);

    const existing = (await client.listBlogs()).find((b: any) => b.slug === draft.slug || b.title === draft.title);
    if (existing) return { id: Number(existing.id), status: Number(existing.status) as 0 | 1, reused: true };

    const imageId = await client.uploadAttachment(aiHero ?? await heroImage(hero!.imageUrl!), `${draft.slug}.png`, "image/png");
    const status: 0 | 1 = liveMode() ? 1 : 0;
    const created = await client.createBlog({
      title: draft.title,
      slug: draft.slug,
      description: draft.summary,
      content: draft.html,
      meta_title: `${draft.metaTitle}${BRAND_SUFFIX}`,
      meta_description: draft.metaDescription,
      blog_thumbnail_id: imageId,
      blog_meta_image_id: imageId,
      is_all_categories: 0,
      categories: categoryIds,
      is_all_tags: 1,
      is_featured: 0,
      is_sticky: 0,
      status,
    });
    const id = Number(created?.id ?? created?.data?.id);
    if (!id) throw new Error("create blog returned no id");
    return { id, status, reused: false };
  });
}

export async function publishDraft(id: string) {
  const draft = await getBlogDraft(id);
  if (!draft || draft.status !== "approved") return draft ?? null;
  const attempts = draft.attempts + 1;
  await updateBlogDraft(id, (d) => ({ ...d, attempts }));
  try {
    const result = await publish(draft);
    const url = storefrontUrl(draft.slug);
    const updated = await updateBlogDraft(id, (d) => ({
      ...d, status: "published", publishedAt: new Date().toISOString(), remoteId: result.id, remoteStatus: result.status,
      ...(url ? { url } : {}),
    }));
    if (updated) emitBlogEvent({ type: "published", draft: updated });
    return updated;
  } catch (error) {
    const message = errorDetail(error);
    console.error(`Blog publish failed (${attempts}/${MAX_ATTEMPTS}) for ${draft.slug}:`, message);
    const updated = await updateBlogDraft(id, (d) => ({ ...d, error: message, status: attempts >= MAX_ATTEMPTS ? "failed" : "approved" }));
    if (updated?.status === "failed") emitBlogEvent({ type: "publish-failed", draft: updated });
    return updated;
  }
}
