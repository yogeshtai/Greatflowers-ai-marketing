import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { downloadToTemp, executeCodex } from "./codex.creative.js";
import { tryAcquire } from "./ai.limits.js";

const HERO_DIR = path.join(process.cwd(), "data", "blog-heroes");
export const heroPath = (id: string) => path.join(HERO_DIR, `${id}.png`);

const COMPOSITIONS = [
  "an overhead flat lay on a styled surface, with props arranged around the bouquet",
  "a close-up where the bouquet fills most of the frame, with a creamy blurred background",
  "a doorstep or porch delivery scene, the bouquet beside a front door with seasonal decor",
  "a dining or kitchen setting lit by golden-hour window backlight with long soft shadows",
  "a rustic wooden surface with scattered petals and seasonal elements in moody, warm light",
  "a styled mantel or shelf with candles and seasonal decor, shallow depth of field",
  "an outdoor garden or leaf-strewn setting in natural sunlight with soft bokeh",
  "an elegant celebration table with tableware and festive details softly blurred behind the bouquet",
];

export const pickComposition = (random: () => number = Math.random) => COMPOSITIONS[Math.floor(random() * COMPOSITIONS.length)]!;

export function buildHeroPrompt(post: { title: string; topic: string; heroConcept?: string | undefined }, composition: string = pickComposition()): string {
  return `Create a creative, scroll-stopping editorial hero photograph for a florist's blog post titled "${post.title}" (topic: ${post.topic}).
Creative concept: ${post.heroConcept ?? `a rich, seasonal lifestyle scene that tells the story of "${post.topic}"`}.
Composition: ${composition}.
The bouquet in the attached product photo is the star: keep its exact flowers, colors, shapes and vase. Do not change, add or remove flowers. Everything around it should be creative: tasteful themed props, layered depth, atmospheric light, a warm storytelling mood. It should look like a premium magazine lifestyle photograph, not a plain catalog shot on a bare table.
Landscape 16:9. Keep the bouquet clearly visible and not cropped awkwardly.
Strictly: no text, no letters, no numbers, no logos, no watermarks, no signs or cards with words, no hands or faces.`;
}

// Returns true when an AI hero was written to data/blog-heroes/<id>.png; false means "use the product photo instead".
export async function generateHeroImage(id: string, post: { title: string; topic: string; heroConcept?: string | undefined }, productImageUrl: string, signal?: AbortSignal): Promise<boolean> {
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
