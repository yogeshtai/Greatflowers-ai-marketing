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
import { storyCreativePlanSchema, type StoryCreativePlan, type StoryCreativeSlide as StorySlide } from "./strategy.schema.js";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CODEX_GENERATED_IMAGES_DIR =
  "/home/ubuntu/.codex/generated_images";

const OUTPUT_DIR = join(process.cwd(), "test-creatives");

async function getCodexGeneratedImages(): Promise<string[]> {
  const images: string[] = [];

  if (!existsSync(CODEX_GENERATED_IMAGES_DIR)) {
    return images;
  }

  const sessionFolders = await readdir(CODEX_GENERATED_IMAGES_DIR);

  for (const sessionFolder of sessionFolders) {
    const sessionPath = join(CODEX_GENERATED_IMAGES_DIR, sessionFolder);

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
  brandRole: string;
  sceneChange: string;
  cameraDirection: string;
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
  logoUrl: string,
  subtle = false
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

  const logoSize = Math.floor(imageWidth * (subtle ? 0.08 : 0.15));

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

export function buildStorySlidePrompt(
  slide: StorySlide,
  creativeBrief: CreativeBrief,
  storyPlan: StoryCreativePlan,
  previousSlides: GeneratedSlide[]
): string {
  const preReveal = slide.order < storyPlan.revealSlide;
  let continuityInstructions = "";

  if (storyPlan.visualContinuity) {
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
Do NOT include the selected catalog product in this image.
This slide focuses on the emotional context or situation.
Flowers may appear generically if the story requires, but not the specific catalog product.`;
      break;
  }

  if (preReveal) {
    sceneStrategyInstructions = "STORY SCENE: Show only the human situation and this new story beat. No flowers, product, shopping screen or commercial solution cues.";
    productInstructions = "PRODUCT ROLE: NONE. No product reference is supplied. Do not introduce the product or flowers.";
  }
  let contextInstructions = "";

  if (slide.occasionContext) {
    contextInstructions += `\nOCCASION CONTEXT: ${slide.occasionContext}`;
  }

  if (slide.locationContext) {
    contextInstructions += `\nLOCATION CONTEXT: ${slide.locationContext}`;
  }

  return `Create a 1:1 cinematic visual story scene.

${continuityInstructions}
⚠️ STORY PROGRESSION REQUIREMENT ⚠️

This is Slide ${slide.order} of 4 in a connected visual story.

Story Role: ${slide.storyRole}
Story Beat: ${slide.storyBeat}
Reveal Slide: ${storyPlan.revealSlide}
Scene Change: ${slide.sceneChange}
Camera Direction: ${slide.cameraDirection}
Previous moment: ${previousSlides.at(-1)?.storyBeat || "Opening shot"}
Preserve story/character/style continuity, but DO NOT reproduce the previous slide's composition.
This is a new shot and a new story moment.
Use previous images ONLY for continuity of character/style/environment where requested.
Do NOT copy their composition, pose, product placement, camera angle, scene arrangement, text or branding.
${preReveal ? "PRE-REVEAL: Pure storytelling. No flowers, selected product, product names, GreatFlowers, logos, website, CTA, sales language or ecommerce/browser screenshots." : "Introduce the solution as the answer to the setup; after reveal emphasize its emotional consequence."}

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
${preReveal ? slide.visualDirection : creativeBrief.backgroundDirection}

TEXT OVERLAY:

Headline: "${slide.headline}"
${slide.subheadline ? `Subheadline: "${slide.subheadline}"` : ""}

${creativeBrief.textPlacement}

BRAND ROLE: ${slide.brandRole}
${slide.brandRole === "none"
  ? "No logo, website, brand name, CTA or button-like branding. Do not reserve a logo area."
  : slide.brandRole === "subtle"
    ? "Minimal logo only, composited separately at the top-right corner. Keep the top-right corner clear of text, faces and important details. No website, CTA or button."
    : "Approved branding may appear. Logo is composited separately at the top-right corner; keep that corner clear of text, faces and important details. CTA remains caption/metadata, not an image button."}
Never recreate a logo with AI.

Generate a premium 1:1 (1024x1024) social media creative that tells this specific moment in the story while maintaining visual continuity with the overall narrative.`;
}

async function executeCodex(
  prompt: string,
  referenceImagePaths: string[],
  outputFilename: string
): Promise<string> {
  // Take a snapshot of all Codex images BEFORE starting this generation
  const beforeImages = new Set(
    await getCodexGeneratedImages()
  );

  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      ...referenceImagePaths.flatMap((p) => ["-i", p]),
      "--ephemeral",
      "--cd",
      OUTPUT_DIR,
      `${prompt}\n\nFilename: ${outputFilename}`,
    ];

    const codexBinary = resolveCodexBinary();
    const codex = spawn(codexBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

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
        if (code !== 0) {
          reject(
            new Error(
              `Codex failed with exit code ${code}: ${stderr}`
            )
          );
          return;
        }

        // Find images created by this Codex execution
        const afterImages = await getCodexGeneratedImages();
        const newImages = afterImages.filter(
          (imagePath) => !beforeImages.has(imagePath)
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
            return { path: imagePath, modifiedAt: fileStats.mtimeMs };
          })
        );

        imagesWithStats.sort((a, b) => b.modifiedAt - a.modifiedAt);

        const newestImage = imagesWithStats[0];
        if (!newestImage) {
          reject(
            new Error(
              "Codex completed but no generated image metadata was available"
            )
          );
          return;
        }

        resolve(newestImage.path);
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });

    codex.on("error", (error) => {
      reject(
        new Error(`Failed to spawn codex: ${error.message}`)
      );
    });
  });
}

// Keep catalog/brand cues out of references as well as out of the prompt.
export function storyReferencePolicy(slide: StorySlide, previousSlides: GeneratedSlide[]) {
  return {
    useProduct: slide.productRole !== "none",
    compositeLogo: slide.brandRole !== "none",
    previousSlide: [...previousSlides].reverse().find(previous =>
      previous.success && previous.imageUrl &&
      (slide.productRole !== "none" || previous.productRole === "none") &&
      (slide.brandRole !== "none" || previous.brandRole === "none")),
  };
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

  try {
    onProgress?.(`[Slide ${slide.order}] Generating ${slide.storyRole}...`);

    const prompt = buildStorySlidePrompt(slide, creativeBrief, storyPlan, previousSlides);

    const referenceImages: string[] = [];
    const referencePolicy = storyReferencePolicy(slide, previousSlides);

    // Download product image if needed
    if (referencePolicy.useProduct && productImageUrl) {
      const productPath = join(tempDir, `product-${sessionId}.png`);
      await downloadAsset(productImageUrl, productPath);
      referenceImages.push(productPath);
    }

    // Use previous slide as visual reference if continuity is needed
    if (previousSlides.length > 0 && storyPlan.visualContinuity) {
      const mostRecentSlide = referencePolicy.previousSlide;
      if (mostRecentSlide && mostRecentSlide.success && mostRecentSlide.imageUrl) {
        const prevSlidePath = join(tempDir, `prev-slide-${sessionId}.png`);
        await downloadAsset(mostRecentSlide.imageUrl, prevSlidePath);
        referenceImages.push(prevSlidePath);
      }
    }

    onProgress?.(`[Slide ${slide.order}] Executing Codex...`);

    await mkdir(OUTPUT_DIR, { recursive: true });

    const outputFilename = `story-slide-${slide.order}-${sessionId}.png`;

    // Codex generates the slide image; returns path of the generated file
    const generatedPath = await executeCodex(
      prompt,
      referenceImages,
      outputFilename
    );

    if (referencePolicy.compositeLogo) {
      onProgress?.(`[Slide ${slide.order}] Compositing logo...`);
      await compositeLogoOnImage(generatedPath,
        "https://greatflowers.net/assets/svg/greatflowers-logo.svg", slide.brandRole === "subtle");
    }

    onProgress?.(`[Slide ${slide.order}] Uploading to S3...`);

    const imageUrl = await uploadToS3(generatedPath);

    // Cleanup temp files
    try {
      await unlink(generatedPath);
    } catch {
      // Ignore cleanup errors
    }
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
      brandRole: slide.brandRole,
      sceneChange: slide.sceneChange,
      cameraDirection: slide.cameraDirection,
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
      brandRole: slide.brandRole,
      sceneChange: slide.sceneChange,
      cameraDirection: slide.cameraDirection,
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
  storyPlan = storyCreativePlanSchema.parse(storyPlan);
  // Apply the final-image requirement to older saved plans as well.
  storyPlan = { ...storyPlan, slides: storyPlan.slides.map(slide => slide.order === 4
    ? { ...slide, brandRole: "reveal", cta: "Shop flowers — https://greatflowers.net" }
    : slide) };
  const report = `revealSlide: ${storyPlan.revealSlide}\n` +
    [...storyPlan.slides].sort((a, b) => a.order - b.order).map(slide =>
      `Slide ${slide.order}:\nstoryRole: ${slide.storyRole}\nstoryBeat: ${slide.storyBeat}\nproductRole: ${slide.productRole}\nbrandRole: ${slide.brandRole}\nsceneChange: ${slide.sceneChange}\ncameraDirection: ${slide.cameraDirection}`
    ).join("\n\n");
  console.log(report);
  onProgress?.(report);
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
