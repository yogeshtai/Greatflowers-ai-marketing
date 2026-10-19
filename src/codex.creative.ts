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
import { addCreativeText, buildCreativeTextOverlay, type CreativeTextSide, type CreativeTextVertical } from "./creative.text.js";

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
  success: boolean;
  error?: string;
}

export function shouldUseProductReference(
  variant: Pick<CreativeVariant, "productRole">
): boolean {
  return variant.productRole === "hero" || variant.productRole === "supporting";
}

export function layoutForCreativeVariant(
  variant: Pick<CreativeVariant, "order" | "contentPoints">
): { logoPosition: "top-left" | "top-right"; textSide: CreativeTextSide; textVertical: CreativeTextVertical } {
  const even = variant.order % 2 === 0;
  const hasContentPoints = Boolean(variant.contentPoints?.length);
  const textVertical: CreativeTextVertical = hasContentPoints || variant.order === 1 || variant.order === 4
    ? "top"
    : "lower";
  return {
    logoPosition: even ? "top-left" : "top-right",
    textSide: even ? "right" : "left",
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

export const CREATIVE_LOGO_WIDTH_RATIO = 0.2;
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
Do not copy or imply the identity of the supplied catalog product.
Natural, concept-relevant flowers are nevertheless REQUIRED and must occupy a meaningful
part of the composition (roughly 20-35% of the frame). They need not dominate, but they must
be immediately visible as the subject that connects this creative to GreatFlowers.`;
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
  const hasContentPoints = (variant.contentPoints?.length || 0) > 0;
  const showWebsiteCta = shouldShowWebsiteCta(variant);
  const typographySafeArea = hasContentPoints
    ? `outer ${textSide} 46% of the upper 82%`
    : textVertical === "lower"
      ? `outer ${textSide} 42% of the lower-middle band, from about 48% to 82% of the image height`
      : `outer ${textSide} 42% of the upper half`;
  const otherDirections = creativeBrief.variants
    .filter((candidate) => candidate.order !== variant.order)
    .map((candidate) => `- Variant ${candidate.order}: ${candidate.creativeType}; ${candidate.sceneStrategy}; ${candidate.compositionStyle}; ${candidate.sceneType}`)
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

FLOWER COMMERCE RELEVANCE (CRITICAL):
This is a GreatFlowers marketing creative. Flowers must be immediately visible and relevant
to the idea, even when the exact catalog product is not used. The image should make someone
interested in choosing, sending, arranging or displaying flowers. Furniture, books, cups,
feathers, candles and other props may establish context, but must never become the primary
subject or visually replace the flowers. For human scenes, show an active flower-related
moment such as giving, receiving, arranging, carrying, delivering or unboxing.

LOGO SAFE AREA (CRITICAL):
Reserve a clear zone at:
${logoPosition}

This area MUST remain free of faces, flowers, important objects and decorative details.
The official GreatFlowers logo will be overlaid here after generation.
Do not generate, spell, draw, or recreate GreatFlowers branding.

TYPOGRAPHY SAFE AREA (CRITICAL):
Reserve the ${typographySafeArea} as calm, light-toned photographic negative space.
Keep faces, flowers and important objects out of that zone, but continue natural scene texture and light through it.
Keep this area tonally consistent enough for large, high-contrast editorial typography; avoid mottled highlights and deep shadows behind the copy.
Do not create a white rectangle, translucent card, blank paper panel or fake text box.
The application will typeset the approved headline, subheadline${hasContentPoints ? " and numbered content points" : ""} in this zone after generation.
${hasContentPoints ? "Do not draw empty circles, unlabeled icons, arrows, process diagrams or step placeholders." : ""}

${showWebsiteCta ? `WEBSITE CTA SAFE AREA:
Keep the lower-center 12% clear of faces, flowers and important objects for the website pill added later.` : `NO WEBSITE PILL:
Use the lower portion of the frame naturally. No button or URL will be added to this variant.`}

CAMPAIGN BACKGROUND DIRECTION (reinterpret it for this variant; do not repeat another variant's room, surface or framing):
${creativeBrief.backgroundDirection}

MOOD:
${creativeBrief.mood}

VISUAL DIRECTION FOR THIS VARIANT:
${variant.visualDirection}

COLOR PALETTE:
${variant.colorPalette}

COMPOSITION STYLE:
${variant.compositionStyle}

LIGHTING STYLE:
${variant.lightingStyle}

SCENE TYPE:
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

  // Comfortable margin from edges: ~4% of image size
  const margin = Math.max(
    24,
    Math.round(imageWidth * 0.04)
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

  await baseImage
    .composite([
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
    // Hero and supporting concepts use the catalog image so product-linked
    // messaging cannot drift into a generic or invented bouquet. Optional and
    // product-free concepts remain unconstrained for genuine campaign variety.
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
