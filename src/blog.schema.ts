import { z } from "zod";

export const BLOG_STATUSES = ["draft", "approved", "published", "rejected", "failed"] as const;
export type BlogDraftStatus = (typeof BLOG_STATUSES)[number];

const FORBIDDEN_HTML = /<\s*(script|style|iframe|object|embed|form|img)\b|\son[a-z]+\s*=|javascript:/i;
const wordCount = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

export const GeneratedPostSchema = z.object({
  topic: z.string().min(5).max(200),
  title: z.string().min(10).max(120),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100),
  metaTitle: z.string().min(10).max(70),
  metaDescription: z.string().min(80).max(170),
  summary: z.string().min(40).max(300),
  categorySlug: z.string().min(1),
  secondCategorySlug: z.string().min(1).optional(),
  productIds: z.array(z.number().int()).min(1).max(4),
  heroProductId: z.number().int(),
  html: z.string().min(1500).refine((h) => !FORBIDDEN_HTML.test(h), "html contains forbidden tags or attributes")
    .refine((h) => wordCount(h) >= 500, "html must be at least 500 words")
    .refine((h) => /<h2[\s>]/i.test(h), "html needs at least one <h2>"),
});
export type GeneratedPost = z.infer<typeof GeneratedPostSchema>;

export const GeneratedPostJsonSchema = z.toJSONSchema(GeneratedPostSchema, { io: "input", unrepresentable: "any" });

export const BlogEditSchema = z.object({
  title: z.string().min(10).max(120),
  metaTitle: z.string().min(10).max(70),
  metaDescription: z.string().min(80).max(170),
  summary: z.string().min(40).max(300),
  categorySlug: z.string().min(1),
  html: GeneratedPostSchema.shape.html,
}).partial();

export interface BlogDraft extends GeneratedPost {
  id: string;
  status: BlogDraftStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishAfter?: string;
  publishedAt?: string;
  remoteId?: number;
  remoteStatus?: 0 | 1;
  url?: string;
  attempts: number;
  error?: string;
  environment: string;
}
