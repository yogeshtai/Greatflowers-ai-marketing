import sharp from "sharp";
import { withGfClient } from "./gf.admin.client.js";
import { toCatalogProduct } from "./blog.generator.js";
import { getBlogDraft, updateBlogDraft } from "./blog.store.js";
import { nextNewYorkHour } from "./blog.time.js";
import type { BlogDraft } from "./blog.schema.js";

export const PUBLISH_HOUR_ET = Number(process.env.BLOG_PUBLISH_HOUR_ET ?? 10);
const MAX_ATTEMPTS = 3;
const BRAND_SUFFIX = " | Great Flowers";
const liveMode = () => process.env.BLOG_PUBLISH_LIVE === "true";

export const storefrontUrl = (slug: string) =>
  process.env.GF_STOREFRONT_URL ? `${process.env.GF_STOREFRONT_URL.replace(/\/+$/, "")}/blogs/${slug}/` : undefined;

export function approveDraft(id: string, now: Date = new Date()) {
  return updateBlogDraft(id, (d) =>
    d.status === "draft" || d.status === "failed"
      ? { ...d, status: "approved", approvedAt: now.toISOString(), publishAfter: nextNewYorkHour(PUBLISH_HOUR_ET, now).toISOString(), attempts: 0 }
      : null,
  );
}

async function heroImage(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`hero image download failed (${res.status})`);
  return sharp(Buffer.from(await res.arrayBuffer())).resize(1200, 630, { fit: "cover" }).png().toBuffer();
}

async function publish(draft: BlogDraft) {
  return withGfClient(async (client) => {
    const [categories, products] = await Promise.all([client.listBlogCategories(), client.searchProducts("", 100)]);
    const categoryIds = [draft.categorySlug, ...(draft.secondCategorySlug ? [draft.secondCategorySlug] : [])].map((slug) => {
      const category = categories.find((c: any) => c.slug === slug);
      if (!category) throw new Error(`category "${slug}" not found`);
      return Number(category.id);
    });
    const hero = products.map(toCatalogProduct).find((p) => p.id === draft.heroProductId);
    if (!hero?.imageUrl) throw new Error(`hero product ${draft.heroProductId} has no image on the target environment`);

    const existing = (await client.listBlogs()).find((b: any) => b.slug === draft.slug || b.title === draft.title);
    if (existing) return { id: Number(existing.id), status: Number(existing.status) as 0 | 1, reused: true };

    const imageId = await client.uploadAttachment(await heroImage(hero.imageUrl), `${draft.slug}.png`, "image/png");
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
    return await updateBlogDraft(id, (d) => ({
      ...d, status: "published", publishedAt: new Date().toISOString(), remoteId: result.id, remoteStatus: result.status,
      ...(url ? { url } : {}),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Blog publish failed (${attempts}/${MAX_ATTEMPTS}) for ${draft.slug}:`, message);
    return updateBlogDraft(id, (d) => ({ ...d, error: message, status: attempts >= MAX_ATTEMPTS ? "failed" : "approved" }));
  }
}
