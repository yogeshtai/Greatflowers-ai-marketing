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

// The site's own deep brand purple, used for headline copy. The near-miss values this replaced
// (#32105f, #d61572) were close enough to look right in isolation and wrong beside the real site.
export const CREATIVE_TEXT_PURPLE = "#261943";

// Taken from the live site's own design tokens, read out of its stylesheet: --gf-primary is the
// fill on every button on greatflowers.net and --gf-secondary is its accent. Creative chrome that
// drifts off these reads as someone else's ad, however well it suits the photograph.
export const GF_PRIMARY = "#701888";
export const GF_SECONDARY = "#db2173";

// Only brand hues are available as accents. The photograph decides which of them is used, not
// whether the creative is on brand at all: purple for violet and lilac flowers, magenta otherwise.
// Variety belongs to the photography - environment, lighting and art direction already carry it.
const CREATIVE_TEXT_PALETTES = [
  { primary: CREATIVE_TEXT_PURPLE, accent: GF_PRIMARY, secondary: "#3f3a44" },
  { primary: CREATIVE_TEXT_PURPLE, accent: GF_SECONDARY, secondary: "#3f3a44" },
] as const;

// White copy sits on dark photographs, where the brand colours themselves are too dark to read, so
// these are the same two hues lifted into tints rather than different colours.
const CREATIVE_LIGHT_TEXT_PALETTES = [
  { primary: "#ffffff", accent: "#bf97c9", secondary: "#f7f1f5" },
  { primary: "#ffffff", accent: "#ff7fbd", secondary: "#f7f1f5" },
] as const;

function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta) return 0;
  const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}

// Both palettes run pink, amber, green, coral in the same order, so one index picks the matching
// accent whichever tone the photograph calls for.
const ACCENT_HUES = CREATIVE_TEXT_PALETTES.map(palette => hueOf(palette.accent));
// Only accents nearly as close to the photograph as the closest one may be chosen. A wider window
// let a magenta accent win on a warm amber frame simply because it was that creative's turn.
const ACCENT_SPREAD = 20;

// Large display copy needs 3:1. Aim past it so a background measured as an average does not leave
// the real pixels under a letter sitting on the line.
export const COPY_CONTRAST_TARGET = 3.3;
const MAX_COPY_SCRIM = 0.55;
const MIN_VISIBLE_COPY_SCRIM = 0.05;

export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function luminanceOf(hex: string): number {
  return relativeLuminance(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  );
}

export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminanceToChannel(luminance: number): number {
  const clamped = Math.min(1, Math.max(0, luminance));
  return (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255;
}
const HUE_BUCKETS = 24;
const MIN_HUE_EVIDENCE = 20;

function hueDistance(a: number, b: number): number {
  const gap = Math.abs(a - b);
  return Math.min(gap, 360 - gap);
}

// Rotating the accent purely by position puts a magenta headline on a dark green Halloween table.
// Choose the accent that echoes a colour already in the photograph instead, and keep the positional
// rotation only to spread the choice across the accents that all suit it equally well.
export function accentIndexForImage(
  imageHue: number | null,
  order?: number,
  backgroundLuminance: number | null = null,
  tone: CreativeTextTone = "dark",
): number {
  const rotation = Math.max(0, (order ?? 1) - 1) % ACCENT_HUES.length;

  // Both accents are on brand, so legibility decides between them before taste does. On a warm
  // light wall the magenta sits at 2.3:1 and the purple at 4.7:1, and bleaching the photograph to
  // rescue the magenta is a far worse answer than simply using the brand's other colour.
  const readable = backgroundLuminance === null ? null : (tone === "light" ? CREATIVE_LIGHT_TEXT_PALETTES : CREATIVE_TEXT_PALETTES)
    .map((palette, index) => ({ index, contrast: contrastRatio(backgroundLuminance, luminanceOf(palette.accent)) }))
    .filter(entry => entry.contrast >= COPY_CONTRAST_TARGET)
    .map(entry => entry.index);

  if (imageHue === null) {
    if (readable?.length) return readable[rotation % readable.length]!;
    return rotation;
  }
  const distances = ACCENT_HUES.map((accent, index) =>
    readable && readable.length && !readable.includes(index) ? Number.POSITIVE_INFINITY : hueDistance(accent, imageHue)
  );
  const nearest = Math.min(...distances);
  const limit = nearest + ACCENT_SPREAD;
  const candidates = distances
    .map((distance, index) => ({ distance, index }))
    .filter(entry => entry.distance <= limit)
    .sort((a, b) => a.distance - b.distance)
    .map(entry => entry.index);
  return candidates[rotation % candidates.length] ?? rotation;
}

// Weight each hue by how saturated it is and ignore near-neutral, blown-out and near-black pixels,
// so the answer comes from the flowers and props rather than from a wall or a shadow.
export function dominantHueFromPixels(
  pixels: ReadonlyArray<readonly [number, number, number]>
): number | null {
  const weights = new Array<number>(HUE_BUCKETS).fill(0);
  for (const pixel of pixels) {
    const [r, g, b] = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255] as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;
    if (!delta || lightness < 0.12 || lightness > 0.9) continue;
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (saturation < 0.22) continue;
    const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    const hue = (raw * 60 + 360) % 360;
    weights[Math.floor(hue / (360 / HUE_BUCKETS)) % HUE_BUCKETS]! += saturation;
  }
  if (weights.reduce((total, weight) => total + weight, 0) < MIN_HUE_EVIDENCE) return null;
  let best = 0;
  for (let index = 1; index < HUE_BUCKETS; index += 1) if (weights[index]! > weights[best]!) best = index;
  return (best + 0.5) * (360 / HUE_BUCKETS);
}

export async function dominantImageHue(imagePath: string): Promise<number | null> {
  try {
    const { data, info } = await sharp(imagePath)
      .resize(64, 64, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels: Array<[number, number, number]> = [];
    for (let index = 0; index + 2 < data.length; index += info.channels) {
      pixels.push([data[index]!, data[index + 1]!, data[index + 2]!]);
    }
    return dominantHueFromPixels(pixels);
  } catch {
    // Losing the hue only costs us the positional fallback; it must never cost us the creative.
    return null;
  }
}

export function textPaletteForCreative(
  creative: Pick<TypographyCreative, "order">,
  tone: CreativeTextTone = "dark",
  imageHue: number | null = null,
  backgroundLuminance: number | null = null,
) {
  // The primary stays on the approved brand colour so every creative still reads as GreatFlowers;
  // only the accent moves, so four creatives in one campaign stop looking like one template.
  const palettes = tone === "light" ? CREATIVE_LIGHT_TEXT_PALETTES : CREATIVE_TEXT_PALETTES;
  const base = palettes[0]!;
  return { ...base, accent: palettes[accentIndexForImage(imageHue, creative.order, backgroundLuminance, tone)]!.accent };
}

// Every button on greatflowers.net is --gf-primary, so the pill is too - on every creative, over
// every photograph. A call to action is the one element that has to be instantly recognisable as
// the brand's, so it does not follow the image the way the headline accent does.
export function ctaAccentForCreative(): string {
  return GF_PRIMARY;
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
  imageHue: number | null = null,
  backing: Pick<CreativeCopyBacking, "luminance" | "scrim"> | null = null,
): Buffer {
  const typography = typographyForCreative(creative);
  const palette = textPaletteForCreative(creative, tone, imageHue, backing?.luminance ?? null);
  // Without a measurement, fall back to the old unconditional wash rather than leaving copy bare.
  const scrimStrength = backing ? backing.scrim : (tone === "light" ? 0.52 : 0.6);
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
    ? `<rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="${Math.round(pillHeight / 2)}" fill="${ctaAccentForCreative()}"/>
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

  // The scrim fades smoothly left-to-right but used to stop at a hard horizontal cut, which is what
  // made the copy read as a sticker laid on the photo rather than part of it. Keep the full-strength
  // band exactly where it was and extend it with a faded tail, so legibility over the text is
  // unchanged and only the boundary disappears.
  // Size the scrim to the copy that needs it. It used to cover a fixed 80% of the frame while the
  // text occupied about a third of that, bleaching photograph that was never in question.
  const copyBottom = contentPoints.length
    ? contentBottom
    : showCtaPill
      ? pillY + pillHeight
      : subLines.length
        ? subFirstY + (subLines.length - 1) * subLineHeight
        : lastHeadlineY;
  const scrimPlateauTop = vertical === "lower" ? Math.max(0, firstY - Math.round(fitted.size * 1.1)) : 0;
  const scrimPlateauBottom = Math.min(height, copyBottom + Math.round(height * 0.02));
  const scrimFade = Math.round(height * 0.1);
  const scrimTop = Math.max(0, scrimPlateauTop - (vertical === "lower" ? scrimFade : 0));
  const scrimHeight = Math.min(height, scrimPlateauBottom + scrimFade) - scrimTop;
  const plateauStart = ((scrimPlateauTop - scrimTop) / scrimHeight) * 100;
  const plateauEnd = ((scrimPlateauBottom - scrimTop) / scrimHeight) * 100;
  const scrimFadeStops = [
    ...(plateauStart > 0.5 ? [`<stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>`] : []),
    `<stop offset="${plateauStart.toFixed(2)}%" stop-color="#ffffff" stop-opacity="1"/>`,
    `<stop offset="${plateauEnd.toFixed(2)}%" stop-color="#ffffff" stop-opacity="1"/>`,
    `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>`,
  ].join("");

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="${tone === "light" ? "2.4" : "1.8"}" flood-color="${tone === "light" ? "#000000" : "#ffffff"}" flood-opacity="${tone === "light" ? "0.72" : "0.82"}"/>
      </filter>
      <linearGradient id="copy-gradient" x1="${side === "left" ? "0%" : "100%"}" y1="0%" x2="${side === "left" ? "100%" : "0%"}" y2="0%">
        <stop offset="0%" stop-color="${tone === "light" ? "#000000" : "#ffffff"}" stop-opacity="${scrimStrength.toFixed(3)}"/>
        <stop offset="46%" stop-color="${tone === "light" ? "#000000" : "#ffffff"}" stop-opacity="${(scrimStrength * 0.62).toFixed(3)}"/>
        <stop offset="72%" stop-color="${tone === "light" ? "#000000" : "#ffffff"}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="copy-fade" x1="0%" y1="0%" x2="0%" y2="100%">${scrimFadeStops}</linearGradient>
      <mask id="copy-mask"><rect x="0" y="${scrimTop}" width="${width}" height="${scrimHeight}" fill="url(#copy-fade)"/></mask>
    </defs>
    ${scrimStrength > 0 ? `<rect x="0" y="${scrimTop}" width="${width}" height="${scrimHeight}" fill="url(#copy-gradient)" mask="url(#copy-mask)"/>` : ""}
    <text font-family="${typography.family}" font-size="${fitted.size}" font-weight="${typography.weight}" letter-spacing="-1.2" filter="url(#text-shadow)">${headlineSvg}</text>
    ${subLines.length ? `<text x="${x}" text-anchor="${anchor}" font-family="Arial, Helvetica, Liberation Sans, sans-serif" font-size="${subSize}" font-weight="500" fill="${palette.secondary}" filter="url(#text-shadow)">${subSvg}</text>` : ""}
    ${ctaPillSvg}
    ${pointSvg.join("")}
  </svg>`);
}

// The copy column, not a quarter of the frame. Sampling a half-frame quadrant dragged flowers and
// furniture into a decision about pixels that only ever sit behind text, which called for a wash
// over backgrounds the copy never touches.
export function copyRegionBounds(
  width: number,
  height: number,
  side: CreativeTextSide,
  vertical: CreativeTextVertical,
  hasSteps = false,
) {
  const margin = Math.round(width * CREATIVE_MARGIN_RATIO);
  const columnWidth = Math.max(1, Math.round(width * (hasSteps ? 0.46 : 0.42)));
  const top = Math.round(height * (vertical === "lower" ? 0.5 : 0.14));
  const bottom = Math.round(height * (vertical === "lower" ? 0.9 : hasSteps ? 0.86 : 0.56));
  return {
    left: Math.max(0, side === "left" ? margin : width - margin - columnWidth),
    top,
    width: Math.min(columnWidth, width),
    height: Math.max(1, Math.min(bottom, height) - top),
  };
}

// sharp's .stats() silently ignores a preceding .extract(), so the old sampling here reported the
// whole frame's average no matter which region it asked for. Resizing to a grid and reading the
// raw pixels does respect the crop, and gives one sample per patch so a region that is bright on
// one side and dark on the other is not averaged into a comfortable middle.
export async function sampleCopyRegion(
  imagePath: string,
  side: CreativeTextSide,
  vertical: CreativeTextVertical,
  hasSteps = false,
): Promise<Array<[number, number, number]>> {
  const metadata = await sharp(imagePath).metadata();
  const bounds = copyRegionBounds(metadata.width || 1024, metadata.height || 1024, side, vertical, hasSteps);
  const { data, info } = await sharp(imagePath)
    .extract(bounds)
    .resize(4, 3, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cells: Array<[number, number, number]> = [];
  for (let index = 0; index + 2 < data.length; index += info.channels) {
    cells.push([data[index]!, data[index + 1]!, data[index + 2]!]);
  }
  return cells;
}

export type CreativeCopyBacking = {
  tone: CreativeTextTone;
  /** Mean luminance of the copy region, for choosing an accent that reads on it. */
  luminance: number;
  /** 0 when the photograph already carries the copy; otherwise the strength the scrim needs. */
  scrim: number;
};

export function copyBackingFromCells(
  cells: ReadonlyArray<readonly [number, number, number]>,
  accent: string,
  tone?: CreativeTextTone,
): CreativeCopyBacking {
  if (!cells.length) return { tone: tone ?? "dark", luminance: 1, scrim: 0 };
  const luminances = cells.map(cell => relativeLuminance(cell[0], cell[1], cell[2]));
  const mean = luminances.reduce((total, value) => total + value, 0) / luminances.length;
  const resolved = tone ?? (mean < 0.21 ? "light" : "dark");

  // Dark copy is rescued by lightening and light copy by darkening, so the patch that decides is
  // the darkest one under dark copy and the brightest one under light copy.
  const worst = resolved === "dark" ? Math.min(...luminances) : Math.max(...luminances);
  const text = luminanceOf(accent);
  if (contrastRatio(worst, text) >= COPY_CONTRAST_TARGET) {
    return { tone: resolved, luminance: mean, scrim: 0 };
  }

  const target = resolved === "dark"
    ? COPY_CONTRAST_TARGET * (text + 0.05) - 0.05
    : (text + 0.05) / COPY_CONTRAST_TARGET - 0.05;
  const current = luminanceToChannel(worst);
  const wash = resolved === "dark" ? 255 : 0;
  const needed = wash === current ? MAX_COPY_SCRIM : (luminanceToChannel(target) - current) / (wash - current);
  // A wash this faint changes nothing a reader can see, so do not paint one at all.
  if (needed < MIN_VISIBLE_COPY_SCRIM) return { tone: resolved, luminance: mean, scrim: 0 };
  return { tone: resolved, luminance: mean, scrim: Math.min(MAX_COPY_SCRIM, needed) };
}

export async function detectCreativeTextTone(
  imagePath: string,
  side: CreativeTextSide,
  vertical: CreativeTextVertical,
  hasSteps = false,
): Promise<CreativeTextTone> {
  const cells = await sampleCopyRegion(imagePath, side, vertical, hasSteps);
  if (!cells.length) return "dark";
  const mean = cells
    .map(cell => relativeLuminance(cell[0], cell[1], cell[2]))
    .reduce((total, value) => total + value, 0) / cells.length;
  return mean < 0.21 ? "light" : "dark";
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
  const hasSteps = (creative.contentPoints ?? []).some(point => point.trim());
  const [cells, imageHue] = await Promise.all([
    sampleCopyRegion(imagePath, side, vertical, hasSteps),
    dominantImageHue(imagePath),
  ]);
  const tone = await detectCreativeTextTone(imagePath, side, vertical, hasSteps);
  // The accent is picked first, against the measured background, because the two brand accents
  // differ enough in luminance that the choice decides whether a scrim is needed at all.
  const mean = cells.length
    ? cells.map(cell => relativeLuminance(cell[0], cell[1], cell[2])).reduce((total, value) => total + value, 0) / cells.length
    : 1;
  const accent = textPaletteForCreative(creative, tone, imageHue, mean).accent;
  const backing = copyBackingFromCells(cells, accent, tone);
  await sharp(imagePath)
    .composite([{ input: buildCreativeTextOverlay(creative, side, width, height, vertical, tone, imageHue, backing), left: 0, top: 0 }])
    .png()
    .toFile(outputPath);
}

