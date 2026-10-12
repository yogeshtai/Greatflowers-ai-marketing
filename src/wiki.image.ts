import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { tryAcquire } from "./ai.limits.js";
import { downloadToTemp, executeCodex } from "./codex.creative.js";

const IMAGE_DIR = path.join(process.cwd(), "data", "wiki-images");
export const WIKI_IMAGE_WIDTH = 1200;
export const WIKI_IMAGE_HEIGHT = 900;
export const wikiImagePath = (id: string) => path.join(IMAGE_DIR, `${id}.png`);

export interface WikiImageInput {
  title: string;
  botanicalName: string;
  imageConcept: string;
}

export function buildWikiImagePrompt(wiki: WikiImageInput): string {
  return `Create a premium 4:3 editorial botanical photograph for the Great Flowers encyclopedia entry "${wiki.title}" (${wiki.botanicalName}).

CONCEPT:
${wiki.imageConcept}

The flower or plant must be botanically recognizable and the unmistakable main subject. Show accurate bloom shape, petals, foliage and stem structure. Use the attached florist product only as visual reference when it genuinely contains this flower; do not copy unrelated flowers or invent a mixed bouquet.

Create a refined botanical-editorial composition with natural depth: a clear primary specimen, one or two supporting stems, subtle environmental context and premium soft light. A bloom, partial stem and foliage should remain visible after a 4:3 center crop. Avoid a plain white catalog background, flat clip-art styling, excessive props, people, hands and crowded arrangements.

FORMAT: landscape 4:3, 1200×900 final crop, photographic realism, natural color and texture.
STRICTLY: no text, labels, letters, numbers, logos, watermarks, frames, diagrams or UI elements.`;
}

export async function generateWikiImage(id: string, wiki: WikiImageInput, productImageUrl: string, signal?: AbortSignal): Promise<boolean> {
  const release = tryAcquire("codex");
  if (!release) {
    console.warn("Wiki image skipped: another Codex job is running");
    return false;
  }
  const uuid = randomUUID().slice(0, 8);
  const temporary: string[] = [];
  try {
    await mkdir(IMAGE_DIR, { recursive: true });
    await mkdir(path.join(process.cwd(), "test-creatives"), { recursive: true });
    const productPath = await downloadToTemp(productImageUrl, `wiki-product-${uuid}.${productImageUrl.split(".").pop()?.split("?")[0] || "webp"}`);
    temporary.push(productPath);
    const generated = await executeCodex(buildWikiImagePrompt(wiki), productPath, `wiki-image-${uuid}.png`, signal);
    temporary.push(generated);
    const finalPath = wikiImagePath(id);
    const pendingPath = `${finalPath}.${uuid}.tmp`;
    temporary.push(pendingPath);
    await writeFile(pendingPath, await sharp(generated)
      .resize(WIKI_IMAGE_WIDTH, WIKI_IMAGE_HEIGHT, { fit: "cover", position: sharp.strategy.attention })
      .png().toBuffer());
    await rename(pendingPath, finalPath);
    return true;
  } catch (error) {
    console.error("Wiki image generation failed, falling back to the product photo:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    release();
    await Promise.all(temporary.map((file) => unlink(file).catch(() => undefined)));
  }
}

export const readWikiImage = (id: string) => readFile(wikiImagePath(id)).catch(() => null);
