import { spawn } from "node:child_process";
import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import fetch from "node-fetch";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  type: "emotional" | "product-focused" | "premium-minimal";
  headline: string;
  subheadline: string;
  cta: string;
  visualDirection: string;
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
  type: string;
  localPath: string;
  headline: string;
  subheadline: string;
  cta: string;
  success: boolean;
  error?: string;
}

const GREATFLOWERS_LOGO_URL =
  "https://greatflowers.net/assets/svg/greatflowers-logo.svg";

const OUTPUT_DIR = join(process.cwd(), "test-creatives");

async function downloadToTemp(
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

function buildCodexPrompt(
  variant: CreativeVariant,
  creativeBrief: CreativeBrief
): string {
  return `Use the supplied flower product image as reference. Create a new 1:1 premium social media campaign creative for GreatFlowers.

CRITICAL PRODUCT ACCURACY REQUIREMENT:
${creativeBrief.productTreatment}

Use the second image (GreatFlowers logo SVG) as the official brand logo. Do not generate, spell, or recreate the logo. Use it as-is.

BACKGROUND & ENVIRONMENT:
${creativeBrief.backgroundDirection}

MOOD:
${creativeBrief.mood}

VISUAL DIRECTION FOR THIS VARIANT:
${variant.visualDirection}

TEXT OVERLAY (verbatim):
Headline: "${variant.headline}"
Subheadline: "${variant.subheadline}"
CTA: "${variant.cta}"

IMPORTANT IMAGE CONTENT RULES:
- Do not render buttons, CTA buttons, links, website URLs, or clickable-looking UI elements inside the image.
- The CTA will be added separately to the social media post.
- Keep the creative visually clean and editorial.
- Text may include only the campaign headline and a short supporting line when appropriate.
- Do not put CTA text such as "Shop Now", "Send Flowers", "Buy Now", "View Flowers", or similar action phrases inside the image.

LOGO PLACEMENT:
${creativeBrief.logoPlacement}

TEXT PLACEMENT:
${creativeBrief.textPlacement}

CREATIVE GOAL:
${creativeBrief.creativeGoal}

CONSTRAINTS:
- Preserve the actual bouquet, flower colors, arrangement, and vase faithfully
- Do not redesign or replace the product
- Use exact text as provided (verbatim)
- Keep the GreatFlowers logo unchanged
- Create a clean, professional social media image
- No watermarks
- Output format: PNG
- Aspect ratio: 1:1 (square)

Save the generated image inside ./test-creatives/ with the filename provided in the next instruction.

Use image generation. Do not create SVG, HTML, or CSS.`;
}

async function executeCodex(
  prompt: string,
  productImagePath: string,
  logoPath: string,
  outputFilename: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      "-i",
      productImagePath,
      "-i",
      logoPath,
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

    codex.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Codex failed with exit code ${code}: ${stderr}`
          )
        );
        return;
      }

      const outputPath = join(
        OUTPUT_DIR,
        outputFilename
      );

      console.log(
        `✅ Codex completed: ${outputFilename}`
      );

      resolve(outputPath);
    });

    codex.on("error", (error) => {
      reject(
        new Error(`Failed to spawn codex: ${error.message}`)
      );
    });
  });
}

async function generateCreativeVariant(
  variant: CreativeVariant,
  productImageUrl: string,
  creativeBrief: CreativeBrief
): Promise<CreativeResult> {
  try {
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

    const logoPath = await downloadToTemp(
      GREATFLOWERS_LOGO_URL,
      `logo-${uuid}.svg`
    );

    const outputFilename = `${variant.type}-${timestamp}-${uuid}.png`;

    const prompt = buildCodexPrompt(
      variant,
      creativeBrief
    );

    const localPath = await executeCodex(
      prompt,
      productImagePath,
      logoPath,
      outputFilename
    );

    // Upload to S3
    console.log(`📤 Uploading ${variant.type} to S3...`);
    const s3Url = await uploadToS3(localPath, outputFilename);
    console.log(`✅ Uploaded to: ${s3Url}`);

    // Clean up local file
    try {
      await unlink(localPath);
      console.log(`🗑️  Cleaned up local file: ${localPath}`);
    } catch (cleanupError) {
      console.warn(`⚠️  Could not delete local file: ${localPath}`);
    }

    return {
      type: variant.type,
      localPath: s3Url, // Now contains S3 URL instead of local path
      headline: variant.headline,
      subheadline: variant.subheadline,
      cta: variant.cta,
      success: true,
    };
  } catch (error) {
    console.error(
      `❌ Failed to generate ${variant.type} variant:`,
      error
    );

    return {
      type: variant.type,
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
  }
}

export async function generateAllCreatives(
  productImageUrl: string,
  creativeBrief: CreativeBrief,
  onProgress?: (result: CreativeResult, index: number, total: number) => void
): Promise<CreativeResult[]> {
  console.log(
    "\n🎨 Starting AI creative generation (3 variants)..."
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
    
    console.log(
      `\n🔄 Generating ${variant.type} variant...`
    );

    const result = await generateCreativeVariant(
      variant,
      productImageUrl,
      creativeBrief
    );

    results.push(result);

    if (result.success) {
      console.log(
        `✅ ${variant.type}: ${result.localPath}`
      );
    } else {
      console.log(
        `❌ ${variant.type}: ${result.error}`
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
    `\n🎨 Creative generation complete: ${successCount}/3 succeeded\n`
  );

  return results;
}
