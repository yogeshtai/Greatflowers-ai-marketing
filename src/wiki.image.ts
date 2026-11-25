import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { tryAcquire } from "./ai.limits.js";
import { downloadToTemp, executeCodex } from "./codex.creative.js";
import { projectDataPath, type ProjectConfig } from "./projects/index.js";

const imageDir = (project: ProjectConfig) => projectDataPath(project, "wiki-images");
export const WIKI_IMAGE_WIDTH = 1200;
export const WIKI_IMAGE_HEIGHT = 900;
export const WIKI_IMAGE_MIME_TYPE = "image/jpeg";
export const WIKI_IMAGE_FILE_EXTENSION = "jpg";
export const wikiImagePath = (project: ProjectConfig, id: string) => path.join(imageDir(project), `${id}.${WIKI_IMAGE_FILE_EXTENSION}`);
export const legacyWikiImagePath = (project: ProjectConfig, id: string) => path.join(imageDir(project), `${id}.png`);
export const wikiImagePaths = (project: ProjectConfig, id: string) => [wikiImagePath(project, id), legacyWikiImagePath(project, id)];
export const existingWikiImagePath = (project: ProjectConfig, id: string) => wikiImagePaths(project, id).find(existsSync);
const WIKI_JPEG_QUALITY = 84;

export interface WikiImageInput {
  title: string;
  botanicalName: string;
  imageConcept: string;
}

export const optimizeWikiImage = (input: Buffer | string) => sharp(input)
  .resize(WIKI_IMAGE_WIDTH, WIKI_IMAGE_HEIGHT, { fit: "cover", position: sharp.strategy.attention })
  .jpeg({ quality: WIKI_JPEG_QUALITY, progressive: true })
  .toBuffer();

export function buildWikiImagePrompt(project: ProjectConfig, wiki: WikiImageInput): string {
  return `Create a premium 4:3 editorial botanical photograph for the ${project.brand.displayName} encyclopedia entry "${wiki.title}" (${wiki.botanicalName}).

CONCEPT:
${wiki.imageConcept}

The flower or plant must be botanically recognizable and the unmistakable main subject. Show accurate bloom shape, petals, foliage and stem structure. Use the attached florist product only as visual reference when it genuinely contains this flower; do not copy unrelated flowers or invent a mixed bouquet.

Create a refined botanical-editorial composition with natural depth: a clear primary specimen, one or two supporting stems, subtle environmental context and premium soft light. A bloom, partial stem and foliage should remain visible after a 4:3 center crop. Avoid a plain white catalog background, flat clip-art styling, excessive props, people, hands and crowded arrangements.

FORMAT: landscape 4:3, 1200×900 final crop, photographic realism, natural color and texture.
STRICTLY: no text, labels, letters, numbers, logos, watermarks, frames, diagrams or UI elements.`;
}

export async function generateWikiImage(project: ProjectConfig, id: string, wiki: WikiImageInput, productImageUrl: string, signal?: AbortSignal): Promise<boolean> {
  const release = tryAcquire("codex");
  if (!release) {
    console.warn("Wiki image skipped: another Codex job is running");
    return false;
  }
  const uuid = randomUUID().slice(0, 8);
  const temporary: string[] = [];
  try {
    await mkdir(imageDir(project), { recursive: true });
    await mkdir(path.join(process.cwd(), "test-creatives"), { recursive: true });
    const productPath = await downloadToTemp(productImageUrl, `wiki-product-${uuid}.${productImageUrl.split(".").pop()?.split("?")[0] || "webp"}`);
    temporary.push(productPath);
    const generated = await executeCodex(buildWikiImagePrompt(project, wiki), productPath, `wiki-image-${uuid}.png`, signal);
    temporary.push(generated);
    const finalPath = wikiImagePath(project, id);
    const pendingPath = `${finalPath}.${uuid}.tmp`;
    temporary.push(pendingPath);
    await writeFile(pendingPath, await optimizeWikiImage(generated));
    await rename(pendingPath, finalPath);
    await unlink(legacyWikiImagePath(project, id)).catch(() => undefined);
    return true;
  } catch (error) {
    console.error("Wiki image generation failed, falling back to the product photo:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    release();
    await Promise.all(temporary.map((file) => unlink(file).catch(() => undefined)));
  }
}

export async function readWikiImage(project: ProjectConfig, id: string): Promise<Buffer | null> {
  const file = existingWikiImagePath(project, id);
  if (!file) return null;
  const image = await readFile(file);
  // Convert legacy PNG drafts during publishing without requiring regeneration.
  return file === legacyWikiImagePath(project, id) ? optimizeWikiImage(image) : image;
}
