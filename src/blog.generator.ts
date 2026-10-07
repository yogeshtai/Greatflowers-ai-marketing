import { formatOccasionGuidance } from "./occasion.calendar.js";
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

export function buildBlogPrompt(args: {
  today: string;
  existingTitles: string[];
  existingSlugs: string[];
  categories: Array<{ slug: string; name: string }>;
  products: CatalogProduct[];
}): string {
  return `You are the SEO content writer for GreatFlowers (greatflowers.net), a US online florist with same-day flower delivery.
Write ONE new blog post for today (${args.today}).

${formatOccasionGuidance()}

TOPIC RULES
- Pick a topic that is timely for the occasion calendar above, or evergreen if nothing is in season.
- It must be clearly different from every existing post listed below (different search intent, not a rewording).
- Existing post titles (do NOT repeat or closely paraphrase):
${args.existingTitles.slice(0, 120).map((t) => `  - ${t}`).join("\n")}
- Existing slugs already taken: ${args.existingSlugs.slice(0, 200).join(", ")}

CATEGORIES (choose exactly one categorySlug from this list):
${args.categories.map((c) => `  - ${c.slug} (${c.name})`).join("\n")}

PRODUCT CATALOG (use ONLY these; never invent products, prices, or availability):
${args.products.map((p) => `  - id ${p.id}: ${p.name}${p.price ? ` ($${p.price})` : ""}`).join("\n")}

WRITING RULES
- 700 to 1100 words, warm and helpful, written for US gift buyers. Answer the reader's real question.
- html must be plain HTML only: <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em>, <a>. No <h1>, no inline styles, no scripts, no images.
- Include 4 to 6 <h2> sections and a final FAQ section with <h2>Frequently Asked Questions</h2> and 3 to 4 <h3> questions with <p> answers.
- Mention 2 to 4 catalog products naturally. After the paragraph that discusses a product, embed it with EXACTLY: <div class="blog-product-embed" data-product-id="PRODUCT_ID"></div> (PRODUCT_ID from the catalog). List each used id in productIds. Do not use any other product markup.
- heroProductId must be one of the productIds; its photo becomes the post image.
- Do not invent statistics, awards, delivery guarantees, discounts, promo codes, or competitor names. Do not write "SAVE15" or any code.
- Do not claim same-day delivery is guaranteed everywhere; say "same-day delivery is available in many areas".
- title: 50-70 characters, natural, includes the main keyword. metaTitle: 10-55 characters, WITHOUT the brand name (we append " | Great Flowers" ourselves). metaDescription: 120-160 characters. summary: 1-2 sentences.
- slug: lowercase-hyphenated, unique vs the taken slugs.
Return the JSON object only.`;
}

export function validatePost(
  output: string,
  ctx: { existingTitles: string[]; existingSlugs: string[]; categories: Set<string>; productIds: Set<number> },
): GeneratedPost {
  const post = GeneratedPostSchema.parse(parseModelJSON(output));
  const lower = post.title.toLowerCase();
  if (ctx.existingTitles.some((t) => t.toLowerCase() === lower)) throw new Error("title duplicates an existing post");
  if (ctx.existingSlugs.includes(post.slug)) throw new Error("slug is already taken");
  if (!ctx.categories.has(post.categorySlug)) throw new Error(`categorySlug must be one of: ${[...ctx.categories].join(", ")}`);
  const bad = post.productIds.filter((id) => !ctx.productIds.has(id));
  if (bad.length) throw new Error(`productIds not in catalog: ${bad.join(", ")}`);
  if (!post.productIds.includes(post.heroProductId)) throw new Error("heroProductId must be one of productIds");
  const html = sanitizeEmbeds(post.html, new Set(post.productIds));
  if (!new RegExp(EMBED_RE.source, "i").test(html)) throw new Error("html must embed at least one product with the exact blog-product-embed div");
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

  const prompt = buildBlogPrompt({ today: new Date().toISOString().slice(0, 10), existingTitles, existingSlugs, categories, products });
  const post = await requestHermesJSON(
    prompt,
    (output) => validatePost(output, { existingTitles, existingSlugs, categories: new Set(categories.map((c) => c.slug)), productIds: new Set(products.map((p) => p.id)) }),
    signal,
    GeneratedPostJsonSchema,
  );
  return addBlogDraft({ ...post, environment });
}
