import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

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

    const codex = spawn("codex", args, {
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

    return {
      type: variant.type,
      localPath,
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
  creativeBrief: CreativeBrief
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

  for (const variant of creativeBrief.variants) {
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
  }

  const successCount = results.filter(
    (r) => r.success
  ).length;

  console.log(
    `\n🎨 Creative generation complete: ${successCount}/3 succeeded\n`
  );

  return results;
}
