import sharp from "sharp";

export type CreativeTextSide = "left" | "right";
export type CreativeTextVertical = "top" | "lower";
export type CreativeTextTone = "dark" | "light";

type TypographyCreative = {
  order?: number;
  creativeType: string;
  sceneStrategy: string;
  artDirection?: string;
  headline: string;
  subheadline: string;
  cta?: string;
  contentPoints?: string[];
};

// The logo sits above the headline in the same column; these keep both layout steps in agreement.
export const CREATIVE_MARGIN_RATIO = 0.055;
export const CREATIVE_LOGO_WIDTH_RATIO = 0.24;
export const CREATIVE_LOGO_ASPECT = 98 / 246;

export const CREATIVE_TEXT_PURPLE = "#32105f";
export const CREATIVE_TEXT_PINK = "#d61572";

// Dark-tone accents must span the colour wheel the way the light-tone ones do. Four shades of one
// pink read as a single washed-out accent at headline and pill scale, which is the template look
// these palettes exist to break. Every accent here clears 4.9:1 against white in both directions,
// so it is legible as text on a light photograph and as white text on a CTA pill.
const CREATIVE_TEXT_PALETTES = [
  { primary: CREATIVE_TEXT_PURPLE, accent: CREATIVE_TEXT_PINK, secondary: "#3f3a44" },
  { primary: "#25232a", accent: "#96660f", secondary: "#4d4850" },
  { primary: "#294039", accent: "#1f6f5c", secondary: "#46534f" },
  { primary: "#3b2b2c", accent: "#a84d3c", secondary: "#554747" },
] as const;

const CREATIVE_LIGHT_TEXT_PALETTES = [
  { primary: "#ffffff", accent: "#ff7fbd", secondary: "#f7f1f5" },
  { primary: "#ffffff", accent: "#f2b56f", secondary: "#f8f3ed" },
  { primary: "#ffffff", accent: "#91d8bd", secondary: "#eff8f4" },
  { primary: "#ffffff", accent: "#ff9c88", secondary: "#fff2ef" },
] as const;

export function textPaletteForCreative(
  creative: Pick<TypographyCreative, "order">,
  tone: CreativeTextTone = "dark",
) {
  // The primary stays on the approved brand colour so every creative still reads as GreatFlowers;
  // only the accent rotates, so four creatives in one campaign stop looking like one template.
  const palettes = tone === "light" ? CREATIVE_LIGHT_TEXT_PALETTES : CREATIVE_TEXT_PALETTES;
  const base = palettes[0]!;
  const index = Math.max(0, ((creative.order ?? 1) - 1)) % palettes.length;
  return { ...base, accent: palettes[index]!.accent };
}

// CTA pills carry white text, so their fill must stay saturated: the pastel light-tone accents
// would leave the label unreadable.
export function ctaAccentForCreative(order?: number): string {
  const index = Math.max(0, ((order ?? 1) - 1)) % CREATIVE_TEXT_PALETTES.length;
  return CREATIVE_TEXT_PALETTES[index]!.accent;
}

export type CreativeTypography = {
  mode: "editorial-serif" | "modern-sans" | "documentary-grotesque";
  family: string;
  weight: number;
};

const GROTESQUE_DIRECTIONS = new Set([
  "documentary-gifting",
  "doorstep-delivery",
  "bouquet-in-motion",
  "unboxing-reveal",
  "florist-workbench",
]);
const SANS_TYPES = new Set(["informational", "feature"]);
const SANS_SCENES = new Set(["INFORMATIONAL_GRAPHIC", "FEATURE_DEMO"]);

export function typographyForCreative(
  creative: Pick<TypographyCreative, "creativeType" | "sceneStrategy" | "artDirection">
): CreativeTypography {
  // Art direction decides the voice of the type before content type does, so a documentary gifting
  // frame and a magazine product feature stop sharing one serif.
  if (creative.artDirection && GROTESQUE_DIRECTIONS.has(creative.artDirection)) {
    return {
      mode: "documentary-grotesque",
      family: "Helvetica Neue, Helvetica, Inter, Arial, Liberation Sans, sans-serif",
      weight: 700,
    };
  }
  const isStructuredGraphic = SANS_SCENES.has(creative.sceneStrategy);
  const hasExplicitEditorialDirection = creative.sceneStrategy === "EDITORIAL_CONTENT";
  if (isStructuredGraphic || (!hasExplicitEditorialDirection && SANS_TYPES.has(creative.creativeType))) {
    return {
      mode: "modern-sans",
      family: "Avenir Next, Avenir, Montserrat, Arial, Liberation Sans, sans-serif",
      weight: 800,
    };
  }

  return {
    mode: "editorial-serif",
    family: "Bodoni 72, Didot, Georgia, Times New Roman, Liberation Serif, serif",
    weight: 700,
  };
}

const CTA_FALLBACKS: Record<string, string> = {
  shop: "Shop Now", send: "Send Flowers", order: "Order Now", explore: "Explore Now",
  discover: "Explore Now", browse: "Explore Now", gift: "Send Flowers", save: "Save This", share: "Share This",
};

// Image CTA pills stay at one or two words; longer campaign CTAs live in the caption.
export function shortCtaLabel(cta?: string): string {
  const words = (cta ?? "").replace(/https?:\/\/\S+/gi, "").replace(/\s[—–-]\s.*$/, "").replace(/[.!?]+$/, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length <= 2 && words.join(" ").length <= 14) return words.join(" ");
  return CTA_FALLBACKS[words[0]!.toLowerCase()] ?? "Shop Now";
}

// Prices go stale and never appear in the approved brand ads, so they never get baked into an image.
export const stripPrices = (text: string) =>
  text.replace(/\s*[—–-]?\s*(?:only\s+|from\s+|just\s+)?\$\s?\d[\d,]*(?:\.\d+)?/gi, "").replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type HeadlineWord = { text: string; accented: boolean };

function accentStartIndex(headline: string): number {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.length;

  const delimiterIndex = words.findLastIndex(word => /[,—–:]$/.test(word));
  const wordsAfterDelimiter = words.length - delimiterIndex - 1;
  if (delimiterIndex >= 0 && wordsAfterDelimiter >= 1 && wordsAfterDelimiter <= 5) {
    return delimiterIndex + 1;
  }

  const numericPhrase = words.findIndex((word, index) =>
    index > 0 && /^(?:in|with|for)$/i.test(word) && /\d/.test(words[index + 1] || "")
  );
  if (numericPhrase >= 0) return numericPhrase;

  const accentLength = Math.min(4, Math.max(2, Math.ceil(words.length * 0.4)));
  return Math.max(1, words.length - accentLength);
}

export function headlineWords(headline: string): HeadlineWord[] {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  const start = accentStartIndex(headline);
  return words.map((text, index) => ({ text, accented: index >= start }));
}

function wrapWords(words: HeadlineWord[], maxChars: number): HeadlineWord[][] {
  const lines: HeadlineWord[][] = [];
  let line: HeadlineWord[] = [];
  let length = 0;

  for (const word of words) {
    const nextLength = length + (line.length ? 1 : 0) + word.text.length;
    if (line.length && nextLength > maxChars) {
      lines.push(line);
      line = [];
      length = 0;
    }
    line.push(word);
    length += (line.length > 1 ? 1 : 0) + word.text.length;
  }
  if (line.length) lines.push(line);
  return lines;
}

function fitHeadline(words: HeadlineWord[], usableWidth: number, mode: CreativeTypography["mode"], compact = false) {
  // Creatives with numbered steps need the vertical room for the list, so their headline is smaller.
  const preferred = compact ? (mode === "modern-sans" ? 60 : 56) : mode === "modern-sans" ? 92 : 84;
  const widthFactor = mode === "modern-sans" ? 0.56 : 0.52;
  const preferredLines = words.length <= 6 ? 2 : 3;

  for (let size = preferred; size >= 42; size -= 2) {
    const lines = wrapWords(words, Math.max(8, Math.floor(usableWidth / (size * widthFactor))));
    if (lines.length <= preferredLines) return { lines, size };
  }

  for (let size = preferred; size >= 42; size -= 2) {
    const lines = wrapWords(words, Math.max(8, Math.floor(usableWidth / (size * widthFactor))));
    if (lines.length <= 3) return { lines, size };
  }

  for (let size = preferred; size >= 40; size -= 2) {
    const lines = wrapWords(words, Math.max(8, Math.floor(usableWidth / (size * widthFactor))));
    if (lines.length <= 4) return { lines, size };
  }

  throw new Error("Creative headline is too long to fit without truncation");
}

function wrapPlainText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderHeadlineLine(
  words: HeadlineWord[],
  x: number,
  y: number,
  anchor: "start" | "end",
  palette: ReturnType<typeof textPaletteForCreative>,
): string {
  const chunks: Array<{ text: string; accented: boolean }> = [];
  for (const word of words) {
    const previous = chunks.at(-1);
    if (previous?.accented === word.accented) previous.text += ` ${word.text}`;
    else chunks.push({ text: word.text, accented: word.accented });
  }

  return `<tspan x="${x}" y="${y}" text-anchor="${anchor}">${chunks.map((chunk, index) =>
    `<tspan fill="${chunk.accented ? palette.accent : palette.primary}"${index ? ' dx="0.22em"' : ""}>${escapeXml(chunk.text)}</tspan>`
  ).join("")}</tspan>`;
}

export function buildCreativeTextOverlay(
  creative: TypographyCreative,
  side: CreativeTextSide,
  width = 1024,
  height = 1024,
  vertical: CreativeTextVertical = "top",
  tone: CreativeTextTone = "dark",
): Buffer {
  const typography = typographyForCreative(creative);
  const palette = textPaletteForCreative(creative, tone);
  const margin = Math.round(width * CREATIVE_MARGIN_RATIO);
  const usableWidth = Math.round(width * ((creative.contentPoints ?? []).some((point) => point.trim()) ? 0.46 : 0.42));
  const x = side === "left" ? margin : width - margin;
  const anchor = side === "left" ? "start" : "end";
  const hasSteps = (creative.contentPoints ?? []).some((point) => point.trim());
  const fitted = fitHeadline(headlineWords(stripPrices(creative.headline)), usableWidth, typography.mode, hasSteps);
  const lineHeight = Math.round(fitted.size * (typography.mode === "modern-sans" ? 0.94 : 1.02));
  // "top" starts below the logo that anchors the column (logo bottom + a clear gap + the first line's cap height).
  const logoBottom = margin + Math.round(width * CREATIVE_LOGO_WIDTH_RATIO * CREATIVE_LOGO_ASPECT);
  const firstY = vertical === "lower"
    ? Math.round(height * 0.55)
    : logoBottom + Math.round(height * 0.03) + Math.round(fitted.size * 0.72);
  const headlineSvg = fitted.lines.map((line, index) =>
    renderHeadlineLine(line, x, firstY + index * lineHeight, anchor, palette)
  ).join("");

  const subheadline = stripPrices(creative.subheadline);
  const subSize = Math.max(24, Math.round(width * 0.029));
  const subLines = subheadline
    ? wrapPlainText(subheadline, Math.max(18, Math.floor(usableWidth / (subSize * 0.52))))
    : [];
  if (subLines.length > 4) {
    throw new Error("Creative subheadline is too long to fit without truncation");
  }
  const lastHeadlineY = firstY + (fitted.lines.length - 1) * lineHeight;
  const headlineToSubBaseline = Math.max(
    Math.round(fitted.size * 0.65),
    Math.round(subSize * 1.35)
  ) + Math.round(height * 0.01);
  const subFirstY = lastHeadlineY + headlineToSubBaseline;
  const subLineHeight = Math.round(subSize * 1.28);
  const subSvg = subLines.map((line, index) =>
    `<tspan x="${x}" y="${subFirstY + index * subLineHeight}">${escapeXml(line)}</tspan>`
  ).join("");

  const contentPoints = (creative.contentPoints || []).map(point => point.trim()).filter(Boolean);

  // Reference-ad CTA: a compact magenta pill under the subheadline. The website URL is only shown by the
  // dedicated bottom pill on the fourth creative, where it is large enough to read.
  const ctaLabel = shortCtaLabel(creative.cta);
  const showCtaPill = !contentPoints.length && ctaLabel.length > 0;
  const pillFont = Math.max(22, Math.round(width * 0.028));
  const pillHeight = Math.round(pillFont * 2.3);
  const pillWidth = Math.round(ctaLabel.length * pillFont * 0.6) + Math.round(pillFont * 2.6);
  const pillX = side === "left" ? x : x - pillWidth;
  const contentStart = subLines.length ? subFirstY + subLines.length * subLineHeight : lastHeadlineY + Math.round(fitted.size * 0.4);
  const pillY = contentStart + Math.round(height * 0.025);
  const ctaPillSvg = showCtaPill
    ? `<rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${Math.round(pillHeight / 2)}" fill="${ctaAccentForCreative(creative.order)}"/>
       <text x="${pillX + Math.round(pillWidth / 2)}" y="${pillY + Math.round(pillHeight * 0.66)}" text-anchor="middle" font-family="Arial, Helvetica, Liberation Sans, sans-serif" font-size="${pillFont}" font-weight="700" fill="#ffffff">${escapeXml(ctaLabel)} →</text>`
    : "";
  const pointSize = Math.max(22, Math.round(width * 0.024));
  const pointLineHeight = Math.round(pointSize * 1.24);
  const pointGap = Math.round(height * 0.018);
  const numberRadius = Math.round(pointSize * 0.68);
  const numberX = side === "left" ? x + numberRadius : x - numberRadius;
  const pointTextX = side === "left" ? x + numberRadius * 2 + 12 : x - numberRadius * 2 - 12;
  const pointAnchor = side === "left" ? "start" : "end";
  let pointY = subLines.length
    ? subFirstY + subLines.length * subLineHeight + Math.round(height * 0.025)
    : firstY + fitted.lines.length * lineHeight + Math.round(height * 0.035);
  const pointMaxChars = Math.max(18, Math.floor((usableWidth - numberRadius * 2 - 16) / (pointSize * 0.52)));
  const pointSvg: string[] = [];
  let contentBottom = 0;

  contentPoints.forEach((point, index) => {
    const lines = wrapPlainText(point, pointMaxChars);
    if (lines.length > 3) {
      throw new Error(`Creative content point is too long to fit clearly: "${point}"`);
    }
    const firstBaseline = pointY + pointSize;
    pointSvg.push(`<circle cx="${numberX}" cy="${firstBaseline - Math.round(pointSize * 0.35)}" r="${numberRadius}" fill="${palette.accent}"/>`);
    pointSvg.push(`<text x="${numberX}" y="${firstBaseline - Math.round(pointSize * 0.13)}" text-anchor="middle" font-family="Arial, Helvetica, Liberation Sans, sans-serif" font-size="${Math.round(pointSize * 0.72)}" font-weight="700" fill="#ffffff">${index + 1}</text>`);
    pointSvg.push(`<text x="${pointTextX}" text-anchor="${pointAnchor}" font-family="Arial, Helvetica, Liberation Sans, sans-serif" font-size="${pointSize}" font-weight="600" fill="${palette.primary}" filter="url(#text-shadow)">${lines.map((line, lineIndex) =>
      `<tspan x="${pointTextX}" y="${firstBaseline + lineIndex * pointLineHeight}">${escapeXml(line)}</tspan>`
    ).join("")}</text>`);
    const pointHeight = Math.max(numberRadius * 2, lines.length * pointLineHeight);
    contentBottom = pointY + pointHeight;
    pointY += pointHeight + pointGap;
  });

  if (contentPoints.length && contentBottom > height * 0.84) {
    throw new Error("Creative content points are too long to fit without overlapping the website CTA");
  }

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="${tone === "light" ? "2.4" : "1.8"}" flood-color="${tone === "light" ? "#000000" : "#ffffff"}" flood-opacity="${tone === "light" ? "0.72" : "0.82"}"/>
      </filter>
      <linearGradient id="copy-gradient" x1="${side === "left" ? "0%" : "100%"}" y1="0%" x2="${side === "left" ? "100%" : "0%"}" y2="0%">
        <stop offset="0%" stop-color="${tone === "light" ? "#000000" : "#ffffff"}" stop-opacity="${tone === "light" ? "0.58" : "0.68"}"/>
        <stop offset="46%" stop-color="${tone === "light" ? "#000000" : "#ffffff"}" stop-opacity="${tone === "light" ? "0.34" : "0.42"}"/>
        <stop offset="72%" stop-color="${tone === "light" ? "#000000" : "#ffffff"}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${vertical === "lower" ? Math.round(height * 0.43) : 0}" width="${width}" height="${vertical === "lower" ? Math.round(height * 0.49) : Math.round(height * (contentPoints.length ? 0.85 : 0.8))}" fill="url(#copy-gradient)"/>
    <text font-family="${typography.family}" font-size="${fitted.size}" font-weight="${typography.weight}" letter-spacing="-1.2" filter="url(#text-shadow)">${headlineSvg}</text>
    ${subLines.length ? `<text x="${x}" text-anchor="${anchor}" font-family="Arial, Helvetica, Liberation Sans, sans-serif" font-size="${subSize}" font-weight="500" fill="${palette.secondary}" filter="url(#text-shadow)">${subSvg}</text>` : ""}
    ${ctaPillSvg}
    ${pointSvg.join("")}
  </svg>`);
}

export async function detectCreativeTextTone(
  imagePath: string,
  side: CreativeTextSide,
  vertical: CreativeTextVertical,
): Promise<CreativeTextTone> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  const regionWidth = Math.max(1, Math.floor(width * 0.5));
  const regionHeight = Math.max(1, Math.floor(height * (vertical === "lower" ? 0.4 : 0.5)));
  const left = side === "left" ? 0 : width - regionWidth;
  const top = vertical === "lower" ? Math.floor(height * 0.45) : 0;
  const safeHeight = Math.min(regionHeight, height - top);
  const { channels } = await image
    .extract({ left, top, width: regionWidth, height: safeHeight })
    .greyscale()
    .stats();
  const mean = channels[0]?.mean ?? 255;
  return mean < 145 ? "light" : "dark";
}

export async function addCreativeText(
  imagePath: string,
  outputPath: string,
  creative: TypographyCreative,
  side: CreativeTextSide,
  vertical: CreativeTextVertical = "top",
): Promise<void> {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  const tone = await detectCreativeTextTone(imagePath, side, vertical);
  await sharp(imagePath)
    .composite([{ input: buildCreativeTextOverlay(creative, side, width, height, vertical, tone), left: 0, top: 0 }])
    .png()
    .toFile(outputPath);
}
