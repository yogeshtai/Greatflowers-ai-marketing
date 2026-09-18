import { spawn } from "node:child_process";
import {
  writeFile,
  mkdir,
  readFile,
  unlink,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import fetch from "node-fetch";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

interface StorySlide {
  order: number;
  storyRole: string;
  storyBeat: string;
  creativeType: string;
  sceneStrategy: string;
  concept: string;
  headline: string;
  subheadline: string;
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

interface VisualContinuity {
  characterContinuity?: string;
  environmentContinuity?: string;
  colorContinuity?: string;
  stylingContinuity?: string;
}

interface StoryCreativePlan {
  carouselConcept: string;
  visualContinuity?: VisualContinuity;
  slides: StorySlide[];
}

interface CreativeBrief {
  headline: string;
  subheadline: string;
  cta: string;
  mood: string;
  backgroundDirection: string;
  productTreatment: string;
  logoPlacement: string;
  textPlacement: string;
}

interface GeneratedSlide {
  order: number;
  storyRole: string;
  storyBeat: string;
  imageUrl: string;
  headline: string;
  subheadline: string;
  cta: string;
  creativeType: string;
  sceneStrategy: string;
  productRole: string;
  success: boolean;
  error?: string;
  continuityNotes?: string;
}

interface StoryCreativeResult {
  storyConcept: string;
  slides: GeneratedSlide[];
  success: boolean;
  error?: string;
}

function resolveCodexBinary(): string {
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

  return "codex";
}

async function downloadAsset(url: string, tempPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download asset: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await writeFile(tempPath, Buffer.from(buffer));
}

async function uploadToS3(localPath: string): Promise<string> {
  const buffer = await readFile(localPath);
  const filename = `${randomUUID()}.png`;
  const key = `${PREFIX}/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    })
  );

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

async function compositeLogoOnImage(
  imagePath: string,
  logoUrl: string
): Promise<void> {
  const logoResponse = await fetch(logoUrl);
  if (!logoResponse.ok) {
    console.warn("Could not download logo for compositing");
    return;
  }

  const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const imageWidth = metadata.width || 1024;
  const imageHeight = metadata.height || 1024;

  const logoSize = Math.floor(imageWidth * 0.15);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoSize, logoSize, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();

  const logoMetadata = await sharp(resizedLogo).metadata();
  const logoWidth = logoMetadata.width || logoSize;
  const logoHeight = logoMetadata.height || logoSize;

  const margin = Math.floor(imageWidth * 0.03);
  const left = imageWidth - logoWidth - margin;
  const top = margin;

  await image
    .composite([
      {
        input: resizedLogo,
        top,
        left,
      },
    ])
    .toFile(imagePath + ".composite.png");

  await unlink(imagePath);
  await writeFile(imagePath, await readFile(imagePath + ".composite.png"));
  await unlink(imagePath + ".composite.png");
}

function buildStorySlidePrompt(
  slide: StorySlide,
  creativeBrief: CreativeBrief,
  storyPlan: StoryCreativePlan,
  previousSlides: GeneratedSlide[]
): string {
  let continuityInstructions = "";

  if (storyPlan.visualContinuity && previousSlides.length > 0) {
    continuityInstructions = `\n⚠️ VISUAL CONTINUITY REQUIREMENTS ⚠️\n\n`;
    continuityInstructions += `This is slide ${slide.order} of a 4-slide visual story.\n\n`;
    continuityInstructions += `Story Concept: ${storyPlan.carouselConcept}\n\n`;

    if (storyPlan.visualContinuity.characterContinuity) {
      continuityInstructions += `Character Continuity: ${storyPlan.visualContinuity.characterContinuity}\n`;
    }
    if (storyPlan.visualContinuity.environmentContinuity) {
      continuityInstructions += `Environment Continuity: ${storyPlan.visualContinuity.environmentContinuity}\n`;
    }
    if (storyPlan.visualContinuity.colorContinuity) {
      continuityInstructions += `Color Continuity: ${storyPlan.visualContinuity.colorContinuity}\n`;
    }
    if (storyPlan.visualContinuity.stylingContinuity) {
      continuityInstructions += `Styling Continuity: ${storyPlan.visualContinuity.stylingContinuity}\n`;
    }

    continuityInstructions += `\nMaintain the requested continuity with previous slides, but depict the NEW story beat, action and composition described for THIS slide.\n\n`;
  }

  let sceneStrategyInstructions = "";

  switch (slide.sceneStrategy) {
    case "PRODUCT_STUDIO":
      sceneStrategyInstructions = `SCENE STRATEGY: PRODUCT_STUDIO (Commercial Product Photography)
The product is the main visual subject in a clean, professional presentation.
Use premium product photography lighting and composition.
Background should be simple and elegant, allowing the product to be the hero.`;
      break;

    case "HUMAN_GIFTING_MOMENT":
      sceneStrategyInstructions = `SCENE STRATEGY: HUMAN_GIFTING_MOMENT
Show a genuine human moment of giving or receiving flowers.
Capture authentic emotion and connection between people.
The flowers are part of a meaningful gesture.`;
      break;

    case "HUMAN_LIFESTYLE":
      sceneStrategyInstructions = `SCENE STRATEGY: HUMAN_LIFESTYLE
Show flowers integrated into real life moments and environments.
Focus on the emotional context and lifestyle setting.
People and their experiences are central to the composition.`;
      break;

    case "OCCASION_SCENE":
      sceneStrategyInstructions = `SCENE STRATEGY: OCCASION_SCENE
Depict the specific occasion or celebration context.
Show how flowers enhance and elevate the moment.
Capture the atmosphere and emotion of the occasion.`;
      break;

    case "EDITORIAL_CONTENT":
      sceneStrategyInstructions = `SCENE STRATEGY: EDITORIAL_CONTENT
Create a premium editorial-style composition.
Use sophisticated styling, lighting and composition.
This should feel like magazine-quality content.`;
      break;

    case "INFORMATIONAL_GRAPHIC":
      sceneStrategyInstructions = `SCENE STRATEGY: INFORMATIONAL_GRAPHIC
Present information or education about flowers/gifting.
Use clear visual communication and design principles.
Balance aesthetics with informational clarity.`;
      break;

    case "LOCATION_STORY":
      sceneStrategyInstructions = `SCENE STRATEGY: LOCATION_STORY
Tell a story through a specific location or setting.
The environment is a key character in the narrative.
Show how flowers connect to this place.`;
      break;

    case "FEATURE_DEMO":
      sceneStrategyInstructions = `SCENE STRATEGY: FEATURE_DEMO
Demonstrate a specific feature or service benefit.
Make the feature visually clear and compelling.
Show the practical value in action.`;
      break;

    case "BRAND_STORY":
      sceneStrategyInstructions = `SCENE STRATEGY: BRAND_STORY
Communicate broader brand values and identity.
Focus on the overall GreatFlowers experience.
The specific product may be less prominent.`;
      break;
  }

  let productInstructions = "";

  switch (slide.productRole) {
    case "hero":
      productInstructions = `\nPRODUCT ROLE: HERO
The catalog product image is the main visual focus.
Preserve the bouquet, flower colors, arrangement, container and product details faithfully.
Do not redesign or replace the product.
${creativeBrief.productTreatment}`;
      break;

    case "supporting":
      productInstructions = `\nPRODUCT ROLE: SUPPORTING
Integrate the catalog product naturally into the scene.
The product is visible and important but shares focus with other elements.
Preserve the product's appearance faithfully.`;
      break;

    case "optional":
      productInstructions = `\nPRODUCT ROLE: OPTIONAL
Include the product only when it naturally fits the scene.
The product may be subtle or in the background.
Focus on the overall story and moment.`;
      break;

    case "none":
      productInstructions = `\nPRODUCT ROLE: NONE
Do not force the catalog product into this image.
This slide focuses on the emotional context or situation.
Flowers may appear generically if the story requires, but not the specific catalog product.`;
      break;
  }

  let contextInstructions = "";

  if (slide.occasionContext) {
    contextInstructions += `\nOCCASION CONTEXT: ${slide.occasionContext}`;
  }

  if (slide.locationContext) {
    contextInstructions += `\nLOCATION CONTEXT: ${slide.locationContext}`;
  }

  return `Create a 1:1 premium social media campaign creative for GreatFlowers.

${continuityInstructions}
⚠️ STORY PROGRESSION REQUIREMENT ⚠️

This is Slide ${slide.order} of 4 in a connected visual story.

Story Role: ${slide.storyRole}
Story Beat: ${slide.storyBeat}

This slide must visibly advance the narrative from previous slides.
Each slide should show a DIFFERENT moment, action, or development in the story.
Do NOT create four similar images with minor variations.

CREATIVE TYPE: ${slide.creativeType.toUpperCase()}

STRATEGIC CONCEPT:
${slide.concept}

${sceneStrategyInstructions}
${productInstructions}${contextInstructions}

VISUAL STYLE:

Color Palette: ${slide.colorPalette}
Composition Style: ${slide.compositionStyle}
Lighting Style: ${slide.lightingStyle}
Scene Type: ${slide.sceneType}

VISUAL DIRECTION:
${slide.visualDirection}

MOOD & ATMOSPHERE:
${creativeBrief.mood}

BACKGROUND & ENVIRONMENT:
${creativeBrief.backgroundDirection}

TEXT OVERLAY:

Headline: "${slide.headline}"
${slide.subheadline ? `Subheadline: "${slide.subheadline}"` : ""}

${creativeBrief.textPlacement}

Do NOT render the CTA ("${slide.cta}") as a button inside the image.
The CTA will be added as caption/metadata.

LOGO:
${creativeBrief.logoPlacement}
The GreatFlowers logo will be composited separately. Do not attempt to recreate it.

Generate a premium 1:1 (1024x1024) social media creative that tells this specific moment in the story while maintaining visual continuity with the overall narrative.`;
}

async function generateStorySlide(
  slide: StorySlide,
  creativeBrief: CreativeBrief,
  storyPlan: StoryCreativePlan,
  productImageUrl: string | null,
  previousSlides: GeneratedSlide[],
  onProgress?: (message: string) => void
): Promise<GeneratedSlide> {
  const tempDir = join(__dirname, "..", "temp");
  await mkdir(tempDir, { recursive: true });

  const sessionId = randomUUID();
  const outputPath = join(tempDir, `story-slide-${slide.order}-${sessionId}.png`);

  try {
    onProgress?.(`[Slide ${slide.order}] Generating ${slide.storyRole}...`);

    const prompt = buildStorySlidePrompt(slide, creativeBrief, storyPlan, previousSlides);

    const referenceImages: string[] = [];

    // Download product image if needed
    if (slide.productRole !== "none" && productImageUrl) {
      const productPath = join(tempDir, `product-${sessionId}.png`);
      await downloadAsset(productImageUrl, productPath);
      referenceImages.push(productPath);
    }

    // Use previous slide as visual reference if continuity is needed
    if (previousSlides.length > 0 && storyPlan.visualContinuity) {
      const mostRecentSlide = previousSlides[previousSlides.length - 1];
      if (mostRecentSlide && mostRecentSlide.success && mostRecentSlide.imageUrl) {
        const prevSlidePath = join(tempDir, `prev-slide-${sessionId}.png`);
        await downloadAsset(mostRecentSlide.imageUrl, prevSlidePath);
        referenceImages.push(prevSlidePath);
      }
    }

    // Build codex command
    const codexBinary = resolveCodexBinary();
    const args = ["generate", "--prompt", prompt, "--output", outputPath];

    // Add reference images
    for (const refImage of referenceImages) {
      args.push("--image", refImage);
    }

    onProgress?.(`[Slide ${slide.order}] Executing Codex...`);

    await new Promise<void>((resolve, reject) => {
      const codex = spawn(codexBinary, args);

      let stdout = "";
      let stderr = "";

      codex.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      codex.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      codex.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Codex failed with code ${code}: ${stderr}`));
        }
      });

      codex.on("error", (error) => {
        reject(error);
      });
    });

    if (!existsSync(outputPath)) {
      throw new Error("Codex did not generate output image");
    }

    onProgress?.(`[Slide ${slide.order}] Compositing logo...`);

    // Composite GreatFlowers logo
    await compositeLogoOnImage(
      outputPath,
      "https://greatflowers.net/assets/svg/greatflowers-logo.svg"
    );

    onProgress?.(`[Slide ${slide.order}] Uploading to S3...`);

    const imageUrl = await uploadToS3(outputPath);

    // Cleanup temp files
    await unlink(outputPath);
    for (const refImage of referenceImages) {
      try {
        await unlink(refImage);
      } catch {
        // Ignore cleanup errors
      }
    }

    let continuityNotes = "";
    if (previousSlides.length > 0 && storyPlan.visualContinuity) {
      continuityNotes = `Maintained continuity from Slide ${previousSlides.length}`;
      if (storyPlan.visualContinuity.characterContinuity) {
        continuityNotes += ` (character)`;
      }
      if (storyPlan.visualContinuity.environmentContinuity) {
        continuityNotes += ` (environment)`;
      }
      if (storyPlan.visualContinuity.colorContinuity) {
        continuityNotes += ` (color)`;
      }
    }

    onProgress?.(`[Slide ${slide.order}] ✅ Complete`);

    return {
      order: slide.order,
      storyRole: slide.storyRole,
      storyBeat: slide.storyBeat,
      imageUrl,
      headline: slide.headline,
      subheadline: slide.subheadline,
      cta: slide.cta,
      creativeType: slide.creativeType,
      sceneStrategy: slide.sceneStrategy,
      productRole: slide.productRole,
      success: true,
      continuityNotes,
    };
  } catch (error) {
    console.error(`[Slide ${slide.order}] Generation failed:`, error);

    return {
      order: slide.order,
      storyRole: slide.storyRole,
      storyBeat: slide.storyBeat,
      imageUrl: "",
      headline: slide.headline,
      subheadline: slide.subheadline,
      cta: slide.cta,
      creativeType: slide.creativeType,
      sceneStrategy: slide.sceneStrategy,
      productRole: slide.productRole,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function generateStoryCreatives(
  storyPlan: StoryCreativePlan,
  creativeBrief: CreativeBrief,
  productImageUrl: string | null,
  onProgress?: (message: string) => void,
  onSlideComplete?: (slide: GeneratedSlide, index: number, total: number) => void
): Promise<StoryCreativeResult> {
  console.log(`\n🎬 Starting Story Creative Generation`);
  console.log(`Story Concept: ${storyPlan.carouselConcept}`);
  console.log(`Slides: ${storyPlan.slides.length}\n`);

  const generatedSlides: GeneratedSlide[] = [];
  const sortedSlides = [...storyPlan.slides].sort((a, b) => a.order - b.order);
  const total = sortedSlides.length;

  // Generate slides sequentially to maintain continuity
  for (let i = 0; i < sortedSlides.length; i++) {
    const slide = sortedSlides[i]!;

    const result = await generateStorySlide(
      slide,
      creativeBrief,
      storyPlan,
      productImageUrl,
      generatedSlides,
      onProgress
    );

    generatedSlides.push(result);

    // If a slide fails, we still continue but note the failure
    if (!result.success) {
      console.error(`❌ Slide ${slide.order} failed: ${result.error}`);
    }

    // Emit true per-slide progress immediately, without waiting for
    // remaining slides to finish.
    onSlideComplete?.(result, i + 1, total);
  }

  const allSuccess = generatedSlides.every((s) => s.success);
  const failedSlides = generatedSlides.filter((s) => !s.success);

  const result: StoryCreativeResult = {
    storyConcept: storyPlan.carouselConcept,
    slides: generatedSlides,
    success: allSuccess,
  };

  if (failedSlides.length > 0) {
    result.error = `${failedSlides.length} slide(s) failed: ${failedSlides.map((s) => `Slide ${s.order}`).join(", ")}`;
  }

  return result;
}
