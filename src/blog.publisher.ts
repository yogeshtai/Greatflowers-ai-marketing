import { withGfClient } from "./gf.admin.client.js";
import { NO_CATEGORY, toCatalogProduct } from "./blog.generator.js";
import { getBlogDraft, updateBlogDraft } from "./blog.store.js";
import { HERO_FILE_EXTENSION, HERO_MIME_TYPE, optimizeHeroImage, readHeroImage } from "./blog.image.js";
import { isDraftImagePending } from "./blog.jobs.js";
import { emitBlogEvent } from "./blog.notify.js";
import { errorDetail } from "./http.helpers.js";
import { nextNewYorkHour } from "./blog.time.js";
import type { BlogDraft } from "./blog.schema.js";
import { assertNoTitleCollision } from "./content.overlap.js";
import { liveContentUrl, type ProjectConfig } from "./projects/index.js";

export const publishHourEt = (project: ProjectConfig) => Number(project.env("BLOG_PUBLISH_HOUR_ET") ?? 10);
const MAX_ATTEMPTS = 3;
const brandSuffix = (project: ProjectConfig) => ` | ${project.brand.displayName}`;
export const liveMode = (project: ProjectConfig) => project.env("BLOG_PUBLISH_LIVE") === "true";

// "immediate" (default) publishes the moment a draft is approved; "scheduled" waits for the daily BLOG_PUBLISH_HOUR_ET slot.
export const publishImmediate = (project: ProjectConfig) => (project.env("BLOG_PUBLISH_MODE") ?? "immediate") === "immediate";
export const publishAfterFor = (project: ProjectConfig, now: Date = new Date()) =>
  (publishImmediate(project) ? now : nextNewYorkHour(publishHourEt(project), now));

export const storefrontUrl = (project: ProjectConfig, slug: string) => liveContentUrl(project, "blog", slug);

const publishingDraftIds = new Set<string>();
export const isDraftPublishing = (id: string) => publishingDraftIds.has(id);

export function approveDraft(project: ProjectConfig, id: string, now: Date = new Date()) {
  return updateBlogDraft(project, id, (d) =>
    d.status === "draft" || d.status === "failed"
      ? { ...d, status: "approved", approvedAt: now.toISOString(), publishAfter: publishAfterFor(project, now).toISOString(), attempts: 0 }
      : null,
  );
}

export const rejectDraft = (project: ProjectConfig, id: string) =>
  updateBlogDraft(project, id, (d) => (d.status === "published" ? null : { ...d, status: "rejected" }));

export type ApproveResult =
  | { outcome: "approved" | "published" | "publish-failed"; blog: BlogDraft }
  | { outcome: "not-actionable"; status: BlogDraft["status"] }
  | { outcome: "image-pending" }
  | { outcome: "missing" };

// Approve plus, in immediate mode, the publish that follows it. Kept as one function so every approval path applies the same rules.
export async function approveFlow(project: ProjectConfig, id: string): Promise<ApproveResult> {
  const draft = await getBlogDraft(project, id);
  if (!draft) return { outcome: "missing" };
  if (isDraftImagePending(project, draft)) return { outcome: "image-pending" };
  const approved = await approveDraft(project, id);
  if (!approved) return { outcome: "not-actionable", status: draft.status };
  if (!publishImmediate(project)) return { outcome: "approved", blog: approved };
  const published = await publishDraft(project, id);
  if (!published || published.status !== "published") return { outcome: "publish-failed", blog: published ?? approved };
  return { outcome: "published", blog: published };
}

async function heroImage(project: ProjectConfig, imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`hero image download failed (${res.status})`);
  return optimizeHeroImage(project, Buffer.from(await res.arrayBuffer()));
}

async function publish(project: ProjectConfig, draft: BlogDraft) {
  return withGfClient(project, async (client) => {
    const [categories, products] = await Promise.all([client.listBlogCategories(), client.searchProducts("", 100)]);
    const categoryIds = [draft.categorySlug, ...(draft.secondCategorySlug ? [draft.secondCategorySlug] : [])].filter((slug) => slug !== NO_CATEGORY).map((slug) => {
      const category = categories.find((c: any) => c.slug === slug);
      if (!category) throw new Error(`category "${slug}" not found`);
      return Number(category.id);
    });
    const aiHero = await readHeroImage(project, draft.id);
    const hero = products.map(toCatalogProduct).find((p) => p.id === draft.heroProductId);
    if (!aiHero && !hero?.imageUrl) throw new Error(`hero product ${draft.heroProductId} has no image on the target environment`);

    const [remoteBlogs, remoteWikis, remoteArticles] = await Promise.all([client.listBlogs(), client.listWikis(), client.listArticles()]);
    const existing = remoteBlogs.find((b: any) => b.slug === draft.slug || b.title === draft.title);
    if (existing) return { id: Number(existing.id), status: Number(existing.status) as 0 | 1, reused: true };
    assertNoTitleCollision(draft.title, [
      ...remoteWikis.map((item: any) => ({ kind: "wiki" as const, title: String(item.title), slug: String(item.slug ?? "") })),
      ...remoteArticles.map((item: any) => ({ kind: "article" as const, title: String(item.title), slug: String(item.slug ?? "") })),
    ]);

    const imageId = await client.uploadAttachment(aiHero ?? await heroImage(project, hero!.imageUrl!), `${draft.slug}.${HERO_FILE_EXTENSION}`, HERO_MIME_TYPE);
    const status: 0 | 1 = liveMode(project) ? 1 : 0;
    const created = await client.createBlog({
      title: draft.title,
      slug: draft.slug,
      author_name: draft.authorName ?? project.brand.defaultAuthor,
      description: draft.summary,
      content: draft.html,
      meta_title: `${draft.metaTitle}${brandSuffix(project)}`,
      meta_description: draft.metaDescription,
      blog_thumbnail_id: imageId,
      blog_meta_image_id: imageId,
      is_all_categories: 0,
      categories: categoryIds,
      is_all_tags: 1,
      is_featured: 1,
      is_sticky: 1,
      status,
    });
    const id = Number(created?.id ?? created?.data?.id);
    if (!id) throw new Error("create blog returned no id");
    return { id, status, reused: false };
  });
}

export async function publishDraft(project: ProjectConfig, id: string) {
  // Claim synchronously, before the first await, so deletion can reliably see an
  // active remote publish and so two publish triggers cannot run for one draft.
  if (publishingDraftIds.has(id)) return getBlogDraft(project, id);
  publishingDraftIds.add(id);
  try {
    const draft = await getBlogDraft(project, id);
    if (!draft || draft.status !== "approved") return draft ?? null;
    const attempts = draft.attempts + 1;
    await updateBlogDraft(project, id, (d) => ({ ...d, attempts }));
    try {
      const result = await publish(project, draft);
      const url = storefrontUrl(project, draft.slug);
      const updated = await updateBlogDraft(project, id, (d) => ({
        ...d, status: "published", publishedAt: new Date().toISOString(), remoteId: result.id, remoteStatus: result.status,
        ...(url ? { url } : {}),
      }));
      if (updated) emitBlogEvent({ type: "published", draft: updated });
      return updated;
    } catch (error) {
      const message = errorDetail(error);
      console.error(`Blog publish failed (${attempts}/${MAX_ATTEMPTS}) for ${draft.slug}:`, message);
      const updated = await updateBlogDraft(project, id, (d) => ({ ...d, error: message, status: attempts >= MAX_ATTEMPTS ? "failed" : "approved" }));
      if (updated?.status === "failed") emitBlogEvent({ type: "publish-failed", draft: updated });
      return updated;
    }
  } finally {
    publishingDraftIds.delete(id);
  }
}
