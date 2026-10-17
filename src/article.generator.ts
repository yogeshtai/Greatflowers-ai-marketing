import { ARTICLE_FORMATS, GeneratedArticleJsonSchema, GeneratedArticleSchema, type ArticleFormat, type GeneratedArticle } from "./article.schema.js";
import { addArticleDraft, getArticleDrafts, updateArticleDraft } from "./article.store.js";
import { generateArticleImage, type ArticleImageInput } from "./article.image.js";
import { toCatalogProduct, type CatalogProduct } from "./blog.generator.js";
import { selectContentAuthor } from "./content.authors.js";
import { gfApiHost, withGfClient } from "./gf.admin.client.js";
import { requestHermesJSON } from "./hermes.json.js";
import { parseModelJSONCandidates } from "./model.json.js";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const storefrontBase = () => (process.env.GF_STOREFRONT_URL || "https://greatflowers.net").replace(/\/+$/, "");

const TOPIC_DIRECTIONS: Record<string, string[]> = {
  "flower care": ["vase-life routines", "seasonal care mistakes", "water and placement decisions", "care by flower type", "reviving and refreshing arrangements"],
  "gift guides": ["recipient-led selection", "relationship etiquette", "budget and size decisions", "message-card guidance", "last-minute gifting plans"],
  occasions: ["milestone planning", "host and guest etiquette", "workplace celebrations", "family gatherings", "thoughtful low-key moments"],
  "flower meanings": ["color symbolism", "traditional associations", "modern interpretations", "meaningful combinations", "choosing by message"],
  seasonal: ["in-season style", "weather-aware delivery", "seasonal color palettes", "holiday hosting", "month-by-month flower choices"],
  "floral design": ["shape and proportion", "vase and placement", "texture and movement", "room-by-room styling", "mixing flower forms"],
  "wedding flowers": ["ceremony planning", "reception styling", "bouquet decisions", "wedding-party flowers", "timeline and delivery planning"],
  "sympathy & support": ["respectful etiquette", "service versus home delivery", "message guidance", "relationship-appropriate choices", "support after the service"],
  "workplace & events": ["office etiquette", "client and employee gifts", "event tables", "professional milestones", "brand-appropriate color choices"],
  "color & style": ["palette building", "color by mood", "classic versus modern style", "interior coordination", "monochrome and mixed palettes"],
  "flower buying guides": ["size and scale", "freshness and timing", "product comparison", "recipient preferences", "ordering and delivery decisions"],
  "delivery & planning": ["same-day planning", "address and timing checks", "surprise delivery logistics", "event delivery", "recipient availability"],
};

export function selectArticleFormat(recent: Array<{ format?: ArticleFormat }>): ArticleFormat {
  const used = new Set(recent.slice(0, ARTICLE_FORMATS.length - 1).map((article) => article.format).filter(Boolean));
  return ARTICLE_FORMATS.find((format) => !used.has(format)) ?? ARTICLE_FORMATS[0];
}

export function selectArticleTopic(topics: string[], recentTopics: string[]): string {
  if (!topics.length) throw new Error("No Article Topics are configured in Great Flowers Admin");
  const counts = new Map(topics.map((topic) => [topic, 0]));
  recentTopics.forEach((topic, index) => {
    const configured = topics.find((candidate) => normalize(candidate) === normalize(topic));
    if (configured) counts.set(configured, (counts.get(configured) ?? 0) + Math.max(1, 20 - index));
  });
  return [...topics].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b))[0]!;
}

function selectDirection(topic: string, existingCount: number): string {
  const directions = TOPIC_DIRECTIONS[normalize(topic)] ?? [
    "practical beginner guidance", "common mistakes", "decision-making advice", "planning and etiquette", "creative real-life use",
  ];
  return directions[existingCount % directions.length]!;
}

export function resolveArticleLinks(html: string, products: CatalogProduct[], articleSlugs: Set<string>, base: string): string {
  if ((html.match(/href\s*=/gi) ?? []).length !== (html.match(/href="[^"]*"/gi) ?? []).length) {
    throw new Error('every link must use the exact form href="..." with double quotes');
  }
  const productSlugs = new Map(products.map((product) => [product.id, product.slug]));
  return html.replace(/href="([^"]*)"/gi, (_match, href: string) => {
    if (href === "HOME") return `href="${base}/"`;
    const product = /^PRODUCT:(\d+)$/.exec(href);
    if (product) {
      const slug = productSlugs.get(Number(product[1]));
      if (!slug) throw new Error(`link to unknown product ${product[1]}`);
      return `href="${base}/product/${slug}/"`;
    }
    const article = /^ARTICLE:([a-z0-9-]+)$/.exec(href);
    if (article) {
      if (!articleSlugs.has(article[1]!)) throw new Error(`link to unknown article slug ${article[1]}`);
      return `href="${base}/greatflowers-articles/${article[1]}/"`;
    }
    throw new Error(`link target "${href.slice(0, 60)}" is not allowed; use PRODUCT:<id>, ARTICLE:<slug> or HOME`);
  });
}

export function buildArticlePrompt(args: {
  topic: string;
  direction: string;
  format: ArticleFormat;
  authorName: string;
  existingTitles: string[];
  products: CatalogProduct[];
  related: Array<{ slug: string; title: string }>;
}): string {
  return `You are writing one authoritative, evergreen Great Flowers article for US flower buyers.

ASSIGNMENT
- Admin topic (use exactly): ${args.topic}
- Required editorial format (use exactly): ${args.format}
- Fresh angle: ${args.direction}
- Author (use exactly): ${args.authorName}

The format controls the structure:
- DEEP_GUIDE: a comprehensive reference organized from fundamentals to confident decisions.
- HOW_TO: a practical step-by-step process with clear actions.
- DECISION_GUIDE: compare choices and explain which fits each reader or situation.
- MYTHS_AND_FACTS: correct common misconceptions without sounding combative.
- STYLE_PLAYBOOK: visual, placement and composition guidance for real settings.
- PLANNING_CHECKLIST: a chronological plan with useful checks and contingencies.
- QUESTION_EXPLAINER: answer one natural customer question directly, then explore it in depth.
- SEASONAL_FIELD_GUIDE: timely seasonal choices, planning, care and styling without claiming false availability.

Already published or queued titles (do not duplicate or lightly rewrite):
${args.existingTitles.slice(0, 120).map((title) => `- ${title}`).join("\n") || "- none"}

VERIFIED PRODUCTS (the only products you may name or link):
${args.products.map((product) => `- id ${product.id}: ${product.name}${product.description ? ` | ${product.description}` : " | no verified description"}`).join("\n")}

PUBLISHED ARTICLES AVAILABLE FOR INTERNAL LINKS:
${args.related.map((article) => `- ${article.title} | ARTICLE:${article.slug}`).join("\n") || "- none"}

Write 1,050-1,450 words. This is an in-depth resource, not a short blog post and not a flower encyclopedia entry. Use a specific search intent and a distinct title. Give a direct answer early, then 7-10 descriptive <h2> sections, useful <h3> subsections when appropriate, and a concise conclusion. Include a checklist or bullets only when it genuinely improves the explanation. Avoid repeatedly using listicle titles such as "Best 5".

PRODUCT AND LINK RULES
- Select 2-5 genuinely relevant products. Every productId must be from the verified list, and heroProductId must be one of productIds.
- Mention and link each selected product naturally exactly once with <a href="PRODUCT:<id>">Product Name</a>.
- Describe flowers, color, vase or style only when the supplied catalog description confirms it. Never infer product details from its name.
- If published articles are supplied, add 1-3 genuinely relevant links using <a href="ARTICLE:<slug>">natural anchor text</a>.
- End with one modest sentence linking <a href="HOME">Great Flowers</a>.
- Never output a real URL. Never invent products, links, prices, discounts, statistics, research or delivery guarantees.

QUALITY AND SAFETY
- Use warm, practical US English, short paragraphs, concrete advice and varied sentence openings.
- Explain symbolism as a traditional association that can vary by culture and context.
- Do not provide medical, edible-use, allergy, pet-safety or toxicity claims.
- Say same-day delivery is available in many areas, never guaranteed everywhere.
- HTML may contain only <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em> and <a>. No <h1>, images, embeds, styles or scripts.

IMAGE
- imageConcept describes a premium 16:9 editorial photograph tied to the article's exact angle, with a clear human action or art-directed flower scene, foreground/middle/background depth, setting, light and mood.
- Avoid plain catalog shots, empty white backgrounds and centered bouquet-only compositions. No text, signs, cards, logos or watermarks.

SEO
- title: 35-75 characters, natural and intent-specific.
- slug: lowercase and hyphenated.
- topic, format and authorName must exactly match the assignment.
- description: a useful 1-2 sentence summary.
- metaTitle: 35-55 characters without "Great Flowers".
- metaDescription: 140-165 characters.
- Return the complete JSON object only.

OUTPUT CONTRACT
Return this object itself at the top level—never a validation report, summary, wrapper, file or status object:
{"title":"...","slug":"...","topic":"${args.topic}","format":"${args.format}","authorName":"${args.authorName}","description":"...","metaTitle":"...","metaDescription":"...","productIds":[1,2],"heroProductId":1,"imageConcept":"...","html":"<p>...</p>"}`;
}

const ARTICLE_KEYS = ["title", "slug", "topic", "format", "authorName", "description", "metaTitle", "metaDescription", "productIds", "heroProductId", "imageConcept", "html"] as const;

export function validateArticle(output: string, context: {
  topic: string;
  format: ArticleFormat;
  authorName: string;
  existingTitles: string[];
  existingSlugs: string[];
  products: CatalogProduct[];
  relatedSlugs: Set<string>;
  base: string;
}): GeneratedArticle {
  const roots = parseModelJSONCandidates(output);
  const candidates: unknown[] = [];
  const queue: Array<{ value: unknown; depth: number }> = roots.map((value) => ({ value, depth: 0 }));
  const seen = new Set<unknown>();
  while (queue.length && candidates.length < 100) {
    const current = queue.shift()!;
    if (!current.value || typeof current.value !== "object" || seen.has(current.value)) continue;
    seen.add(current.value);
    candidates.push(current.value);
    if (current.depth < 3) {
      const children = Array.isArray(current.value) ? current.value : Object.values(current.value as Record<string, unknown>);
      children.forEach((value) => queue.push({ value, depth: current.depth + 1 }));
    }
  }
  let article: GeneratedArticle | undefined;
  let bestFailure: { matches: number; keys: string[]; issues: string[] } | undefined;
  for (const candidate of candidates) {
    const result = GeneratedArticleSchema.safeParse(candidate);
    if (result.success) { article = result.data; break; }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const keys = Object.keys(candidate as Record<string, unknown>);
      const matches = ARTICLE_KEYS.filter((key) => keys.includes(key)).length;
      if (!bestFailure || matches > bestFailure.matches) {
        bestFailure = {
          matches,
          keys,
          issues: result.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
        };
      }
    }
  }
  if (!article) {
    if (!bestFailure?.matches) {
      throw new Error(`No complete Article JSON object was returned. The top-level object must contain: ${ARTICLE_KEYS.join(", ")}. Received keys: ${bestFailure?.keys.join(", ") || "none"}. Do not return a report or validation errors.`);
    }
    throw new Error(`Article JSON is incomplete or invalid (${bestFailure.matches}/${ARTICLE_KEYS.length} required fields found). Fix: ${bestFailure.issues.join("; ")}`);
  }
  if (article.topic !== context.topic) throw new Error(`topic must be exactly ${context.topic}`);
  if (article.format !== context.format) throw new Error(`format must be exactly ${context.format}`);
  if (article.authorName !== context.authorName) throw new Error(`authorName must be exactly ${context.authorName}`);
  if (/great\s*flowers/i.test(article.metaTitle)) throw new Error("metaTitle must not contain the Great Flowers brand name");
  if (context.existingTitles.some((title) => normalize(title) === normalize(article!.title))) throw new Error("title duplicates an existing article");
  if (context.existingSlugs.includes(article.slug)) throw new Error("slug duplicates an existing article");
  const allowed = new Set(context.products.map((product) => product.id));
  if (article.productIds.some((id) => !allowed.has(id))) throw new Error("productIds contains an unknown catalog product");
  if (!article.productIds.includes(article.heroProductId)) throw new Error("heroProductId must be one of productIds");
  for (const id of article.productIds) {
    if (!new RegExp(`href="PRODUCT:${id}"`).test(article.html)) throw new Error(`selected product ${id} must be linked in html`);
  }
  if (!/href="HOME"/.test(article.html)) throw new Error("html must link HOME");
  return { ...article, html: resolveArticleLinks(article.html, context.products, context.relatedSlugs, context.base) };
}

export async function generateDailyArticleDraft(signal?: AbortSignal, onDraftSaved?: () => void) {
  const environment = gfApiHost();
  const context = await withGfClient(async (client) => {
    const [articles, topics, rawProducts] = await Promise.all([client.listArticles(), client.listArticleTopics(), client.searchProducts("", 100)]);
    return { articles, topics, products: rawProducts.map(toCatalogProduct).filter((product) => product.imageUrl) };
  });
  if (context.products.length < 2) throw new Error("Not enough catalog products with images to write an article");
  const local = (await getArticleDrafts()).filter((draft) => draft.environment === environment && draft.status !== "rejected");
  const existingTitles = [...context.articles.map((article: any) => String(article.title)), ...local.map((draft) => draft.title)];
  const existingSlugs = [...context.articles.map((article: any) => String(article.slug)), ...local.map((draft) => draft.slug)];
  const recentTopics = [...local.map((draft) => draft.topic), ...context.articles.map((article: any) => String(article.topic ?? ""))];
  const topic = selectArticleTopic(context.topics.map((item: any) => String(item.name ?? item.id ?? item)), recentTopics);
  const format = selectArticleFormat(local);
  const authorName = selectContentAuthor(local.map((draft) => draft.authorName));
  const direction = selectDirection(topic, recentTopics.filter((item) => normalize(item) === normalize(topic)).length);
  const related = context.articles.filter((article: any) => Number(article.status) === 1).slice(0, 80).map((article: any) => ({ slug: String(article.slug), title: String(article.title) }));
  const promptProducts = context.products.slice(0, 45);
  const article = await requestHermesJSON(
    buildArticlePrompt({ topic, direction, format, authorName, existingTitles, products: promptProducts, related }),
    (output) => validateArticle(output, { topic, format, authorName, existingTitles, existingSlugs, products: promptProducts, relatedSlugs: new Set(related.map((item) => item.slug)), base: storefrontBase() }),
    signal,
    GeneratedArticleJsonSchema,
    { freshRetries: 1 },
  );
  const draft = await addArticleDraft({ ...article, authorName, environment });
  onDraftSaved?.();
  return attachArticleImage(draft.id, article, promptProducts.find((product) => product.id === article.heroProductId)?.imageUrl, signal);
}

export async function attachArticleImage(id: string, article: ArticleImageInput, productImageUrl: string | null | undefined, signal?: AbortSignal) {
  const ai = productImageUrl ? await generateArticleImage(id, article, productImageUrl, signal) : false;
  return (await updateArticleDraft(id, (draft) => ({ ...draft, imageSource: ai ? "ai" : draft.imageSource ?? "product" })))!;
}
