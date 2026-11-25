import { z } from "zod";
import type { ProjectConfig } from "./projects/index.js";

export const BLOG_STATUSES = ["draft", "approved", "published", "rejected", "failed"] as const;
export type BlogDraftStatus = (typeof BLOG_STATUSES)[number];
export const BLOG_FORMATS = ["CURATED_LIST", "PRACTICAL_GUIDE", "OCCASION_PLAYBOOK", "QUESTION_EXPLAINER"] as const;
export type BlogFormat = (typeof BLOG_FORMATS)[number];

const FORBIDDEN_HTML = /<\s*(script|style|iframe|object|embed|form|img)\b|\son[a-z]+\s*=|javascript:/i;
const wordCount = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

export const GeneratedPostSchema = z.object({
  topic: z.string().min(5).max(200),
  title: z.string().min(10).max(60),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100),
  metaTitle: z.string().min(10).max(70),
  metaDescription: z.string().min(80).max(170),
  summary: z.string().min(40).max(300),
  categorySlug: z.string().min(1),
  secondCategorySlug: z.string().min(1).optional(),
  productIds: z.array(z.number().int()).min(1).max(4),
  heroProductId: z.number().int(),
  heroStrategy: z.enum(["HUMAN_GIFTING_MOMENT", "HUMAN_LIFESTYLE", "OCCASION_SCENE", "EDITORIAL_CONTENT"]),
  heroProductRole: z.enum(["hero", "supporting"]),
  heroConcept: z.string().min(80).max(600),
  contentFormat: z.enum(BLOG_FORMATS),
  html: z.string().min(1500).refine((h) => !FORBIDDEN_HTML.test(h), "html contains forbidden tags or attributes")
    .refine((h) => wordCount(h) >= 500, "html must be at least 500 words")
    .refine((h) => /<h2[\s>]/i.test(h), "html needs at least one <h2>"),
});
export type GeneratedPost = z.infer<typeof GeneratedPostSchema>;

export const GeneratedPostJsonSchema = z.toJSONSchema(GeneratedPostSchema, { io: "input", unrepresentable: "any" });

// The format a title implies: "5 Best..." is a curated list, "How to..." a guide, a question an explainer.
export function inferredFormat(title: string): BlogFormat {
  if (/^(best|top|\d+)\b/i.test(title)) return "CURATED_LIST";
  if (/^(how|a guide|the guide)|\bguide\b/i.test(title)) return "PRACTICAL_GUIDE";
  if (/^(what|which|when|why|can|should)\b|\?$/.test(title.toLowerCase())) return "QUESTION_EXPLAINER";
  return "OCCASION_PLAYBOOK";
}

const OccasionSchema = z.string().trim().min(2).max(50)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} &'’().\/-]*$/u, "occasion contains unsupported characters");

// A manual draft takes at most one steer: an occasion, a title from the brand's title list, or
// "title-list" to let the AI pick the most suitable ready title.
export const BlogGenerateRequestSchema = z.object({
  occasion: z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, OccasionSchema.optional()),
  titleId: z.string().uuid().optional(),
  source: z.literal("title-list").optional(),
}).refine((request) => [request.occasion, request.titleId, request.source].filter(Boolean).length <= 1, {
  message: "Choose an occasion, one title from the list, or an AI pick from the list, not more than one",
});

// Edits may only use one of the project's approved bylines.
export const blogEditSchema = (project: ProjectConfig) => z.object({
  authorName: z.enum(project.brand.authors as [string, ...string[]]),
  // Preserve compatibility with drafts created before new titles were capped at 60.
  title: z.string().min(10).max(120),
  metaTitle: z.string().min(10).max(70),
  metaDescription: z.string().min(80).max(170),
  summary: z.string().min(40).max(300),
  categorySlug: z.string().min(1),
  html: GeneratedPostSchema.shape.html,
}).partial();

export interface BlogDraft extends GeneratedPost {
  /** Optional only for queue entries created before blog bylines were added. */
  authorName?: string;
  id: string;
  status: BlogDraftStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishAfter?: string;
  publishedAt?: string;
  heroSource?: "ai" | "product";
  remoteId?: number;
  remoteStatus?: 0 | 1;
  url?: string;
  attempts: number;
  error?: string;
  environment: string;
  /** Set when the post was written for a title from the brand's title list. */
  sourceTitleId?: string;
  /** The title as it was added to the list (the writer shortens titles over 60 characters). */
  originalTitle?: string;
  /** Why this title was picked (the AI's reason, "Pinned", or "Chosen by you"). */
  selectionReason?: string;
}
