import { formatOccasionGuidance, getUpcomingOccasions } from "./occasion.calendar.js";
import { requestHermesJSON } from "./hermes.json.js";
import { parseModelJSON } from "./model.json.js";
import { GeneratedPostJsonSchema, GeneratedPostSchema, type GeneratedPost } from "./blog.schema.js";
import { addBlogDraft, getBlogDrafts } from "./blog.store.js";
import { gfApiHost, withGfClient } from "./gf.admin.client.js";

export const EMBED_RE = /<div[^>]*class="blog-product-embed"[^>]*data-product-id="(\d+)"[^>]*>\s*<\/div>/gi;

export interface CatalogProduct {
  id: number;
  name: string;
  slug: string;
  price: number | null;
  imageUrl: string | null;
}

export function toCatalogProduct(raw: any): CatalogProduct {
  return {
    id: Number(raw.id),
    name: String(raw.name),
    slug: String(raw.slug),
    price: Number(raw.sale_price || raw.price) || null,
    imageUrl: raw.product_thumbnail?.original_url ?? null,
  };
}

// Keeps only embeds that point at products we actually supplied, so a hallucinated id never reaches the storefront.
export function sanitizeEmbeds(html: string, allowedIds: Set<number>): string {
  return html.replace(EMBED_RE, (match, id) => (allowedIds.has(Number(id)) ? match : ""));
}

export const storefrontBase = () => (process.env.GF_STOREFRONT_URL || "https://greatflowers.net").replace(/\/+$/, "");

// The model only writes PRODUCT:<id>, BLOG:<slug> or HOME as link targets; real URLs are built here from catalog data.
export function resolveLinks(html: string, ctx: { productSlugs: Map<number, string>; blogSlugs: Set<string>; base: string }): string {
  if ((html.match(/href\s*=/gi) ?? []).length !== (html.match(/href="[^"]*"/gi) ?? []).length) throw new Error('every link must use the exact form href="..." with double quotes');
  return html.replace(/href="([^"]*)"/gi, (_match, href: string) => {
    if (href === "HOME") return `href="${ctx.base}/"`;
    const product = /^PRODUCT:(\d+)$/.exec(href);
    if (product) {
      const slug = ctx.productSlugs.get(Number(product[1]));
      if (!slug) throw new Error(`link to unknown product ${product[1]}`);
      return `href="${ctx.base}/product/${slug}/"`;
    }
    const blog = /^BLOG:([a-z0-9-]+)$/.exec(href);
    if (blog) {
      if (!ctx.blogSlugs.has(blog[1]!)) throw new Error(`link to unknown blog slug ${blog[1]}`);
      return `href="${ctx.base}/blogs/${blog[1]}/"`;
    }
    throw new Error(`link target "${href.slice(0, 60)}" is not allowed; use only PRODUCT:<id>, BLOG:<slug> or HOME`);
  });
}

export function buildBlogPrompt(args: {
  today: string;
  existingTitles: string[];
  existingSlugs: string[];
  categories: Array<{ slug: string; name: string }>;
  products: CatalogProduct[];
  related: Array<{ slug: string; title: string }>;
}): string {
  const upcoming = getUpcomingOccasions(50).slice(0, 5).map((o) => `${o.name} (${o.daysUntil} days away)`);
  return `You are the SEO content writer for GreatFlowers (greatflowers.net), a US online florist with same-day flower delivery.
Write ONE new blog post for today (${args.today}).

${formatOccasionGuidance()}

TOPIC RULES
- Occasions coming up in the next 50 days (blog posts need lead time to rank): ${upcoming.length ? upcoming.join("; ") : "none"}. Prefer one of these that has NO existing post yet (check the existing titles). Choose an evergreen topic only if every upcoming occasion is already well covered.
- It must be clearly different from every existing post listed below (different search intent, not a rewording).
- Existing post titles (do NOT repeat or closely paraphrase):
${args.existingTitles.slice(0, 120).map((t) => `  - ${t}`).join("\n")}
- Existing slugs already taken: ${args.existingSlugs.slice(0, 200).join(", ")}

CATEGORIES (choose exactly one categorySlug from this list):
${args.categories.map((c) => `  - ${c.slug} (${c.name})`).join("\n")}

EXISTING POSTS YOU MAY LINK TO (slug: title):
${args.related.map((r) => `  - ${r.slug}: ${r.title}`).join("\n") || "  (none)"}

PRODUCT CATALOG (use ONLY these; never invent products, prices, or availability):
${args.products.map((p) => `  - id ${p.id}: ${p.name}${p.price ? ` ($${p.price})` : ""}`).join("\n")}

WRITING RULES
- 700 to 1100 words, warm and helpful, written for US gift buyers. Answer the reader's real question.
- html must be plain HTML only: <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em>, <a>. No <h1>, no inline styles, no scripts, no images.
- Include 4 to 6 <h2> sections and a final FAQ section with <h2>Frequently Asked Questions</h2> and 3 to 4 <h3> questions with <p> answers.
- Mention 2 to 4 catalog products naturally. After the paragraph that discusses a product, embed it with EXACTLY: <div class="blog-product-embed" data-product-id="PRODUCT_ID"></div> (PRODUCT_ID from the catalog). List each used id in productIds. Do not use any other product markup.
- heroProductId must be one of the productIds; its photo becomes the post image.
- LINKS: every href must be exactly one of: PRODUCT:<id> (a catalog id), BLOG:<slug> (a slug from the existing posts list) or HOME. Never write a real URL. Link a product's name once in the text with <a href="PRODUCT:<id>">Name</a>. Include 1 or 2 BLOG: links to the most relevant existing posts${args.related.length ? "" : " (skip if none listed)"}, and end the post with a short closing paragraph that links <a href="HOME">Great Flowers</a>.
- Write as GreatFlowers speaking to its own customers. Do not give generic advice about "online florists", "looking for a florist", "subscription services" or how to shop elsewhere; every section must help the reader choose or send flowers from GreatFlowers.
- Do not state historical, scientific or cultural origin claims (for example "dates back to ancient Rome") unless they are common, well-established knowledge; if unsure, leave them out and describe meanings as "traditionally associated with".
- Do not invent statistics, awards, delivery guarantees, discounts, promo codes, or competitor names. Do not write "SAVE15" or any code.
- Do not claim same-day delivery is guaranteed everywhere; say "same-day delivery is available in many areas".
- title: 50-70 characters, natural, includes the main keyword. metaTitle: 10-55 characters, WITHOUT the brand name (we append " | Great Flowers" ourselves). metaDescription: 120-160 characters. summary: 1-2 sentences.
- slug: lowercase-hyphenated, unique vs the taken slugs.
Return the JSON object only.`;
}

export function validatePost(
  output: string,
  ctx: { existingTitles: string[]; existingSlugs: string[]; categories: Set<string>; products: CatalogProduct[]; relatedSlugs: Set<string>; base: string },
): GeneratedPost {
  const productIds = new Set(ctx.products.map((p) => p.id));
  const post = GeneratedPostSchema.parse(parseModelJSON(output));
  const lower = post.title.toLowerCase();
  if (ctx.existingTitles.some((t) => t.toLowerCase() === lower)) throw new Error("title duplicates an existing post");
  if (ctx.existingSlugs.includes(post.slug)) throw new Error("slug is already taken");
  if (!ctx.categories.has(post.categorySlug)) throw new Error(`categorySlug must be one of: ${[...ctx.categories].join(", ")}`);
  const bad = post.productIds.filter((id) => !productIds.has(id));
  if (bad.length) throw new Error(`productIds not in catalog: ${bad.join(", ")}`);
  if (!post.productIds.includes(post.heroProductId)) throw new Error("heroProductId must be one of productIds");
  if (!/href="HOME"/.test(post.html)) throw new Error('html must end with a closing paragraph linking <a href="HOME">Great Flowers</a>');
  if (ctx.relatedSlugs.size && !/href="BLOG:/.test(post.html)) throw new Error("html must link at least one existing post with href=\"BLOG:<slug>\"");
  const embedded = sanitizeEmbeds(post.html, new Set(post.productIds));
  if (!new RegExp(EMBED_RE.source, "i").test(embedded)) throw new Error("html must embed at least one product with the exact blog-product-embed div");
  const html = resolveLinks(embedded, { productSlugs: new Map(ctx.products.map((p) => [p.id, p.slug])), blogSlugs: ctx.relatedSlugs, base: ctx.base });
  return { ...post, html };
}

export async function generateDailyBlogDraft(signal?: AbortSignal) {
  const environment = gfApiHost();
  const context = await withGfClient(async (client) => {
    const [blogs, categories, products] = await Promise.all([client.listBlogs(), client.listBlogCategories(), client.searchProducts("", 40)]);
    return { blogs, categories, products };
  });

  const localDrafts = (await getBlogDrafts()).filter((d) => d.environment === environment && d.status !== "rejected");
  const existingTitles = [...context.blogs.map((b: any) => String(b.title)), ...localDrafts.map((d) => d.title)];
  const existingSlugs = [...context.blogs.map((b: any) => String(b.slug)), ...localDrafts.map((d) => d.slug)];
  const categories = context.categories.map((c: any) => ({ slug: String(c.slug), name: String(c.name) }));
  const products = context.products.map(toCatalogProduct).filter((p) => p.imageUrl);
  if (!categories.length) throw new Error("No blog categories found on the target environment");
  if (products.length < 4) throw new Error("Not enough catalog products with images to write a post");

  const related = context.blogs.filter((b: any) => Number(b.status) === 1).slice(0, 80).map((b: any) => ({ slug: String(b.slug), title: String(b.title) }));
  const base = storefrontBase();
  const prompt = buildBlogPrompt({ today: new Date().toISOString().slice(0, 10), existingTitles, existingSlugs, categories, products, related });
  const post = await requestHermesJSON(
    prompt,
    (output) => validatePost(output, { existingTitles, existingSlugs, categories: new Set(categories.map((c) => c.slug)), products, relatedSlugs: new Set(related.map((r) => r.slug)), base }),
    signal,
    GeneratedPostJsonSchema,
  );
  return addBlogDraft({ ...post, environment });
}
