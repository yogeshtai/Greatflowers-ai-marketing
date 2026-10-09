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

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

function titleLines(title: string, maxCharacters = 30, maxLines = 4): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    if (!lines.length) {
      lines.push(word);
      continue;
    }
    const index = lines.length - 1;
    const candidate = `${lines[index]} ${word}`;
    if (candidate.length <= maxCharacters || lines.length === maxLines) lines[index] = candidate;
    else lines.push(word);
  }
  return lines;
}

// Typography is composited after generation so the title is always spelled correctly;
// the image model still receives a strict no-text prompt to prevent visual gibberish.
export function buildHeroOverlaySvg(title: string): Buffer {
  const lines = titleLines(title);
  const panelX = 930;
  const panelWidth = 710;
  const panelHeight = 250 + Math.max(0, lines.length - 2) * 38;
  const panelY = HERO_HEIGHT - panelHeight - 42;
  const textX = panelX + 46;
  const startY = panelY + 126;
  const text = lines.map((line, index) => `<text x="${textX}" y="${startY + index * 48}" class="title">${escapeXml(line)}</text>`).join("");
  return Buffer.from(`<svg width="${HERO_WIDTH}" height="${HERO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="24" fill="#17120f" fill-opacity="0.76" stroke="#ffffff" stroke-opacity="0.16"/>
    <rect x="${textX}" y="${panelY + 38}" width="46" height="4" rx="2" fill="#e7b85d"/>
    <text x="${textX}" y="${panelY + 78}" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="3.5" fill="#f0d08d">GREAT FLOWERS JOURNAL</text>
    <style>.title{font-family:Georgia,serif;font-size:38px;font-weight:700;fill:white}</style>
    ${text}
  </svg>`);
}

export interface HeroInput {
  title: string;
  topic: string;
  heroStrategy?: "HUMAN_GIFTING_MOMENT" | "HUMAN_LIFESTYLE" | "OCCASION_SCENE" | "EDITORIAL_CONTENT" | undefined;
  heroProductRole?: "hero" | "supporting" | undefined;
  heroConcept?: string | undefined;
}

const SCENE_COMPOSITIONS = [
  "a candid medium shot caught mid-action, with an out-of-focus foreground detail and layered activity behind",
  "an intimate over-the-shoulder view at the emotional peak of the action, with the background softly blurred",
  "a wide environmental shot with the people and bouquet placed off-center and the setting unfolding across the frame",
  "a warm backlit shot with visible movement, long soft shadows and foreground elements framing the moment",
  "a cinematic three-quarter view that feels observed rather than posed, with clear foreground, middle ground and background",
  "a slightly low asymmetric angle with a person entering or reaching through the frame and atmospheric depth behind",
];
const EDITORIAL_COMPOSITIONS = [
  "an art-directed overhead composition with an unexpected diagonal layout, layered props and intentional negative space",
  "an extreme close detail transitioning into the full arrangement across the wide frame, with sculptural light and shadow",
  "a richly layered editorial setting with foreground objects, the arrangement off-center and atmospheric depth",
  "a magazine-style still life with a bold tonal palette, tactile surfaces and a surprising asymmetric crop",
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
Show a specific action frozen at its most expressive instant: hands meeting, a door opening, a surprised reaction, or someone finishing the arrangement.
DO NOT make a centered product shot with a person added. BUILD THE HUMAN MOMENT FIRST.`,
  HUMAN_LIFESTYLE: `SCENE STRATEGY: HUMAN_LIFESTYLE (an authentic lifestyle scene with people)
REQUIRED: include one or more people in a natural everyday moment where the flowers are present.
The scene and emotion are the focus; flowers participate naturally but are not the dominant subject.
Show a real action in progress rather than a person posing beside the bouquet.
It should look like cinematic editorial lifestyle content, NOT catalog or generic stock photography.`,
  OCCASION_SCENE: `SCENE STRATEGY: OCCASION_SCENE (the occasion environment dominates)
The setting, props and atmosphere tell the occasion story. The flowers are part of the scene, not a centered product shot.
Unless this is a sensitive sympathy or memorial topic, REQUIRED: include at least one naturally framed person actively preparing, hosting, arriving, reaching, carrying or interacting with the setting.
Capture an event in progress, not an empty decorated room or a static bouquet on a table.`,
  EDITORIAL_CONTENT: `SCENE STRATEGY: EDITORIAL_CONTENT (magazine-style editorial still life)
A premium styled editorial composition with themed props and layered depth. People are not required.
Use a bold visual idea, unusual crop, tactile surfaces, dramatic light or a strong color story.
Do not make it look like a catalog product shot or an ordinary bouquet on a decorated table.`,
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

VISUAL STORY REQUIREMENTS:
- Create one unmistakable visual event or art-directed idea, not merely a relevant location.
- Build three layers of depth: a foreground framing element, the main action or subject in the middle ground, and environmental story in the background.
- Use an asymmetric editorial composition with a strong focal path across the panoramic frame.
- Keep the people, bouquet and primary action within the LEFT two-thirds. Reserve the RIGHT third as calm negative space with no faces, hands, flowers or essential details; a title card will be added there after generation.
- Include small authentic details that reveal the occasion, but never let props replace the human story.
- Avoid the default formula of a bouquet centered on a table with decorations behind it. Avoid stiff posing, empty rooms, symmetrical catalog framing and generic stock-photo staging.

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
    await writeFile(heroPath(id), await sharp(generated)
      .resize(HERO_WIDTH, HERO_HEIGHT, { fit: "cover", position: sharp.strategy.attention })
      .composite([{ input: buildHeroOverlaySvg(post.title), top: 0, left: 0 }])
      .png().toBuffer());
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
