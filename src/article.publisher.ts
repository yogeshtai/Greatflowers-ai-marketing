import type { ArticleDraft } from "./article.schema.js";
import { getArticleDraft, updateArticleDraft } from "./article.store.js";
import { optimizeArticleImage, readArticleImage, ARTICLE_IMAGE_FILE_EXTENSION, ARTICLE_IMAGE_MIME_TYPE } from "./article.image.js";
import { isArticleDraftImagePending } from "./article.jobs.js";
import { toCatalogProduct } from "./blog.generator.js";
import { nextNewYorkHour } from "./blog.time.js";
import { withGfClient } from "./gf.admin.client.js";
import { errorDetail } from "./http.helpers.js";
import { assertNoTitleCollision } from "./content.overlap.js";
import { liveContentUrl, type ProjectConfig } from "./projects/index.js";

export const articlePublishHourEt = (project: ProjectConfig) => Number(project.env("ARTICLE_PUBLISH_HOUR_ET") ?? 10);
const MAX_ATTEMPTS = 3;
export const articleLiveMode = (project: ProjectConfig) => project.env("ARTICLE_PUBLISH_LIVE") === "true";
export const publishArticleImmediate = (project: ProjectConfig) => (project.env("ARTICLE_PUBLISH_MODE") ?? "immediate") === "immediate";
export const articlePublishAfterFor = (project: ProjectConfig, now: Date = new Date()) =>
  publishArticleImmediate(project) ? now : nextNewYorkHour(articlePublishHourEt(project), now);
export const articleStorefrontUrl = (project: ProjectConfig, slug: string) => liveContentUrl(project, "article", slug);

const publishingDraftIds = new Set<string>();
export const isArticleDraftPublishing = (id: string) => publishingDraftIds.has(id);
export function approveArticleDraft(project: ProjectConfig, id: string, now: Date = new Date()) {
  return updateArticleDraft(project, id, (draft) => draft.status === "draft" || draft.status === "failed"
    ? { ...draft, status: "approved", approvedAt: now.toISOString(), publishAfter: articlePublishAfterFor(project, now).toISOString(), attempts: 0 }
    : null);
}
export const rejectArticleDraft = (project: ProjectConfig, id: string) => updateArticleDraft(project, id, (draft) => draft.status === "published" ? null : { ...draft, status: "rejected" });

export type ArticleApproveResult =
  | { outcome: "approved" | "published" | "publish-failed"; article: ArticleDraft }
  | { outcome: "not-actionable"; status: ArticleDraft["status"] }
  | { outcome: "image-pending" }
  | { outcome: "missing" };

export async function approveArticleFlow(project: ProjectConfig, id: string): Promise<ArticleApproveResult> {
  const draft = await getArticleDraft(project, id);
  if (!draft) return { outcome: "missing" };
  if (isArticleDraftImagePending(project, draft)) return { outcome: "image-pending" };
  const approved = await approveArticleDraft(project, id);
  if (!approved) return { outcome: "not-actionable", status: draft.status };
  if (!publishArticleImmediate(project)) return { outcome: "approved", article: approved };
  const published = await publishArticleDraft(project, id);
  if (!published || published.status !== "published") return { outcome: "publish-failed", article: published ?? approved };
  return { outcome: "published", article: published };
}

async function productImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`article fallback image download failed (${response.status})`);
  return optimizeArticleImage(Buffer.from(await response.arrayBuffer()));
}

async function publish(project: ProjectConfig, draft: ArticleDraft) {
  return withGfClient(project, async (client) => {
    const products = (await client.searchProducts("", 100)).map(toCatalogProduct);
    const [remoteArticles, remoteBlogs, remoteWikis] = await Promise.all([client.listArticles(), client.listBlogs(), client.listWikis()]);
    const existing = remoteArticles.find((article: any) => article.slug === draft.slug);
    if (existing) {
      if (existing.title !== draft.title) throw new Error(`article slug "${draft.slug}" already belongs to "${existing.title}"`);
      return { id: Number(existing.id), status: Number(existing.status) as 0 | 1 };
    }
    if (remoteArticles.some((article: any) => article.title === draft.title)) throw new Error(`article title "${draft.title}" already exists under a different slug`);
    assertNoTitleCollision(draft.title, [
      ...remoteBlogs.map((item: any) => ({ kind: "blog" as const, title: String(item.title), slug: String(item.slug ?? "") })),
      ...remoteWikis.map((item: any) => ({ kind: "wiki" as const, title: String(item.title), slug: String(item.slug ?? "") })),
    ]);
    const aiImage = await readArticleImage(project, draft.id);
    const hero = products.find((product) => product.id === draft.heroProductId);
    if (!aiImage && !hero?.imageUrl) throw new Error(`article hero product ${draft.heroProductId} has no image on the target environment`);
    const imageId = await client.uploadAttachment(aiImage ?? await productImage(hero!.imageUrl!), `${draft.slug}.${ARTICLE_IMAGE_FILE_EXTENSION}`, ARTICLE_IMAGE_MIME_TYPE);
    const status: 0 | 1 = articleLiveMode(project) ? 1 : 0;
    const created = await client.createArticle({
      title: draft.title,
      slug: draft.slug,
      topic: draft.topic,
      author_name: draft.authorName,
      description: draft.description,
      content: draft.html,
      meta_title: draft.metaTitle,
      meta_description: draft.metaDescription,
      article_thumbnail_id: imageId,
      article_meta_image_id: imageId,
      products: draft.productIds,
      is_featured: 0,
      status,
    });
    const id = Number(created?.id ?? created?.data?.id);
    if (!id) throw new Error("create article returned no id");
    return { id, status };
  });
}

export async function publishArticleDraft(project: ProjectConfig, id: string) {
  if (publishingDraftIds.has(id)) return getArticleDraft(project, id);
  publishingDraftIds.add(id);
  try {
    const draft = await getArticleDraft(project, id);
    if (!draft || draft.status !== "approved") return draft ?? null;
    if (isArticleDraftImagePending(project, draft)) return draft;
    const attempts = draft.attempts + 1;
    await updateArticleDraft(project, id, (current) => ({ ...current, attempts }));
    try {
      const result = await publish(project, draft);
      const url = articleStorefrontUrl(project, draft.slug);
      return updateArticleDraft(project, id, (current) => ({ ...current, status: "published", publishedAt: new Date().toISOString(), remoteId: result.id, remoteStatus: result.status, ...(url ? { url } : {}) }));
    } catch (error) {
      const message = errorDetail(error);
      console.error(`Article publish failed (${attempts}/${MAX_ATTEMPTS}) for ${draft.slug}:`, message);
      return updateArticleDraft(project, id, (current) => ({ ...current, error: message, status: attempts >= MAX_ATTEMPTS ? "failed" : "approved" }));
    }
  } finally {
    publishingDraftIds.delete(id);
  }
}
