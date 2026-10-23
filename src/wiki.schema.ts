import { z } from "zod";

export const WIKI_STATUSES = ["draft", "approved", "published", "rejected", "failed"] as const;
export type WikiDraftStatus = (typeof WIKI_STATUSES)[number];

const wordCount = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
const plainText = (value: string) => !/[<>]/.test(value);
const allowedMarkup = (html: string) =>
  [...html.matchAll(/<[^>]+>/g)].every(([tag]) =>
    /^<\/?(?:p|h2|h3|ul|li|strong|em)>$/i.test(tag) || /^<a href="[^"]+">$/i.test(tag) || /^<\/a>$/i.test(tag),
  );

export const GeneratedWikiSchema = z.object({
  title: z.string().min(2).max(80).refine(plainText, "title must be plain text"),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100),
  botanicalName: z.string().min(2).max(120).refine(plainText, "botanicalName must be plain text"),
  authorName: z.string().min(2).max(120).refine(plainText, "authorName must be plain text"),
  description: z.string().min(80).max(300).refine(plainText, "description must be plain text"),
  metaTitle: z.string().min(10).max(55).refine(plainText, "metaTitle must be plain text"),
  metaDescription: z.string().min(120).max(170).refine(plainText, "metaDescription must be plain text"),
  productIds: z.array(z.number().int()).min(1).max(4).refine((ids) => new Set(ids).size === ids.length, "productIds must be unique"),
  heroProductId: z.number().int(),
  imageConcept: z.string().min(60).max(500),
  html: z.string().min(2500)
    .refine(allowedMarkup, "html contains unsupported tags or attributes")
    .refine((html) => wordCount(html) >= 700, "html must be at least 700 words")
    .refine((html) => (html.match(/<h2[\s>]/gi) ?? []).length >= 6, "html needs at least six h2 sections"),
});

export type GeneratedWiki = z.infer<typeof GeneratedWikiSchema>;
export const GeneratedWikiJsonSchema = z.toJSONSchema(GeneratedWikiSchema, { io: "input", unrepresentable: "any" });

export const WikiEditSchema = z.object({
  title: GeneratedWikiSchema.shape.title,
  botanicalName: GeneratedWikiSchema.shape.botanicalName,
  authorName: GeneratedWikiSchema.shape.authorName,
  description: GeneratedWikiSchema.shape.description,
  metaTitle: GeneratedWikiSchema.shape.metaTitle,
  metaDescription: GeneratedWikiSchema.shape.metaDescription,
  html: GeneratedWikiSchema.shape.html,
}).partial();

export interface WikiDraft extends GeneratedWiki {
  id: string;
  status: WikiDraftStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishAfter?: string;
  publishedAt?: string;
  imageSource?: "ai" | "product";
  remoteId?: number;
  remoteStatus?: 0 | 1;
  url?: string;
  attempts: number;
  error?: string;
  environment: string;
}
