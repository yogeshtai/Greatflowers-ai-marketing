import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { downloadToTemp, executeCodex } from "./codex.creative.js";
import { tryAcquire } from "./ai.limits.js";

const HERO_DIR = path.join(process.cwd(), "data", "blog-heroes");
export const heroPath = (id: string) => path.join(HERO_DIR, `${id}.png`);

export function buildHeroPrompt(post: { title: string; topic: string }): string {
  return `Create a photorealistic editorial hero photograph for a florist's blog post titled "${post.title}" (topic: ${post.topic}).
Use the attached product photo as the exact reference for the bouquet: keep the same flowers, colors and vase. Do not change, add or invent flowers.
Place the bouquet in a natural, tasteful setting that suits the topic (for example a table, windowsill or seasonal scene). Landscape 16:9 composition, bouquet slightly off-center with calm space around it, soft natural light, clean and bright.
Strictly: no text, no letters, no numbers, no logos, no watermarks, no hands or faces.`;
}

// Returns true when an AI hero was written to data/blog-heroes/<id>.png; false means "use the product photo instead".
export async function generateHeroImage(id: string, post: { title: string; topic: string }, productImageUrl: string, signal?: AbortSignal): Promise<boolean> {
  const release = tryAcquire("codex");
  if (!release) {
    console.warn("Hero image skipped: another Codex job is running");
    return false;
  }
  const uuid = randomUUID().slice(0, 8);
  const temporary: string[] = [];
  try {
    await mkdir(HERO_DIR, { recursive: true });
    await mkdir(path.join(process.cwd(), "test-creatives"), { recursive: true });
    const productPath = await downloadToTemp(productImageUrl, `blog-product-${uuid}.${productImageUrl.split(".").pop()?.split("?")[0] || "webp"}`);
    temporary.push(productPath);
    const generated = await executeCodex(buildHeroPrompt(post), productPath, `blog-hero-${uuid}.png`, signal);
    temporary.push(generated);
    await writeFile(heroPath(id), await sharp(generated).resize(1200, 630, { fit: "cover", position: sharp.strategy.attention }).png().toBuffer());
    return true;
  } catch (error) {
    console.error("Hero image generation failed, falling back to the product photo:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    release();
    await Promise.all(temporary.map((file) => unlink(file).catch(() => undefined)));
  }
}

export const readHeroImage = (id: string) => readFile(heroPath(id)).catch(() => null);
