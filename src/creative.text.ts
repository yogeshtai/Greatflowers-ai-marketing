import sharp from "sharp";

export type CreativeTextSide = "left" | "right";
export type CreativeTextVertical = "top" | "lower";

type TypographyCreative = {
  order?: number;
  creativeType: string;
  sceneStrategy: string;
  headline: string;
  subheadline: string;
  contentPoints?: string[];
};

export const CREATIVE_TEXT_PURPLE = "#32105f";
export const CREATIVE_TEXT_PINK = "#d61572";

const CREATIVE_TEXT_PALETTES = [
  { primary: CREATIVE_TEXT_PURPLE, accent: CREATIVE_TEXT_PINK, secondary: "#3f3a44" },
  { primary: "#25232a", accent: "#a62962", secondary: "#4d4850" },
  { primary: "#294039", accent: "#9a3f68", secondary: "#46534f" },
  { primary: "#3b2b2c", accent: "#a84d3c", secondary: "#554747" },
] as const;

export function textPaletteForCreative(creative: Pick<TypographyCreative, "order">) {
  const order = Number.isInteger(creative.order) ? Math.max(1, creative.order!) : 1;
  return CREATIVE_TEXT_PALETTES[(order - 1) % CREATIVE_TEXT_PALETTES.length]!;
}

export type CreativeTypography = {
  mode: "editorial-serif" | "modern-sans";
  family: string;
  weight: number;
};

const SANS_TYPES = new Set(["informational", "feature"]);
const SANS_SCENES = new Set(["INFORMATIONAL_GRAPHIC", "FEATURE_DEMO"]);

export function typographyForCreative(
  creative: Pick<TypographyCreative, "creativeType" | "sceneStrategy">
): CreativeTypography {
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

function fitHeadline(words: HeadlineWord[], usableWidth: number, mode: CreativeTypography["mode"]) {
  const preferred = mode === "modern-sans" ? 72 : 66;
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
): Buffer {
  const typography = typographyForCreative(creative);
  const palette = textPaletteForCreative(creative);
  const margin = Math.round(width * 0.055);
  const usableWidth = Math.round(width * 0.42);
  const x = side === "left" ? margin : width - margin;
  const anchor = side === "left" ? "start" : "end";
  const fitted = fitHeadline(headlineWords(creative.headline), usableWidth, typography.mode);
  const lineHeight = Math.round(fitted.size * (typography.mode === "modern-sans" ? 0.94 : 1.02));
  const firstY = Math.round(height * (vertical === "lower" ? 0.55 : 0.12));
  const headlineSvg = fitted.lines.map((line, index) =>
    renderHeadlineLine(line, x, firstY + index * lineHeight, anchor, palette)
  ).join("");

  const subheadline = creative.subheadline.trim();
  const subSize = Math.max(20, Math.round(width * 0.024));
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
  const pointSize = Math.max(19, Math.round(width * 0.021));
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

  if (contentPoints.length && contentBottom > height * 0.74) {
    throw new Error("Creative content points are too long to fit without overlapping the website CTA");
  }

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#ffffff" flood-opacity="0.8"/>
      </filter>
    </defs>
    <text font-family="${typography.family}" font-size="${fitted.size}" font-weight="${typography.weight}" letter-spacing="-1.2" filter="url(#text-shadow)">${headlineSvg}</text>
    ${subLines.length ? `<text x="${x}" text-anchor="${anchor}" font-family="Arial, Helvetica, Liberation Sans, sans-serif" font-size="${subSize}" font-weight="400" fill="${palette.secondary}" filter="url(#text-shadow)">${subSvg}</text>` : ""}
    ${pointSvg.join("")}
  </svg>`);
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
  await sharp(imagePath)
    .composite([{ input: buildCreativeTextOverlay(creative, side, width, height, vertical), left: 0, top: 0 }])
    .png()
    .toFile(outputPath);
}
