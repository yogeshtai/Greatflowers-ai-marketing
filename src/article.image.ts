import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { tryAcquire } from "./ai.limits.js";
import { downloadToTemp, executeCodex } from "./codex.creative.js";
import { projectDataPath, type ProjectConfig } from "./projects/index.js";

const imageDir = (project: ProjectConfig) => projectDataPath(project, "article-images");
export const ARTICLE_IMAGE_WIDTH = 1200;
export const ARTICLE_IMAGE_HEIGHT = 675;
export const ARTICLE_IMAGE_MIME_TYPE = "image/jpeg";
export const ARTICLE_IMAGE_FILE_EXTENSION = "jpg";
export const articleImagePath = (project: ProjectConfig, id: string) => path.join(imageDir(project), `${id}.jpg`);
export const legacyArticleImagePath = (project: ProjectConfig, id: string) => path.join(imageDir(project), `${id}.png`);
export const articleImagePaths = (project: ProjectConfig, id: string) => [articleImagePath(project, id), legacyArticleImagePath(project, id)];
export const existingArticleImagePath = (project: ProjectConfig, id: string) => articleImagePaths(project, id).find(existsSync);

export interface ArticleImageInput { title: string; topic: string; imageConcept: string }

export const optimizeArticleImage = (input: Buffer | string) => sharp(input)
  .resize(ARTICLE_IMAGE_WIDTH, ARTICLE_IMAGE_HEIGHT, { fit: "cover", position: sharp.strategy.attention })
  .jpeg({ quality: 84, progressive: true })
  .toBuffer();

export function buildArticleImagePrompt(project: ProjectConfig, article: ArticleImageInput): string {
  const brand = project.brand.displayName;
  return `Create a premium 16:9 editorial photograph for the ${brand} article "${article.title}" in the topic "${article.topic}".

CONCEPT:
${article.imageConcept}

Make the scene feel like a professionally art-directed US lifestyle magazine photograph. Flowers must remain important and recognizable, but use meaningful action, layered composition, natural depth, a specific setting and expressive light. Match the attached ${brand} product's real visible flower and color details without copying its catalog background. Leave comfortable edge-safe composition for responsive crops.

FORMAT: landscape 16:9, 1200×675 final crop, photographic realism, premium natural color and texture.
STRICTLY: no text, letters, numbers, logos, watermarks, cards with writing, frames, collages, diagrams or UI elements. Avoid a plain white background or centered catalog composition.`;
}

export async function generateArticleImage(project: ProjectConfig, id: string, article: ArticleImageInput, productImageUrl: string, signal?: AbortSignal): Promise<boolean> {
  const release = tryAcquire("codex");
  if (!release) { console.warn("Article image skipped: another Codex job is running"); return false; }
  const uuid = randomUUID().slice(0, 8);
  const temporary: string[] = [];
  try {
    await mkdir(imageDir(project), { recursive: true });
    await mkdir(path.join(process.cwd(), "test-creatives"), { recursive: true });
    const productPath = await downloadToTemp(productImageUrl, `article-product-${uuid}.${productImageUrl.split(".").pop()?.split("?")[0] || "webp"}`);
    temporary.push(productPath);
    const generated = await executeCodex(buildArticleImagePrompt(project, article), productPath, `article-image-${uuid}.png`, signal);
    temporary.push(generated);
    const finalPath = articleImagePath(project, id);
    const pendingPath = `${finalPath}.${uuid}.tmp`;
    temporary.push(pendingPath);
    await writeFile(pendingPath, await optimizeArticleImage(generated));
    await rename(pendingPath, finalPath);
    await unlink(legacyArticleImagePath(project, id)).catch(() => undefined);
    return true;
  } catch (error) {
    console.error("Article image generation failed, falling back to the product photo:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    release();
    await Promise.all(temporary.map((file) => unlink(file).catch(() => undefined)));
  }
}

export async function readArticleImage(project: ProjectConfig, id: string): Promise<Buffer | null> {
  const file = existingArticleImagePath(project, id);
  if (!file) return null;
  const image = await readFile(file);
  return file === legacyArticleImagePath(project, id) ? optimizeArticleImage(image) : image;
}
