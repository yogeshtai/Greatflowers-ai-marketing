import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { downloadToTemp, executeCodex } from "./codex.creative.js";
import { tryAcquire } from "./ai.limits.js";

const HERO_DIR = path.join(process.cwd(), "data", "blog-heroes");
export const heroPath = (id: string) => path.join(HERO_DIR, `${id}.png`);

// The blog's hero slot renders a wide panoramic banner; existing posts all use 1712×624.
export const HERO_WIDTH = 1712;
export const HERO_HEIGHT = 624;

export interface HeroInput {
  title: string;
  topic: string;
  heroStrategy?: "HUMAN_GIFTING_MOMENT" | "HUMAN_LIFESTYLE" | "OCCASION_SCENE" | "EDITORIAL_CONTENT" | undefined;
  heroProductRole?: "hero" | "supporting" | undefined;
  heroConcept?: string | undefined;
}

const SCENE_COMPOSITIONS = [
  "a candid medium shot at eye level with a shallow depth of field",
  "a close, intimate framing of the moment with the background softly blurred",
  "a wide environmental shot where the setting tells the story",
  "a warm golden-hour backlit shot with long soft shadows",
  "an over-the-shoulder or three-quarter view that feels like a captured moment",
  "a slightly low angle with layered foreground props and a blurred background",
];
const EDITORIAL_COMPOSITIONS = [
  "an overhead flat lay on a styled surface with props arranged around the flowers",
  "a close-up where the flowers fill most of the frame with a creamy blurred background",
  "a styled shelf or mantel with candles and seasonal decor, shallow depth of field",
  "a rustic surface with scattered petals and seasonal elements in moody, warm light",
];
export const pickComposition = (strategy: HeroInput["heroStrategy"] = "HUMAN_GIFTING_MOMENT", random: () => number = Math.random) => {
  const list = strategy === "EDITORIAL_CONTENT" ? EDITORIAL_COMPOSITIONS : SCENE_COMPOSITIONS;
  return list[Math.floor(random() * list.length)]!;
};

const SENSITIVE = /sympath|condolence|funeral|memorial|bereave|grief|loss of|passed away/i;

const STRATEGY_RULES: Record<NonNullable<HeroInput["heroStrategy"]>, string> = {
  HUMAN_GIFTING_MOMENT: `SCENE STRATEGY: HUMAN_GIFTING_MOMENT (a person giving, receiving or arranging flowers)
Create a genuine human emotional moment. REQUIRED: include one or more people interacting with the flowers.
The PEOPLE and the EMOTIONAL MOMENT are the visual story; the flowers support it.
DO NOT make a centered product shot with a person added. BUILD THE HUMAN MOMENT FIRST.`,
  HUMAN_LIFESTYLE: `SCENE STRATEGY: HUMAN_LIFESTYLE (an authentic lifestyle scene with people)
REQUIRED: include one or more people in a natural everyday moment where the flowers are present.
The scene and emotion are the focus; flowers participate naturally but are not the dominant subject.
It should look like real editorial lifestyle content, NOT catalog photography.`,
  OCCASION_SCENE: `SCENE STRATEGY: OCCASION_SCENE (the occasion environment dominates)
The setting, props and atmosphere tell the occasion story. The flowers are part of the scene, not a centered product shot.
People may appear only when appropriate; if they do, keep them natural and in the background or partially framed.`,
  EDITORIAL_CONTENT: `SCENE STRATEGY: EDITORIAL_CONTENT (magazine-style editorial still life)
A premium styled editorial composition with themed props and layered depth. People are not required.
Do not make it look like a catalog product shot on a bare table.`,
};

export function buildHeroPrompt(post: HeroInput, composition?: string): string {
  const sensitive = SENSITIVE.test(`${post.title} ${post.topic}`);
  const strategy = sensitive ? "OCCASION_SCENE" : post.heroStrategy ?? "HUMAN_GIFTING_MOMENT";
  const role = post.heroProductRole ?? (strategy === "EDITORIAL_CONTENT" ? "hero" : "supporting");
  return `Create a creative, scroll-stopping editorial hero photograph for a florist's blog post titled "${post.title}" (topic: ${post.topic}).

${STRATEGY_RULES[strategy]}

STRATEGIC CONCEPT:
${post.heroConcept ?? `A scene that tells the story of "${post.topic}" for someone choosing flowers to send or give.`}

COMPOSITION: ${composition ?? pickComposition(strategy)}.

PRODUCT ROLE: ${role.toUpperCase()}
The bouquet in the attached product photo must appear in the scene with its exact flowers, colors, shapes and vase. Do not change, add or remove flowers.${role === "supporting" ? "\nIt is NOT the centered subject: integrate it naturally (held, handed over, on a table or doorstep) and make sure it is clearly visible and recognizable." : "\nIt is the clear hero of the frame."}

${sensitive ? "SENSITIVE TOPIC: keep the image quiet, respectful and tasteful: soft light, calm colors, no smiling people, no celebratory props.\n\n" : ""}PEOPLE (when present): natural, candid and realistic, with correct hands and faces, authentic expressions, varied ages and backgrounds that fit the story. No stiff stock-photo posing, no distorted fingers or faces.

STYLE: premium magazine lifestyle photography, layered depth, atmospheric light, warm storytelling mood, themed props that fit the topic and season.
FORMAT: extra-wide panoramic banner (1712×624, about 2.7:1): compose for a very wide, short frame — spread the scene horizontally, keep the key subject off the extreme edges.
STRICTLY: no text, no letters, no numbers, no logos, no watermarks, no signs or cards with readable words, no buttons or UI elements.`;
}

// Returns true when an AI hero was written to data/blog-heroes/<id>.png; false means "use the product photo instead".
export async function generateHeroImage(id: string, post: HeroInput, productImageUrl: string, signal?: AbortSignal): Promise<boolean> {
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
    await writeFile(heroPath(id), await sharp(generated).resize(HERO_WIDTH, HERO_HEIGHT, { fit: "cover", position: sharp.strategy.attention }).png().toBuffer());
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
