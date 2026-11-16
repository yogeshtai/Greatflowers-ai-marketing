import sharp from "sharp";

export interface PosterCopy {
  order: number;
  headline: string;
  subheadline: string;
  contentPoints?: string[];
}

export const posterLayout = (order: number) => ["expressive-script", "bold-editorial", "playful-lettering", "occasion-display"][(order - 1) % 4] ?? "bold-editorial";

export function posterPhotographyBrief(copy: PosterCopy): string {
  return `FINAL INTEGRATED DESIGN CONTRACT — supersedes ALL earlier text-free, typography-safe-column, panel, footer and logo-placement instructions. Retain verified product and campaign facts.
Create the COMPLETE finished square florist social post, including the exact lettering below.
One continuous edge-to-edge photographic scene: no split photo/text panels, blank headers, footer slabs, boxed logos or brochure layouts. Flowers, human action, expressive lettering and subtle decorative details form one composition.
Reference direction: premium florist seasonal advertising with large vivid bouquets and beautiful display lettering. Arrange the headline around the flowers with deliberate line breaks and kerning. Never use tiny generic serif corner captions.
Typography direction: ${posterLayout(copy.order)}. Expressive-script pairs readable calligraphy with refined display lettering. Bold-editorial uses confident high-contrast display type. Playful-lettering uses friendly hand-lettered emphasis and restrained decorative marks. Occasion-display uses celebratory lettering and delicate ornaments suited to the occasion.
Choose dark plum or warm white lettering for contrast. Keep the photographic background continuous behind the lettering, without rectangular text surfaces. Preserve the reference bouquet exactly. Keep faces and flowers fully visible.
Exact headline: ${JSON.stringify(copy.headline)}
${copy.contentPoints?.length ? "Exact tips, all required and readable: " + JSON.stringify(copy.contentPoints) : "Exact supporting line: " + JSON.stringify(copy.subheadline)}
${copy.order === 4 ? 'Include one discreet website line: "www.greatflowers.net", without a footer block.' : "No website or CTA button; the caption carries the action."}
Do not invent discounts, claims or extra copy. Check every word before finishing.
The official transparent logo is added separately at top-center: reserve only 41%-59% of width and 3%-11% of height on a naturally light surface. Do not generate a logo, brand name, white box or empty header band.
Return a finished square image, not a mockup or contact sheet.`;
}

// Keep the complete artwork; add only the transparent official logo.
export async function renderPoster(photo: string | Buffer, logo: string | Buffer, _copy: PosterCopy, output: string): Promise<void> {
  const metadata = await sharp(photo).metadata();
  if (!metadata.width || !metadata.height || Math.abs(metadata.width / metadata.height - 1) > 0.03) {
    throw new Error("Integrated creative must be square; refusing to crop lettering or faces");
  }
  const brand = await sharp(logo).resize(194, 82, { fit: "inside" }).png().toBuffer();
  await sharp(photo).resize(1080, 1080, { fit: "fill" })
    .composite([{ input: brand, left: 443, top: 32 }]).png().toFile(output);
}
