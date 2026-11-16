import { z } from "zod";
import type { ProjectConfig } from "./projects/index.js";

export const ARTICLE_STATUSES = ["draft", "approved", "published", "rejected", "failed"] as const;
export type ArticleDraftStatus = (typeof ARTICLE_STATUSES)[number];

export const ARTICLE_FORMATS = [
  "DEEP_GUIDE",
  "HOW_TO",
  "DECISION_GUIDE",
  "MYTHS_AND_FACTS",
  "STYLE_PLAYBOOK",
  "PLANNING_CHECKLIST",
  "QUESTION_EXPLAINER",
  "SEASONAL_FIELD_GUIDE",
] as const;
export type ArticleFormat = (typeof ARTICLE_FORMATS)[number];

const wordCount = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
const plainText = (value: string) => !/[<>]/.test(value);
const allowedMarkup = (html: string) =>
  [...html.matchAll(/<[^>]+>/g)].every(([tag]) =>
    /^<\/?(?:p|h2|h3|ul|ol|li|strong|em)>$/i.test(tag) || /^<a href="[^"]+">$/i.test(tag) || /^<\/a>$/i.test(tag),
  );

// The author must be one of the project's approved bylines; the enum is part of the JSON contract
// sent to Hermes, so each project gets its own schema.
const authorEnum = (project: ProjectConfig) => z.enum(project.brand.authors as [string, ...string[]]);

const generatedArticleSchemas = new Map<string, ReturnType<typeof buildGeneratedArticleSchema>>();
export function generatedArticleSchema(project: ProjectConfig) {
  let schema = generatedArticleSchemas.get(project.id);
  if (!schema) generatedArticleSchemas.set(project.id, schema = buildGeneratedArticleSchema(project));
  return schema;
}

const buildGeneratedArticleSchema = (project: ProjectConfig) => z.object({
  title: z.string().min(25).max(60).refine(plainText, "title must be plain text"),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(110),
  topic: z.string().min(2).max(100).refine(plainText, "topic must be plain text"),
  format: z.enum(ARTICLE_FORMATS),
  authorName: authorEnum(project),
  description: z.string().min(90).max(320).refine(plainText, "description must be plain text"),
  metaTitle: z.string().min(20).max(55).refine(plainText, "metaTitle must be plain text"),
  metaDescription: z.string().min(120).max(170).refine(plainText, "metaDescription must be plain text"),
  productIds: z.array(z.number().int()).min(2).max(5).refine((ids) => new Set(ids).size === ids.length, "productIds must be unique"),
  heroProductId: z.number().int(),
  imageConcept: z.string().min(60).max(500),
  html: z.string().min(3500)
    .refine(allowedMarkup, "html contains unsupported tags or attributes")
    .refine((html) => wordCount(html) >= 900, "html must be at least 900 words")
    .refine((html) => (html.match(/<h2[\s>]/gi) ?? []).length >= 7, "html needs at least seven h2 sections"),
});

export type GeneratedArticle = z.infer<ReturnType<typeof generatedArticleSchema>>;
export const generatedArticleJsonSchema = (project: ProjectConfig) =>
  z.toJSONSchema(generatedArticleSchema(project), { io: "input", unrepresentable: "any" });

export const articleEditSchema = (project: ProjectConfig) => {
  const generated = generatedArticleSchema(project);
  return z.object({
    // Preserve compatibility with drafts created before new titles were capped at 60.
    title: z.string().min(25).max(80).refine(plainText, "title must be plain text"),
    topic: generated.shape.topic,
    authorName: generated.shape.authorName,
    description: generated.shape.description,
    metaTitle: generated.shape.metaTitle,
    metaDescription: generated.shape.metaDescription,
    html: generated.shape.html,
  }).partial();
};

export interface ArticleDraft extends GeneratedArticle {
  id: string;
  status: ArticleDraftStatus;
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
