import sharp from "sharp";

export interface PosterCopy {
  order: number;
  headline: string;
  subheadline: string;
  contentPoints?: string[];
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const posterLayout = (order: number) => ["masthead", "editorial-footer", "field-notes", "campaign-banner"][(order - 1) % 4] ?? "masthead";

export function posterPhotographyBrief(order: number): string {
  return `FINAL COMPOSITION CONTRACT — overrides earlier copy-safe-area and logo-space instructions:
The final design is ${posterLayout(order)}. Generate a complete text-free photograph filling a square frame.
Do not leave an empty wall or a vacant side column for text. The application places this photograph
inside a designed poster alongside typography, rather than putting copy over the subject.
Keep the bouquet and human action in the central 75% so a modest crop is safe. Flowers must be
large and unmistakable. For a product view fill approximately half the frame with the bouquet;
for a human moment keep flowers in the foreground. Never put the bouquet on a distant shelf.
No lettering, logos, buttons or graphic panels in the photograph.`;
}

function lines(text: string, max: number): string[] {
  const result: string[] = [];
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > max) throw new Error("Poster copy contains a word too long to typeset");
    const last = result.at(-1);
    if (last && last.length + word.length + 1 <= max) result[result.length - 1] += ` ${word}`;
    else result.push(word);
  }
  return result;
}

function textBlock(text: string, x: number, y: number, width: number, size: number, color: string, maxLines: number, serif = false): string {
  let wrapped = lines(text, Math.floor(width / (size * 0.58)));
  while (wrapped.length > maxLines && size > 24) {
    size -= 2;
    wrapped = lines(text, Math.floor(width / (size * 0.58)));
  }
  if (wrapped.length > maxLines) throw new Error("Poster copy is too long; shorten it before generation");
  return `<text fill="${color}" font-family="${serif ? "Georgia, Times New Roman, serif" : "Arial, Helvetica, sans-serif"}" font-size="${size}" font-weight="${serif ? 700 : 500}">${wrapped.map((line, i) => `<tspan x="${x}" y="${y + i * size * 1.12}">${escape(line)}</tspan>`).join("")}</text>`;
}

export async function renderPoster(photo: string | Buffer, logo: string | Buffer, copy: PosterCopy, output: string): Promise<void> {
  const layout = posterLayout(copy.order);
  const notes = layout === "field-notes";
  const footer = layout === "editorial-footer";
  const banner = layout === "campaign-banner";
  const purple = "#261943";
  const background = banner ? purple : "#fffaf4";
  const ink = banner ? "#ffffff" : purple;
  const box = notes ? { left: 0, top: 0, width: 540, height: 1080 }
    : footer ? { left: 0, top: 0, width: 1080, height: 690 }
    : banner ? { left: 0, top: 0, width: 1080, height: 740 }
    : { left: 0, top: 350, width: 1080, height: 730 };
  const x = notes ? 585 : 58;
  const y = notes ? 240 : footer ? 780 : banner ? 825 : 175;
  const width = notes ? 440 : 964;
  const headline = textBlock(copy.headline, x, y, width, notes ? 58 : 78, ink, notes ? 3 : 2, true);
  let detail = "";
  if (notes) {
    const points = copy.contentPoints?.length ? copy.contentPoints : [copy.subheadline];
    if (points.length > 3) throw new Error("Field notes support at most three concise points");
    detail = points.map((point, i) => `<circle cx="600" cy="${480 + i * 150}" r="17" fill="#701888"/><text x="600" y="${486 + i * 150}" text-anchor="middle" font-family="Arial" font-size="18" fill="white">${i + 1}</text>${textBlock(point, 634, 487 + i * 150, 380, 28, ink, 4)}`).join("");
  } else if (!banner) {
    detail = textBlock(copy.subheadline, x, footer ? 960 : 310, width, 29, ink, 2);
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">${headline}${detail}<path d="M${x} ${y - 86}h80" stroke="${banner ? "#db2173" : "#701888"}" stroke-width="5"/>${banner ? '<text x="58" y="1035" fill="white" font-family="Arial" font-size="25">greatflowers.net</text>' : ""}</svg>`);
  const picture = await sharp(photo).rotate().resize(box.width, box.height, { fit: "cover", position: "centre" }).toBuffer();
  // A consistent cream brand tab makes the real logo legible without washing out photography.
  const brand = await sharp({ create: { width: 238, height: 104, channels: 4, background: "#fffaf4" } })
    .composite([{ input: await sharp(logo).resize(190, 76, { fit: "inside" }).png().toBuffer(), left: 24, top: 14 }]).png().toBuffer();
  await sharp({ create: { width: 1080, height: 1080, channels: 4, background } })
    .composite([{ input: picture, left: box.left, top: box.top }, { input: svg, left: 0, top: 0 },
      { input: brand, left: notes ? 572 : 46, top: notes ? 48 : footer || banner ? 28 : 24 }])
    .png().toFile(output);
}
