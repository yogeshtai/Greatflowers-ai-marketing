import { spawn } from "node:child_process";
import {
  writeFile,
  mkdir,
  readFile,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import fetch from "node-fetch";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CODEX_SPAWN_OPTIONS, codexLimitArgs, guardCodexProcess } from "./ai.limits.js";
import { addCreativeText, buildCreativeTextOverlay, CREATIVE_LOGO_WIDTH_RATIO as LOGO_WIDTH_RATIO, CREATIVE_MARGIN_RATIO, type CreativeTextSide, type CreativeTextVertical } from "./creative.text.js";
import { ART_DIRECTION_GUIDANCE, ENVIRONMENT_GUIDANCE, LIGHTING_GUIDANCE, fallbackArtDirection, fallbackCopyLayout, fallbackEnvironment, fallbackLightingSetup, type ArtDirection, type CopyLayout, type SceneEnvironment, type LightingSetup } from "./creative.direction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEX_GENERATED_IMAGES_DIR =
  process.env.CODEX_GENERATED_IMAGES_DIR || join(homedir(), ".codex", "generated_images");

function resolveCodexBinary(): string {
  // Prefer locally installed @openai/codex so it works after npm install
  const localBin = join(
    __dirname,
    "..",
    "node_modules",
    ".bin",
    "codex"
  );

  if (existsSync(localBin)) {
    return localBin;
  }

  // Fall back to global PATH (e.g. Homebrew on macOS or global npm on Linux)
  return "codex";
}

async function getCodexGeneratedImages(): Promise<string[]> {
  const images: string[] = [];

  if (!existsSync(CODEX_GENERATED_IMAGES_DIR)) {
    return images;
  }

  const sessionFolders = await readdir(
    CODEX_GENERATED_IMAGES_DIR
  );

  for (const sessionFolder of sessionFolders) {
    const sessionPath = join(
      CODEX_GENERATED_IMAGES_DIR,
      sessionFolder
    );

    try {
      const files = await readdir(sessionPath);

      for (const file of files) {
        if (file.toLowerCase().endsWith(".png")) {
          images.push(join(sessionPath, file));
        }
      }
    } catch {
      // Ignore folders/files that cannot be read
    }
  }

  return images;
}

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.AWS_S3_BUCKET!;
const PREFIX = process.env.AWS_S3_CREATIVE_PREFIX || "campaign";

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface CreativeVariant {
  order: number;
  creativeType:
    | "product"
    | "lifestyle"
    | "occasion"
    | "location"
    | "feature"
    | "informational"
    | "brand-awareness";
  sceneStrategy:
    | "PRODUCT_STUDIO"
    | "HUMAN_GIFTING_MOMENT"
    | "HUMAN_LIFESTYLE"
    | "OCCASION_SCENE"
    | "EDITORIAL_CONTENT"
    | "INFORMATIONAL_GRAPHIC"
    | "LOCATION_STORY"
    | "FEATURE_DEMO"
    | "BRAND_STORY";
  concept: string;
  headline: string;
  subheadline: string;
  contentPoints?: string[];
  cta: string;
  visualDirection: string;
  productRole: "hero" | "supporting" | "optional" | "none";
  locationContext?: string;
  occasionContext?: string;
  colorPalette: string;
  compositionStyle: string;
  lightingStyle: string;
  sceneType: string;
  artDirection?: ArtDirection;
  copyLayout?: CopyLayout;
  environment?: SceneEnvironment;
  lightingSetup?: LightingSetup;
}

export interface CreativeBrief {
  headline: string;
  subheadline: string;
  cta: string;
  mood: string;
  backgroundDirection: string;
  productTreatment: string;
  logoPlacement: string;
  textPlacement: string;
  creativeGoal: string;
  variants: CreativeVariant[];
}

export interface CreativeResult {
  variantOrder: number;
  type: string;
  localPath: string;
  headline: string;
  subheadline: string;
  cta: string;
  artDirection: ArtDirection;
  copyLayout: CopyLayout;
  environment: SceneEnvironment;
  lightingSetup: LightingSetup;
  success: boolean;
  error?: string;
}

export function shouldUseProductReference(
  variant: Pick<CreativeVariant, "productRole">
): boolean {
  return variant.productRole !== "none";
}

export function layoutForCreativeVariant(
  variant: Pick<CreativeVariant, "order" | "contentPoints" | "copyLayout">
): { logoPosition: "top-left" | "top-right"; textSide: CreativeTextSide; textVertical: CreativeTextVertical } {
  const copyLayout = variant.copyLayout ?? fallbackCopyLayout(variant.order);
  const hasContentPoints = Boolean(variant.contentPoints?.length);
  const textSide: CreativeTextSide = copyLayout.includes("right") ? "right" : "left";
  const textVertical: CreativeTextVertical = hasContentPoints || copyLayout.startsWith("top-")
    ? "top" : "lower";
  return {
    // The logo anchors the top of the text column (brand block), like the approved ad references.
    logoPosition: textSide === "left" ? "top-left" : "top-right",
    textSide,
    textVertical,
  };
}

export function shouldShowWebsiteCta(
  variant: Pick<CreativeVariant, "order">
): boolean {
  return variant.order === 4;
}

const GREATFLOWERS_LOGO_URL =
  "https://greatflowers.net/assets/svg/greatflowers-logo.svg";

export const CREATIVE_LOGO_WIDTH_RATIO = LOGO_WIDTH_RATIO;
export const CREATIVE_CTA_PURPLE = "#32105f";

const OUTPUT_DIR = join(process.cwd(), "test-creatives");

export async function downloadToTemp(
  url: string,
  filename: string
): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status}`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  const tempPath = join("/tmp", filename);

  await writeFile(tempPath, buffer);

  return tempPath;
}

async function uploadToS3(
  localPath: string,
  filename: string
): Promise<string> {
  const fileBuffer = await readFile(localPath);

  const key = `${PREFIX}/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: "image/png",
    })
  );

  // Return public S3 URL
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export function buildCodexPrompt(
  variant: CreativeVariant,
  creativeBrief: CreativeBrief
): string {
  // Build sceneStrategy-specific composition instructions
  let sceneStrategyInstructions = "";
  
  switch (variant.sceneStrategy) {
    case "PRODUCT_STUDIO":
      sceneStrategyInstructions = `SCENE STRATEGY: PRODUCT_STUDIO (Commercial Product Photography)

Create a professional commercial product photography composition.
The supplied GreatFlowers product is the main visual subject.
${creativeBrief.productTreatment}

The product should occupy significant visual space and be the clear hero.
Use professional product photography techniques, lighting, and staging.
This is a catalog/advertisement-style product shot.`;
      break;
      
    case "HUMAN_GIFTING_MOMENT":
      sceneStrategyInstructions = `SCENE STRATEGY: HUMAN_GIFTING_MOMENT (Person Giving/Receiving Flowers)

CRITICAL: Create a genuine human emotional moment.
Show a person giving, receiving, or interacting with flowers.
The PERSON and EMOTIONAL MOMENT are the visual story - NOT the product.

REQUIRED: Include one or more people in the scene.
The flowers are supporting elements in the human interaction.
Capture the emotion, gesture, or connection.

DO NOT use centered product composition.
DO NOT create a product advertisement with a person added.
BUILD THE HUMAN MOMENT FIRST, flowers support it.`;
      break;
      
    case "HUMAN_LIFESTYLE":
      sceneStrategyInstructions = `SCENE STRATEGY: HUMAN_LIFESTYLE (Lifestyle Scene with People)

Create a genuine lifestyle scene where people naturally interact with flowers.
REQUIRED: Include one or more people in authentic lifestyle moments.

The scene/lifestyle/emotion is the main focus.
Flowers participate naturally but are NOT the dominant subject.

DO NOT use centered product composition.
DO NOT simply place product in a room with a person.
This should resemble real social media lifestyle content, NOT catalog photography.`;
      break;
      
    case "OCCASION_SCENE":
      sceneStrategyInstructions = `SCENE STRATEGY: OCCASION_SCENE (Occasion-Focused Environment)

Build a scene that visually communicates the occasion: ${variant.occasionContext || variant.concept}

The occasion/story/environment should DOMINATE the composition.
The setting, props, and atmosphere tell the occasion story.
Product supports the scene but does NOT occupy the same dominant position as a product creative.

Human presence may be included when appropriate to the occasion.
For sensitive occasions (sympathy, condolence), keep scenes respectful and tasteful.`;
      break;
      
    case "EDITORIAL_CONTENT":
      sceneStrategyInstructions = `SCENE STRATEGY: EDITORIAL_CONTENT (Editorial/Social Content)

Create an editorial or social content composition.
Examples: occasion guide, flower/color story, seasonal content, care tips, selection advice.

CRITICAL: Flowers must remain a clear, visually important subject.
DO NOT create a centered catalog-product layout.
DO NOT make the supplied product the main visual subject.

Use an editorial/magazine/social content visual style.
The content/information/story is the focus, but it must directly concern choosing, gifting,
arranging or caring for flowers. Props support the flower story and may never replace it.
The exact catalog product need not appear, but natural flowers must be clearly visible.`;
      break;
      
    case "INFORMATIONAL_GRAPHIC":
      sceneStrategyInstructions = `SCENE STRATEGY: INFORMATIONAL_GRAPHIC (Structured Useful Content)

Create a structured informational/educational graphic design.
This is useful content, NOT a product advertisement.

The layout should clearly communicate useful information about choosing, gifting, arranging
or caring for flowers. Natural flowers must remain clearly visible and visually important.
Product should NOT dominate the canvas, and decor props must remain secondary.
Use design elements that support learning or understanding.`;
      break;
      
    case "LOCATION_STORY":
      sceneStrategyInstructions = `SCENE STRATEGY: LOCATION_STORY (Location-Led Composition)

Create a location-oriented composition where the place/environment leads the visual.
${variant.locationContext ? `Location: ${variant.locationContext}` : ''}

The location/environment/story should be the primary visual element.
Product supports the location story but is not the main subject.`;
      break;
      
    case "FEATURE_DEMO":
      sceneStrategyInstructions = `SCENE STRATEGY: FEATURE_DEMO (Feature Demonstration)

Visually demonstrate the specific feature or service benefit.
The composition should clearly communicate how the feature works or its value.
Product reference is only used when relevant to demonstrating that feature.`;
      break;
      
    case "BRAND_STORY":
      sceneStrategyInstructions = `SCENE STRATEGY: BRAND_STORY (Brand Values/Service)

Build a broader GreatFlowers brand/service composition.
DO NOT automatically make one catalog product the hero.
Focus on brand values, service quality, customer care, or emotional connection.
Keep flowers clearly visible as the service and emotional centerpiece.`;
      break;
  }
  
  // Build product role instructions
  let productInstructions = "";
  
  switch (variant.productRole) {
    case "hero":
      productInstructions = `
PRODUCT ROLE: HERO
The supplied product image is the main visual subject.
Preserve the bouquet/product identity as closely as possible.`;
      break;
      
    case "supporting":
      productInstructions = `
PRODUCT ROLE: SUPPORTING
Use the supplied product image as the actual bouquet shown in the scene.
Preserve its recognizable flower mix, colors, arrangement and container.
The product must be clearly visible, but it is NOT the main subject.
Do not recreate a catalog-style product composition.
BUILD THE SCENE FIRST, then integrate flowers naturally into it.`;
      break;
      
    case "optional":
      productInstructions = `
PRODUCT ROLE: OPTIONAL
The scene may lead and the supplied product does not need to be the focus, but any bouquet or
arrangement that appears MUST be the exact supplied product: same flowers, colors, arrangement and
container. Never invent a different bouquet. Natural flowers are REQUIRED and must occupy a
meaningful part of the composition (roughly 20-35% of the frame), immediately visible as the
subject that connects this creative to GreatFlowers.`;
      break;
      
    case "none":
      productInstructions = `
PRODUCT ROLE: NONE
Do NOT visually reproduce a catalog product.
Do NOT add a bouquet merely to make the image feel commercial.
Generate from the strategic concept.`;
      break;
  }

  // Build context-specific instructions
  let contextInstructions = "";
  
  if (variant.occasionContext) {
    contextInstructions += `\n\nOCCASION CONTEXT:\n${variant.occasionContext}\nVisually communicate this occasion and its emotional context.`;
  }
  
  if (variant.locationContext) {
    contextInstructions += `\n\nLOCATION CONTEXT:\n${variant.locationContext}\nIncorporate this verified location/service area naturally.`;
  }

  const { logoPosition, textSide, textVertical } = layoutForCreativeVariant(variant);
  const artDirection = variant.artDirection ?? fallbackArtDirection(variant.sceneStrategy);
  const copyLayout = variant.copyLayout ?? fallbackCopyLayout(variant.order);
  const environment = variant.environment ?? fallbackEnvironment(variant.order);
  const lightingSetup = variant.lightingSetup ?? fallbackLightingSetup(variant.order);
  const fullBleedCopy = copyLayout.startsWith("full-bleed");
  const hasContentPoints = (variant.contentPoints?.length || 0) > 0;
  const showWebsiteCta = shouldShowWebsiteCta(variant);
  const typographySafeArea = hasContentPoints
    ? `outer ${textSide} 46% of the upper 82%`
    : fullBleedCopy
      ? `${textSide} 46% of the ${textVertical === "lower" ? "lower-middle" : "upper"} frame, retaining soft photographic detail beneath a natural tonal gradient`
    : textVertical === "lower"
      ? `outer ${textSide} 42% of the lower-middle band, from about 48% to 82% of the image height`
      : `outer ${textSide} 42% of the upper half`;
  const otherDirections = creativeBrief.variants
    .filter((candidate) => candidate.order !== variant.order)
    .map((candidate) => `- Variant ${candidate.order}: ${candidate.creativeType}; ${candidate.sceneStrategy}; ${candidate.artDirection ?? fallbackArtDirection(candidate.sceneStrategy)}; ${candidate.environment ?? fallbackEnvironment(candidate.order)}; ${candidate.lightingSetup ?? fallbackLightingSetup(candidate.order)}; ${candidate.copyLayout ?? fallbackCopyLayout(candidate.order)}; ${candidate.compositionStyle}; ${candidate.sceneType}`)
    .join("\n");

  return `Create a TEXT-FREE 1:1 premium social media campaign base image for GreatFlowers.

⚠️ CRITICAL COMPOSITION REQUIREMENT ⚠️

The sceneStrategy is a COMPOSITION REQUIREMENT, not a suggestion.
The generated image MUST visibly follow this strategy.

This campaign contains multiple creative concepts.
DO NOT reuse the same primary composition, product placement, room/table setup, 
camera framing, or visual hierarchy used for another variant.

Changing only headline, copy, background, crop, or lighting is NOT sufficient.
The composition, scene structure, and visual approach must be materially different.

OTHER ASSIGNED DIRECTIONS — DO NOT COPY THEIR SETTING, FRAMING OR SUBJECT PLACEMENT:
${otherDirections || "No other directions were supplied."}

CREATIVE TYPE: ${variant.creativeType.toUpperCase()}

STRATEGIC CONCEPT:
${variant.concept}

${sceneStrategyInstructions}
${productInstructions}${contextInstructions}

ENVIRONMENT (MANDATORY): ${environment}
${ENVIRONMENT_GUIDANCE[environment]}
This is the physical setting. No other variant in this campaign uses it. Do not relocate the scene to
a different room, surface or setting, and do not reuse an environment listed for another variant.

LIGHTING (MANDATORY): ${lightingSetup}
${LIGHTING_GUIDANCE[lightingSetup]}
Light the whole frame this way, including the background and the copy safe area.

ART DIRECTION (MANDATORY): ${artDirection}
${ART_DIRECTION_GUIDANCE[artDirection]}
Treat this as a photographic production brief. The camera angle, action, environment and flower
scale must visibly express this direction; changing only props or colors is not sufficient.

FLOWER COMMERCE RELEVANCE (CRITICAL):
This is a GreatFlowers marketing creative. Flowers must be immediately visible and relevant
to the idea, even when the exact catalog product is not used. The image should make someone
interested in choosing, sending, arranging or displaying flowers. Furniture, books, cups,
feathers, candles and other props may establish context, but must never become the primary
subject or visually replace the flowers. For human scenes, show an active flower-related
moment such as giving, receiving, arranging, carrying, delivering or unboxing.

COPY LAYOUT (CRITICAL): ${copyLayout}
The official GreatFlowers logo will be placed in the top ${logoPosition === "top-left" ? "left" : "right"} corner and the approved copy will use the assigned ${textVertical} ${textSide} zone.
That logo corner must be an evenly LIT, LIGHT, uncluttered area - pale wall, bright window light, sky,
light fabric or soft-focus highlight. The wordmark is a dark indigo-to-magenta gradient that only reads
on a light backdrop, so never place a dark window frame, deep shadow, doorway, silhouette or saturated
dark object there, and never let that corner be half bright and half dark.
Keep faces and the most important flower details out of those exact overlay zones, but do not empty
an entire half of the photograph. The scene must remain visually complete and intentional.
Do not generate, spell, draw, or recreate GreatFlowers branding or logo.

TYPOGRAPHY SAFE AREA (CRITICAL):
Reserve the ${typographySafeArea} as calm natural negative space with controlled contrast.
Keep faces and important flower details out of that zone. Natural wall, room, fabric, sky or soft-focus
scene detail may continue through it; avoid busy edges directly behind the copy.
Do not create a white rectangle, translucent card, blank paper panel or fake text box.
The application will typeset the approved headline, subheadline${hasContentPoints ? " and numbered content points" : ""} in this zone after generation.
${hasContentPoints ? "Do not draw empty circles, unlabeled icons, arrows, process diagrams or step placeholders." : ""}

${showWebsiteCta ? `WEBSITE CTA SAFE AREA:
Keep the lower-center 12% clear of faces, flowers and important objects for the website pill added later.` : `NO WEBSITE PILL:
Use the lower portion of the frame naturally. No button or URL will be added to this variant.`}

PRECEDENCE (CRITICAL): the ENVIRONMENT and LIGHTING assigned above are campaign-level decisions and
outrank every descriptive field that follows. The fields below describe atmosphere, styling and
emotion WITHIN that setting and light. Where they conflict, the assigned ENVIRONMENT and LIGHTING
win. A seasonal or occasion mood must never convert the assigned light into candlelight or darkness:
if the assigned lighting is bright daylight or diffused overcast, the photograph is bright, however
moody the occasion is.

CAMPAIGN BACKGROUND DIRECTION (reinterpret it for this variant; do not repeat another variant's room, surface or framing; it must not change the assigned environment):
${creativeBrief.backgroundDirection}

MOOD (emotional tone only — it does not set the time of day or the light level):
${creativeBrief.mood}

VISUAL DIRECTION FOR THIS VARIANT:
${variant.visualDirection}

COLOR PALETTE (props and styling only; it must not darken a brightly lit assignment):
${variant.colorPalette}

COMPOSITION STYLE:
${variant.compositionStyle}

LIGHTING STYLE (supporting detail for the assigned ${lightingSetup} lighting — elaborate it, never replace it):
${variant.lightingStyle}

SCENE TYPE (detail within the assigned ${environment} environment, not a different place):
${variant.sceneType}

CREATIVE GOAL:
${creativeBrief.creativeGoal}

CONSTRAINTS:
- Do NOT render any text, letters, numbers, handwriting, labels, prices, signs, buttons, UI, logo, brand mark, URL or watermark
- Do NOT pre-build a text panel; typography, logo and website CTA are composited programmatically
- Create a clean, professional social media image
- Output format: PNG
- Aspect ratio: 1:1 (square)

Save the generated image inside ./test-creatives/ with the filename provided in the next instruction.

Use image generation. Do not create SVG, HTML, or CSS.`;
}

export async function executeCodex(
  prompt: string,
  productImagePath: string | null,
  outputFilename: string,
  signal?: AbortSignal
): Promise<string> {
  signal?.throwIfAborted();

  // Take a snapshot of all Codex images BEFORE starting this generation
  const beforeImages = new Set(
    await getCodexGeneratedImages()
  );

  console.log(
    `📸 Codex images before generation: ${beforeImages.size}`
  );

  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      ...codexLimitArgs(),
      ...(productImagePath ? ["-i", productImagePath] : []),
      "--ephemeral",
      "--cd",
      OUTPUT_DIR,
      `${prompt}\n\nFilename: ${outputFilename}`,
    ];

    console.log(
      `🎨 Executing Codex for ${outputFilename}...`
    );

    const codexBinary = resolveCodexBinary();

    console.log(`🔧 Codex binary: ${codexBinary}`);

    const codex = spawn(codexBinary, args, CODEX_SPAWN_OPTIONS);
    guardCodexProcess(codex, signal);

    let stdout = "";
    let stderr = "";

    codex.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    codex.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    codex.on("close", async (code) => {
      try {
        console.log(`📤 Codex exit code: ${code}`);

        const debugLogPath = `/tmp/codex-debug-${Date.now()}.log`;

        await writeFile(
          debugLogPath,
          [
            `Exit code: ${code}`,
            "",
            "===== STDOUT =====",
            stdout,
            "",
            "===== STDERR =====",
            stderr,
          ].join("\n"),
          "utf8"
        );

        console.log(`📝 Codex debug output: ${debugLogPath}`);

        if (stdout.trim()) {
          console.log("📤 Codex stdout:");
          console.log(stdout);
        }

        if (stderr.trim()) {
          console.log("📤 Codex stderr:");
          console.log(stderr);
        }

        if (code !== 0) {
          reject(
            new Error(
              `Codex failed with exit code ${code}: ${stderr}`
            )
          );
          return;
        }

        // Check all Codex generated images AFTER this run
        const afterImages =
          await getCodexGeneratedImages();

        // Find images that did not exist before this Codex execution
        const newImages = afterImages.filter(
          (imagePath) => !beforeImages.has(imagePath)
        );

        console.log(
          `🖼️ New Codex images found: ${newImages.length}`
        );

        if (newImages.length === 0) {
          reject(
            new Error(
              "Codex completed but no new generated image was found"
            )
          );
          return;
        }

        // If more than one image exists, select the newest one
        const imagesWithStats = await Promise.all(
          newImages.map(async (imagePath) => {
            const fileStats = await stat(imagePath);

            return {
              path: imagePath,
              modifiedAt: fileStats.mtimeMs,
            };
          })
        );

        imagesWithStats.sort(
          (a, b) => b.modifiedAt - a.modifiedAt
        );

        const newestImage = imagesWithStats[0];

        if (!newestImage) {
          reject(
            new Error(
              "Codex completed but no generated image metadata was available"
            )
          );
          return;
        }

        const generatedImagePath = newestImage.path;

        if (!existsSync(generatedImagePath)) {
          reject(
            new Error(
              `Generated Codex image does not exist: ${generatedImagePath}`
            )
          );
          return;
        }

        console.log(
          `✅ Codex generated image found: ${generatedImagePath}`
        );

        resolve(generatedImagePath);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error(String(error))
        );
      }
    });

    codex.on("error", (error) => {
      reject(
        new Error(
          `Failed to spawn codex: ${error.message}`
        )
      );
    });
  });
}

type LogoPosition =
  | "top-left"
  | "top-right";

function resolveLogoPosition(
  logoPlacement: string | undefined
): LogoPosition {
  const placement = (logoPlacement || "")
    .toLowerCase();

  // The logo is always anchored to a top corner; default top-right.
  if (placement.includes("left")) return "top-left";
  return "top-right";
}

// The wordmark is a fixed-colour SVG composited blind, so it disappears into bright or busy
// corners. Measure what is actually behind it and lay down a soft gradient only when the contrast
// is too low to read.
// Sampled from the published wordmark: a gradient from indigo to magenta. Every stop is dark, so a
// corner only reads badly when it sits close to these in contrast terms.
const LOGO_COLOURS = ["#351E6A", "#701888", "#A52E7F", "#B32C7E", "#DB2173"] as const;
const MIN_LOGO_CONTRAST = 3;
const MIN_LOGO_SCRIM_OPACITY = 0.2;
const MAX_LOGO_SCRIM_OPACITY = 0.45;
const LOGO_SAMPLE_COLUMNS = 4;
const LOGO_SAMPLE_ROWS = 3;

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const LOGO_LUMINANCES = LOGO_COLOURS.map((hex) => relativeLuminance(
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
));

// The wordmark only reads when its hardest stop reads: the indigo end vanishes into dark corners
// long before the magenta end does, which leaves half the name invisible.
function logoWeakestContrast(r: number, g: number, b: number): number {
  const background = relativeLuminance(r, g, b);
  return Math.min(...LOGO_LUMINANCES.map((logo) => contrastRatio(background, logo)));
}

// Every scrim lightens. Darkening is unsound for this wordmark: its stops span luminance 0.027 to
// 0.174, so rescuing the magenta end needs a background below 0.025, where the indigo end collapses
// to about 1:1 - strictly worse than the problem it set out to fix. Lightening improves both ends
// at once, so the only question is how much is needed.
// Aim a little past the threshold: the opacity is solved on a grey equivalent of the corner, but
// compositing happens per channel, so landing exactly on 3:1 rounds back under it.
const LOGO_SCRIM_CONTRAST_MARGIN = 1.08;
const LOGO_SCRIM_TARGET_LUMINANCE =
  MIN_LOGO_CONTRAST * LOGO_SCRIM_CONTRAST_MARGIN * (Math.max(...LOGO_LUMINANCES) + 0.05) - 0.05;

// A scrim is only worth adding when the wordmark genuinely cannot be read against the corner behind
// it; laying one over a clean backdrop just leaves a smudge.
export function logoScrimTone(r: number, g: number, b: number): "light" | null {
  return logoWeakestContrast(r, g, b) >= MIN_LOGO_CONTRAST ? null : "light";
}

// One average over the whole corner hides a split background. A wordmark lying half on a bright
// wall and half on a dark window frame averages to a comfortable mid-tone while the dark half is
// unreadable, so judge the corner cell by cell and let the worst cell decide.
export function logoScrimToneForCells(
  cells: ReadonlyArray<readonly [number, number, number]>
): "light" | null {
  return cells.some((cell) => logoScrimTone(cell[0], cell[1], cell[2])) ? "light" : null;
}

function luminanceToChannel(luminance: number): number {
  const clamped = Math.min(1, Math.max(0, luminance));
  return (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255;
}

// A fixed strength is a guess: 0.34 white over a near-black window frame still leaves the indigo
// end under 3:1. Solve for the opacity the measured corner actually needs, so a corner that is
// merely dull gets a wash too faint to notice and only a genuinely black one gets a strong plate.
// The cap keeps a hopeless corner from turning into a solid white box.
export function logoScrimOpacity(r: number, g: number, b: number): number {
  const current = luminanceToChannel(relativeLuminance(r, g, b));
  if (current >= 255) return MIN_LOGO_SCRIM_OPACITY;
  const needed = (luminanceToChannel(LOGO_SCRIM_TARGET_LUMINANCE) - current) / (255 - current);
  return Math.min(MAX_LOGO_SCRIM_OPACITY, Math.max(MIN_LOGO_SCRIM_OPACITY, needed));
}

async function logoScrim(
  imagePath: string,
  left: number,
  top: number,
  logoWidth: number,
  logoHeight: number,
  imageWidth: number,
  imageHeight: number
): Promise<{ buffer: Buffer; left: number; top: number } | null> {
  const padX = Math.round(logoWidth * 0.35);
  const padY = Math.round(logoHeight * 0.9);
  const scrimLeft = Math.max(0, left - padX);
  const scrimTop = Math.max(0, top - padY);
  const scrimWidth = Math.min(imageWidth - scrimLeft, logoWidth + padX * 2);
  const scrimHeight = Math.min(imageHeight - scrimTop, logoHeight + padY * 2);
  if (scrimWidth <= 0 || scrimHeight <= 0) return null;

  let tone: "light" | null = null;
  let worstCell: [number, number, number] | null = null;
  try {
    // Downsampling to a grid gives one averaged sample per cell, so a corner that is bright on one
    // side and dark on the other is judged by its worst patch instead of its mean.
    const { data, info } = await sharp(imagePath)
      .extract({ left, top, width: Math.min(logoWidth, imageWidth - left), height: Math.min(logoHeight, imageHeight - top) })
      .resize(LOGO_SAMPLE_COLUMNS, LOGO_SAMPLE_ROWS, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cells: Array<[number, number, number]> = [];
    for (let index = 0; index + 2 < data.length; index += info.channels) {
      cells.push([data[index]!, data[index + 1]!, data[index + 2]!]);
    }
    if (!cells.length) return null;
    tone = logoScrimToneForCells(cells);
    worstCell = cells.reduce((worst, cell) =>
      logoWeakestContrast(cell[0], cell[1], cell[2]) < logoWeakestContrast(worst[0], worst[1], worst[2]) ? cell : worst
    );
  } catch {
    // A sampling failure must never cost us the creative; fall back to the bare logo.
    return null;
  }
  if (!tone || !worstCell) return null;

  const opacity = logoScrimOpacity(worstCell[0], worstCell[1], worstCell[2]);
  // Hold full strength across the wordmark itself, then fall to nothing by the edge of the patch,
  // so the scrim never ends on a visible boundary.
  const svg = `<svg width="${scrimWidth}" height="${scrimHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="72%">
        <stop offset="0%" stop-color="rgb(255,255,255)" stop-opacity="${opacity.toFixed(3)}"/>
        <stop offset="45%" stop-color="rgb(255,255,255)" stop-opacity="${opacity.toFixed(3)}"/>
        <stop offset="100%" stop-color="rgb(255,255,255)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${scrimWidth}" height="${scrimHeight}" fill="url(#g)"/>
  </svg>`;
  return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), left: scrimLeft, top: scrimTop };
}

async function addOfficialLogo(
  generatedImagePath: string,
  logoPath: string,
  logoPlacement: string | undefined,
  outputPath: string
): Promise<string> {
  const baseImage = sharp(generatedImagePath);
  const baseMetadata = await baseImage.metadata();

  const imageWidth = baseMetadata.width || 1024;
  const imageHeight = baseMetadata.height || 1024;

  // Match the reference branding: a clearly visible wordmark occupying 20%
  // of the canvas width, with transparent SVG whitespace removed first.
  const logoWidth = Math.max(
    144,
    Math.round(imageWidth * CREATIVE_LOGO_WIDTH_RATIO)
  );

  const logoBuffer = await sharp(logoPath, {
    density: 300,
  })
    .trim()
    .resize({ width: logoWidth })
    .png()
    .toBuffer();

  const logoMetadata = await sharp(
    logoBuffer
  ).metadata();

  const logoHeight = logoMetadata.height || logoWidth;

  // Same margin as the typography column so the logo and headline share one left/right edge
  const margin = Math.max(
    24,
    Math.round(imageWidth * CREATIVE_MARGIN_RATIO)
  );

  const position = resolveLogoPosition(logoPlacement);

  // Clamp to image bounds
  const left = Math.max(
    0,
    Math.min(
      position === "top-left"
        ? margin
        : imageWidth - logoWidth - margin,
      imageWidth - logoWidth
    )
  );
  const top = Math.max(
    0,
    Math.min(margin, imageHeight - logoHeight)
  );

  const scrim = await logoScrim(generatedImagePath, left, top, logoWidth, logoHeight, imageWidth, imageHeight);

  await baseImage
    .composite([
      ...(scrim ? [{ input: scrim.buffer, left: scrim.left, top: scrim.top }] : []),
      {
        input: logoBuffer,
        left,
        top,
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(
    `🏷️  Official logo overlaid at ${position} (left=${left}, top=${top}, width=${logoWidth})`
  );

  return outputPath;
}

async function addCTAButton(
  imagePath: string,
  ctaUrl: string,
  outputPath: string
): Promise<string> {
  const baseImage = sharp(imagePath);
  const baseMetadata = await baseImage.metadata();

  const imageWidth = baseMetadata.width || 1024;
  const imageHeight = baseMetadata.height || 1024;

  const websiteCta = buildWebsiteCta(imageWidth, imageHeight, ctaUrl);

  await baseImage
    .composite([websiteCta])
    .png()
    .toFile(outputPath);

  console.log(
    `🔗 CTA button overlaid: "${ctaUrl}" at bottom center (${websiteCta.width}x${websiteCta.height})`
  );

  return outputPath;
}

export function buildWebsiteCta(
  imageWidth: number,
  imageHeight: number,
  ctaUrl = "www.greatflowers.net"
): { input: Buffer; left: number; top: number; width: number; height: number } {
  // Reference-matched website pill: compact width, generous horizontal
  // padding, dark GreatFlowers purple, and high-contrast white text.
  const width = Math.round(imageWidth * 0.42);
  const height = Math.round(imageHeight * 0.066);
  const fontSize = Math.round(imageWidth * 0.03);
  const borderRadius = Math.round(height * 0.5);
  const margin = Math.max(24, Math.round(imageHeight * 0.035));
  const left = Math.round((imageWidth - width) / 2);
  const top = imageHeight - height - margin;
  const escapedUrl = ctaUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const input = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="1"
        y="1"
        width="${width - 2}"
        height="${height - 2}"
        rx="${borderRadius}"
        ry="${borderRadius}"
        fill="${CREATIVE_CTA_PURPLE}"
        stroke="#ffffff"
        stroke-width="2"
      />
      <text
        x="50%"
        y="67%"
        text-anchor="middle"
        fill="white"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
      >${escapedUrl}</text>
    </svg>
  `);

  return { input, left, top, width, height };
}

export async function generateCreativeVariant(
  variant: CreativeVariant,
  productImageUrl: string,
  creativeBrief: CreativeBrief,
  signal?: AbortSignal
): Promise<CreativeResult> {
  const tempFiles = new Set<string>();
  try {
    const { logoPosition, textSide, textVertical } = layoutForCreativeVariant(variant);

    // Validate all deterministic typography before starting the slow image-generation step.
    buildCreativeTextOverlay(variant, textSide, 1024, 1024, textVertical);

    await mkdir(OUTPUT_DIR, { recursive: true });

    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);

    const productImageExt = productImageUrl
      .split(".")
      .pop() || "webp";

    const productImagePath = await downloadToTemp(
      productImageUrl,
      `product-${uuid}.${productImageExt}`
    );
    tempFiles.add(productImagePath);

    const logoPath = await downloadToTemp(
      GREATFLOWERS_LOGO_URL,
      `logo-${uuid}.svg`
    );
    tempFiles.add(logoPath);

    const outputFilename = `${variant.creativeType}-${timestamp}-${uuid}.png`;

    const prompt = buildCodexPrompt(
      variant,
      creativeBrief
    );

    // Step 1: Codex generates the creative (no logo)
    // Every independent role currently receives the catalog reference so the
    // bouquet cannot drift. Art direction, camera behavior and scale create
    // variety without inventing a different sellable product.
    const generationReference = shouldUseProductReference(variant) ? productImagePath : null;
    const generatedPath = await executeCodex(
      prompt,
      generationReference,
      outputFilename,
      signal
    );
    tempFiles.add(generatedPath);

    // Step 2: Typeset exact approved copy with purpose-specific typography.
    const textOutputPath = join(OUTPUT_DIR, `text-${outputFilename}`);
    tempFiles.add(textOutputPath);
    await addCreativeText(generatedPath, textOutputPath, variant, textSide, textVertical);

    // Step 3: Programmatically overlay the official GreatFlowers logo
    console.log(`🎨 Adding GreatFlowers logo to ${variant.creativeType}...`);
    const logoOutputPath = join(OUTPUT_DIR, `logo-${outputFilename}`);
    tempFiles.add(logoOutputPath);
    await addOfficialLogo(
      textOutputPath,
      logoPath,
      logoPosition,
      logoOutputPath
    );
    console.log(`✅ Logo added to ${variant.creativeType}`);

    // Step 4: Keep most feed creatives editorial. Only the final option carries
    // the website pill; every post still receives its CTA in the caption.
    let finalPath = logoOutputPath;
    if (shouldShowWebsiteCta(variant)) {
      console.log(`🔗 Adding CTA button to ${variant.creativeType}...`);
      finalPath = join(OUTPUT_DIR, outputFilename);
      tempFiles.add(finalPath);
      await addCTAButton(
        logoOutputPath,
        "www.greatflowers.net",
        finalPath
      );
      console.log(`✅ CTA button added to ${variant.creativeType}`);
    }

    // Step 5: Upload the final composed image to S3
    console.log(`📤 Uploading ${variant.creativeType} to S3...`);
    const s3Url = await uploadToS3(finalPath, outputFilename);
    console.log(`✅ Uploaded to: ${s3Url}`);

    return {
      variantOrder: variant.order,
      type: variant.creativeType,
      localPath: s3Url, // Now contains S3 URL instead of local path
      headline: variant.headline,
      subheadline: variant.subheadline,
      cta: variant.cta,
      artDirection: variant.artDirection ?? fallbackArtDirection(variant.sceneStrategy),
      copyLayout: variant.copyLayout ?? fallbackCopyLayout(variant.order),
      environment: variant.environment ?? fallbackEnvironment(variant.order),
      lightingSetup: variant.lightingSetup ?? fallbackLightingSetup(variant.order),
      success: true,
    };
  } catch (error) {
    console.error(
      `❌ Failed to generate ${variant.creativeType} variant:`,
      error
    );

    return {
      variantOrder: variant.order,
      type: variant.creativeType,
      localPath: "",
      headline: variant.headline,
      subheadline: variant.subheadline,
      cta: variant.cta,
      artDirection: variant.artDirection ?? fallbackArtDirection(variant.sceneStrategy),
      copyLayout: variant.copyLayout ?? fallbackCopyLayout(variant.order),
      environment: variant.environment ?? fallbackEnvironment(variant.order),
      lightingSetup: variant.lightingSetup ?? fallbackLightingSetup(variant.order),
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    for (const tempFile of tempFiles) {
      try {
        await unlink(tempFile);
        console.log(`🗑️  Cleaned up: ${tempFile}`);
      } catch {
        // The file may not have been created yet or may already be gone.
      }
    }
  }
}

export async function generateAllCreatives(
  productImageUrl: string,
  creativeBrief: CreativeBrief,
  onProgress?: (result: CreativeResult, index: number, total: number) => void,
  signal?: AbortSignal
): Promise<CreativeResult[]> {
  console.log(
    `\n🎨 Starting AI creative generation (${creativeBrief.variants.length} variants)...`
  );
  console.log(
    `📸 Product image: ${productImageUrl}`
  );
  console.log(
    `🎯 Creative goal: ${creativeBrief.creativeGoal}`
  );

  const results: CreativeResult[] = [];
  const total = creativeBrief.variants.length;

  for (let i = 0; i < creativeBrief.variants.length; i++) {
    const variant = creativeBrief.variants[i]!;

    if (signal?.aborted) {
      console.log("⛔ Client disconnected — skipping remaining creatives");
      break;
    }

    console.log(
      `\n🔄 Generating ${variant.creativeType} variant...`
    );

    const result = await generateCreativeVariant(
      variant,
      productImageUrl,
      creativeBrief,
      signal
    );

    results.push(result);

    if (result.success) {
      console.log(
        `✅ ${variant.creativeType}: ${result.localPath}`
      );
    } else {
      console.log(
        `❌ ${variant.creativeType}: ${result.error}`
      );
    }

    // Emit progress event
    if (onProgress) {
      onProgress(result, i + 1, total);
    }
  }

  const successCount = results.filter(
    (r) => r.success
  ).length;

  console.log(
    `\n🎨 Creative generation complete: ${successCount}/${results.length} succeeded\n`
  );

  return results;
}
