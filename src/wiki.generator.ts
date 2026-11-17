import { gfApiHost, withGfClient } from "./gf.admin.client.js";
import { isWikiAuthor, selectWikiAuthor } from "./wiki.authors.js";
import { contentSkillPrefix, productPageUrl, promptAddendum, storefrontBase, type ProjectConfig } from "./projects/index.js";
import { requestHermesJSON } from "./hermes.json.js";
import { parseModelJSONCandidates } from "./model.json.js";
import { toCatalogProduct, type CatalogProduct } from "./blog.generator.js";
import { GeneratedWikiJsonSchema, GeneratedWikiSchema, type GeneratedWiki } from "./wiki.schema.js";
import { addWikiDraft, getWikiDrafts, updateWikiDraft } from "./wiki.store.js";
import { generateWikiImage, type WikiImageInput } from "./wiki.image.js";

export interface WikiSubject {
  title: string;
  botanicalName: string;
  aliases: string[];
  excludeAliases?: string[];
}

export const WIKI_SUBJECTS: WikiSubject[] = [
  { title: "Roses", botanicalName: "Rosa", aliases: ["rose", "roses"] },
  { title: "Lilies", botanicalName: "Lilium", aliases: ["lily", "lilies"], excludeAliases: ["calla", "alstroemeria", "peruvian"] },
  { title: "Tulips", botanicalName: "Tulipa", aliases: ["tulip", "tulips"] },
  { title: "Sunflowers", botanicalName: "Helianthus annuus", aliases: ["sunflower", "sunflowers"] },
  { title: "Orchids", botanicalName: "Orchidaceae", aliases: ["orchid", "orchids"] },
  { title: "Carnations", botanicalName: "Dianthus caryophyllus", aliases: ["carnation", "carnations"] },
  { title: "Hydrangeas", botanicalName: "Hydrangea", aliases: ["hydrangea", "hydrangeas"] },
  { title: "Chrysanthemums", botanicalName: "Chrysanthemum", aliases: ["chrysanthemum", "chrysanthemums", "mum", "mums"] },
  { title: "Peonies", botanicalName: "Paeonia", aliases: ["peony", "peonies"] },
  { title: "Gerbera Daisies", botanicalName: "Gerbera jamesonii", aliases: ["gerbera", "gerberas"] },
  { title: "Irises", botanicalName: "Iris", aliases: ["iris", "irises"] },
  { title: "Daffodils", botanicalName: "Narcissus", aliases: ["daffodil", "daffodils", "narcissus"] },
  { title: "Alstroemeria", botanicalName: "Alstroemeria", aliases: ["alstroemeria", "peruvian lily"] },
  { title: "Snapdragons", botanicalName: "Antirrhinum majus", aliases: ["snapdragon", "snapdragons"] },
  { title: "Lisianthus", botanicalName: "Eustoma grandiflorum", aliases: ["lisianthus", "eustoma"] },
  { title: "Delphiniums", botanicalName: "Delphinium", aliases: ["delphinium", "delphiniums"] },
  { title: "Ranunculus", botanicalName: "Ranunculus asiaticus", aliases: ["ranunculus"] },
  { title: "Anemones", botanicalName: "Anemone coronaria", aliases: ["anemone", "anemones"] },
  { title: "Calla Lilies", botanicalName: "Zantedeschia aethiopica", aliases: ["calla", "calla lily", "calla lilies"] },
  { title: "Freesias", botanicalName: "Freesia", aliases: ["freesia", "freesias"] },
  { title: "Gladiolus", botanicalName: "Gladiolus", aliases: ["gladiola", "gladiolus", "gladioli"] },
  { title: "Baby's Breath", botanicalName: "Gypsophila paniculata", aliases: ["baby's breath", "babys breath", "gypsophila"] },
  { title: "Gardenias", botanicalName: "Gardenia jasminoides", aliases: ["gardenia", "gardenias"] },
  { title: "Dahlias", botanicalName: "Dahlia", aliases: ["dahlia", "dahlias"] },
  { title: "Monte Casino Asters", botanicalName: "Symphyotrichum ericoides", aliases: ["monte casino"] },
  { title: "Matsumoto Asters", botanicalName: "Callistephus chinensis", aliases: ["matsumoto"] },
  { title: "Sweet Peas", botanicalName: "Lathyrus odoratus", aliases: ["sweet pea", "sweet peas"] },
  { title: "Stock Flowers", botanicalName: "Matthiola incana", aliases: ["stock", "stock flower", "stock flowers", "matthiola"] },
  { title: "Statice", botanicalName: "Limonium sinuatum", aliases: ["statice", "limonium"] },
  { title: "Waxflowers", botanicalName: "Chamelaucium uncinatum", aliases: ["waxflower", "waxflowers", "wax flower", "wax flowers"] },
  { title: "Yarrow", botanicalName: "Achillea millefolium", aliases: ["yarrow"] },
  { title: "Hypericum Berries", botanicalName: "Hypericum", aliases: ["hypericum", "hypericum berries"] },
  { title: "Proteas", botanicalName: "Protea", aliases: ["protea", "proteas"] },
  { title: "Anthuriums", botanicalName: "Anthurium andraeanum", aliases: ["anthurium", "anthuriums"] },
  { title: "Birds of Paradise", botanicalName: "Strelitzia reginae", aliases: ["bird of paradise", "birds of paradise", "strelitzia"] },
  { title: "Eucalyptus", botanicalName: "Eucalyptus", aliases: ["eucalyptus"] },
  { title: "Magnolias", botanicalName: "Magnolia", aliases: ["magnolia", "magnolias"] },
  { title: "Camellias", botanicalName: "Camellia japonica", aliases: ["camellia", "camellias"] },
  { title: "Lilacs", botanicalName: "Syringa vulgaris", aliases: ["lilac", "lilacs"] },
  { title: "Zinnias", botanicalName: "Zinnia elegans", aliases: ["zinnia", "zinnias"] },
  { title: "Marigolds", botanicalName: "Tagetes", aliases: ["marigold", "marigolds"] },
  { title: "Hibiscus", botanicalName: "Hibiscus rosa-sinensis", aliases: ["hibiscus"] },
  { title: "Jasmine", botanicalName: "Jasminum", aliases: ["jasmine", "jasminum"] },
];

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slugForWikiTitle = (value: string) => value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const mentions = (product: CatalogProduct, aliases: string[], excludeAliases: string[] = []) => {
  const haystack = normalized(`${product.name} ${product.description}`);
  const contains = (alias: string) => ` ${haystack} `.includes(` ${normalized(alias)} `);
  return aliases.some(contains) && !excludeAliases.some(contains);
};

export function selectWikiSubject(existingTitles: string[], products: CatalogProduct[]): WikiSubject {
  const existing = existingTitles.map(normalized).filter(Boolean);
  const available = WIKI_SUBJECTS.filter((subject) => {
    const identifiers = [subject.title, subject.botanicalName, ...subject.aliases].map(normalized);
    return !existing.some((value) => identifiers.some((identifier) => ` ${value} `.includes(` ${identifier} `)));
  });
  if (!available.length) throw new Error("All configured wiki subjects already exist; add more subjects before generating another entry");
  const ranked = available
    .map((subject, order) => ({ subject, order, matches: products.filter((product) => mentions(product, subject.aliases, subject.excludeAliases)).length }))
    .sort((a, b) => b.matches - a.matches || a.order - b.order);
  if (!ranked[0]?.matches) throw new Error("No unused wiki subject is supported by a verified catalog product; add subjects or improve product descriptions before generating another entry");
  return ranked[0].subject;
}

export function resolveWikiLinks(project: ProjectConfig, html: string, products: CatalogProduct[], base: string): string {
  if ((html.match(/href\s*=/gi) ?? []).length !== (html.match(/href="[^"]*"/gi) ?? []).length) {
    throw new Error('every link must use the exact form href="..." with double quotes');
  }
  const slugs = new Map(products.map((product) => [product.id, product.slug]));
  return html.replace(/href="([^"]*)"/gi, (_match, href: string) => {
    if (href === "HOME") return `href="${base}/"`;
    const product = /^PRODUCT:(\d+)$/.exec(href);
    if (!product) throw new Error(`link target "${href.slice(0, 60)}" is not allowed; use PRODUCT:<id> or HOME`);
    const slug = slugs.get(Number(product[1]));
    if (!slug) throw new Error(`link to unknown product ${product[1]}`);
    return `href="${productPageUrl(project, base, slug)}"`;
  });
}

export function buildWikiPrompt(project: ProjectConfig, subject: WikiSubject, products: CatalogProduct[], existingTitles: string[], authorName: string = project.brand.defaultAuthor): string {
  const brand = project.brand.displayName;
  return `You are writing one factual evergreen entry for the ${brand} A-Z Flower & Plant Wiki.

ASSIGNED SUBJECT (do not change it)
- Common title: ${subject.title}
- Botanical name: ${subject.botanicalName}
- Slug: ${slugForWikiTitle(subject.title)}

Already published or queued titles (never duplicate): ${existingTitles.join(", ") || "none"}

VERIFIED ${brand.toUpperCase()} PRODUCTS (the only products you may name or link):
${products.map((product) => `- id ${product.id}: ${product.name}${product.description ? ` | ${product.description}` : " | no verified description"}`).join("\n")}

Write 900-1,250 words for readers who want to understand, choose, care for or give ${subject.title}. The entry must be useful without making a purchase.

CONTENT STRUCTURE
- A concise introductory description, then HTML with 7-10 descriptive <h2> sections.
- Cover: overview and identification; common varieties or forms; colors and traditionally associated meanings; season and availability; cut-flower care; arrangement/design uses; gifting occasions; and 3 concise FAQs.
- Explain that meanings vary by culture and context. Phrase symbolism as traditional association, not universal fact.
- Do not give medical, edible-use or pet-safety advice. Do not claim a plant is safe or toxic.
- Do not invent dates, statistics, scientific studies, historical origins or precise growing-zone claims. If a fact is uncertain, omit it.
- Keep botanical claims conservative. Do not confuse the assigned genus/species with unrelated plants sharing a common name.
- Use short paragraphs and plain US English. No hype, urgency, exclamation marks or keyword stuffing.

PRODUCT RULES
- Choose 1-4 genuinely relevant products from the supplied catalog. Every productId must come from the list. Up to the first two will also appear as product cards inside the wiki.
- Mention each selected product naturally once and link it exactly as <a href="PRODUCT:<id>">Product Name</a>.
- Do not describe colors, flowers, vase or style unless the supplied catalog description explicitly confirms them.
- End with one modest sentence linking <a href="HOME">${brand}</a>.

HTML may contain only <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> and <a>. No <h1>, images, product-card markup, styles or scripts.

IMAGE
- heroProductId must be one of productIds and should be the closest visual reference.
- imageConcept describes a specific 4:3 botanical editorial photograph: recognizable flower structure, composition, surface/background and lighting. No people and no text.

SEO
- title must be exactly "${subject.title}".
- botanicalName must be exactly "${subject.botanicalName}".
- authorName must be exactly "${authorName}".
- metaTitle is 35-55 characters without "${brand}".
- metaDescription is 120-165 characters.
- Return JSON only.${promptAddendum(project)}

OUTPUT CONTRACT
Return this object itself at the top level—never a validation report, summary, wrapper, file or status object:
{"title":"${subject.title}","slug":"${slugForWikiTitle(subject.title)}","botanicalName":"${subject.botanicalName}","authorName":"${authorName}","description":"...","metaTitle":"...","metaDescription":"...","productIds":[${products[0]?.id ?? 1}],"heroProductId":${products[0]?.id ?? 1},"imageConcept":"...","html":"<p>...</p>"}`;
}

const WIKI_KEYS = ["title", "slug", "botanicalName", "authorName", "description", "metaTitle", "metaDescription", "productIds", "heroProductId", "imageConcept", "html"] as const;

export function validateWiki(output: string, context: { project: ProjectConfig; subject: WikiSubject; existingTitles: string[]; existingSlugs: string[]; products: CatalogProduct[]; base: string }): GeneratedWiki {
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
  let wiki: GeneratedWiki | undefined;
  let bestFailure: { matches: number; keys: string[]; issues: string[] } | undefined;
  for (const candidate of candidates) {
    const result = GeneratedWikiSchema.safeParse(candidate);
    if (result.success) { wiki = result.data; break; }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const keys = Object.keys(candidate as Record<string, unknown>);
      const matches = WIKI_KEYS.filter((key) => keys.includes(key)).length;
      if (!bestFailure || matches > bestFailure.matches) {
        bestFailure = {
          matches,
          keys,
          issues: result.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
        };
      }
    }
  }
  if (!wiki) {
    if (!bestFailure?.matches) {
      throw new Error(`No complete Wiki JSON object was returned. The top-level object must contain: ${WIKI_KEYS.join(", ")}. Received keys: ${bestFailure?.keys.join(", ") || "none"}. Do not return a report or validation errors.`);
    }
    throw new Error(`Wiki JSON is incomplete or invalid (${bestFailure.matches}/${WIKI_KEYS.length} required fields found). Fix: ${bestFailure.issues.join("; ")}`);
  }
  const expectedSlug = slugForWikiTitle(context.subject.title);
  if (wiki.title !== context.subject.title) throw new Error(`title must be exactly ${context.subject.title}`);
  if (wiki.botanicalName !== context.subject.botanicalName) throw new Error(`botanicalName must be exactly ${context.subject.botanicalName}`);
  if (wiki.slug !== expectedSlug) throw new Error(`slug must be exactly ${expectedSlug}`);
  const brand = context.project.brand;
  if (!isWikiAuthor(context.project, wiki.authorName)) throw new Error(`authorName must be an approved ${brand.displayName} wiki author`);
  if (brand.namePattern.test(wiki.metaTitle)) throw new Error(`metaTitle must not contain the ${brand.displayName} brand name`);
  if (context.existingTitles.some((title) => normalized(title) === normalized(wiki.title))) throw new Error("title duplicates an existing wiki entry");
  if (context.existingSlugs.includes(wiki.slug)) throw new Error("slug duplicates an existing wiki entry");
  const allowed = new Set(context.products.map((product) => product.id));
  if (wiki.productIds.some((id) => !allowed.has(id))) throw new Error("productIds contains an unknown catalog product");
  if (!wiki.productIds.includes(wiki.heroProductId)) throw new Error("heroProductId must be one of productIds");
  const selected = new Set(wiki.productIds);
  const linked = [...wiki.html.matchAll(/href="PRODUCT:(\d+)"/g)].map((match) => Number(match[1]));
  if (linked.some((id) => !selected.has(id))) throw new Error("html links a product that is not listed in productIds");
  for (const id of wiki.productIds) {
    if (!new RegExp(`href="PRODUCT:${id}"`).test(wiki.html)) throw new Error(`selected product ${id} must be linked in html`);
  }
  if (!/href="HOME"/.test(wiki.html)) throw new Error("html must link HOME");
  return { ...wiki, html: resolveWikiLinks(context.project, wiki.html, context.products, context.base) };
}

export async function generateDailyWikiDraft(project: ProjectConfig, signal?: AbortSignal, onDraftSaved?: () => void) {
  const environment = gfApiHost(project);
  const context = await withGfClient(project, async (client) => {
    const [wikis, rawProducts] = await Promise.all([client.listWikis(), client.searchProducts("", 100)]);
    return { wikis, products: rawProducts.map(toCatalogProduct).filter((product) => product.imageUrl) };
  });
  if (!context.products.length) throw new Error("No catalog products with images are available for the wiki entry");

  const localDrafts = (await getWikiDrafts(project)).filter((draft) => draft.environment === environment && draft.status !== "rejected");
  const authorName = selectWikiAuthor(project, localDrafts.map((draft) => draft.authorName));
  const existingTitles = [...context.wikis.map((wiki: any) => String(wiki.title)), ...localDrafts.map((draft) => draft.title)];
  const existingSlugs = [...context.wikis.map((wiki: any) => String(wiki.slug)), ...localDrafts.map((draft) => draft.slug)];
  const existingBotanicalNames = [...context.wikis.map((wiki: any) => String(wiki.botanical_name ?? "")), ...localDrafts.map((draft) => draft.botanicalName)];
  const subject = selectWikiSubject([...existingTitles, ...existingSlugs, ...existingBotanicalNames], context.products);
  const matching = context.products.filter((product) => mentions(product, subject.aliases, subject.excludeAliases));
  // Only expose products whose verified name/description mentions the assigned flower.
  // This prevents the model from forcing an unrelated bouquet into an encyclopedia entry.
  const promptProducts = matching.slice(0, 50);
  const base = storefrontBase(project);
  const wiki = await requestHermesJSON(
    `${contentSkillPrefix(project)}${buildWikiPrompt(project, subject, promptProducts, existingTitles, authorName)}`,
    (output) => validateWiki(output, { project, subject, existingTitles, existingSlugs, products: promptProducts, base }),
    signal,
    GeneratedWikiJsonSchema,
    { freshRetries: 1 },
  );
  const draft = await addWikiDraft(project, { ...wiki, authorName, environment });
  onDraftSaved?.();
  return attachWikiImage(project, draft.id, wiki, promptProducts.find((product) => product.id === wiki.heroProductId)?.imageUrl, signal);
}

export async function attachWikiImage(project: ProjectConfig, id: string, wiki: WikiImageInput, productImageUrl: string | null | undefined, signal?: AbortSignal) {
  const ai = productImageUrl ? await generateWikiImage(project, id, wiki, productImageUrl, signal) : false;
  return (await updateWikiDraft(project, id, (draft) => ({ ...draft, imageSource: ai ? "ai" : draft.imageSource ?? "product" })))!;
}
