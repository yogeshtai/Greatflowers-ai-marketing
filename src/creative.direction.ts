export const ART_DIRECTIONS = [
  "documentary-gifting",
  "doorstep-delivery",
  "florist-workbench",
  "botanical-macro",
  "sculptural-studio",
  "editorial-flatlay",
  "hosting-tablescape",
  "bouquet-in-motion",
  "unboxing-reveal",
  "architectural-interior",
  "seasonal-cinematic",
  "color-block-editorial",
  "flower-care-demonstration",
  "magazine-product-feature",
] as const;

export type ArtDirection = typeof ART_DIRECTIONS[number];

export const COPY_LAYOUTS = [
  "top-left-editorial",
  "top-right-editorial",
  "lower-left-caption",
  "lower-right-caption",
  "full-bleed-left-gradient",
  "full-bleed-right-gradient",
] as const;

export type CopyLayout = typeof COPY_LAYOUTS[number];

export const ART_DIRECTION_GUIDANCE: Record<ArtDirection, string> = {
  "documentary-gifting": "Candid documentary photography of an authentic giving or receiving moment. Prioritize gesture, expression and human connection over a posed product shot.",
  "doorstep-delivery": "A believable flower-delivery arrival at a real doorway or entryway. Show motion, anticipation and the handoff; avoid courier uniforms or service claims that are not supplied.",
  "florist-workbench": "Behind-the-scenes floral workbench with hands actively arranging, trimming or wrapping the selected bouquet. Tools and materials support the flowers and never dominate.",
  "botanical-macro": "Tight botanical detail with selective focus, tactile petals, stems, foliage and color transitions. Preserve enough of the arrangement to remain commercially recognizable.",
  "sculptural-studio": "Bold premium studio still life using shape, shadow and dimensional staging. The bouquet is treated as a sculptural object, not a generic centered catalog cutout.",
  "editorial-flatlay": "Top-down editorial composition with the bouquet or its verified details anchoring a carefully spaced story. Props are sparse, relevant and secondary.",
  "hosting-tablescape": "A lived-in hosting scene where flowers meaningfully complete a dinner, brunch, welcome table or gathering. Include environmental context without letting tableware replace the flowers.",
  "bouquet-in-motion": "Flowers carried, lifted, passed or placed in a dynamic candid frame. Use natural movement and an unusual camera angle rather than a static vase-on-table composition.",
  "unboxing-reveal": "A tactile reveal moment involving wrapping, a delivery box or protective paper, with hands uncovering the flowers. Do not invent branded packaging or printed claims.",
  "architectural-interior": "A strong architectural interior with depth, clean lines and intentional negative space. Flowers remain the unmistakable color and emotional focal point.",
  "seasonal-cinematic": "Atmospheric seasonal storytelling with cinematic light, depth and a specific active moment. Avoid a generic decorated room or an empty holiday set.",
  "color-block-editorial": "Graphic editorial photography using bold color fields, controlled contrast and modern negative space derived from the verified bouquet palette.",
  "flower-care-demonstration": "Hands visibly performing one useful flower-care action. Show the action and flowers clearly; avoid a decorative still life pretending to be instruction.",
  "magazine-product-feature": "Premium magazine-style product feature with an unusual crop, strong hierarchy and refined styling. Avoid the standard centered ecommerce composition.",
};

export const ART_DIRECTIONS_BY_SCENE: Record<string, readonly ArtDirection[]> = {
  PRODUCT_STUDIO: ["sculptural-studio", "botanical-macro", "color-block-editorial", "magazine-product-feature"],
  HUMAN_GIFTING_MOMENT: ["documentary-gifting", "doorstep-delivery", "bouquet-in-motion", "unboxing-reveal", "seasonal-cinematic"],
  HUMAN_LIFESTYLE: ["florist-workbench", "bouquet-in-motion", "architectural-interior", "hosting-tablescape", "flower-care-demonstration"],
  OCCASION_SCENE: ["seasonal-cinematic", "hosting-tablescape", "documentary-gifting", "doorstep-delivery", "architectural-interior"],
  EDITORIAL_CONTENT: ["editorial-flatlay", "botanical-macro", "color-block-editorial", "magazine-product-feature", "flower-care-demonstration"],
  INFORMATIONAL_GRAPHIC: ["flower-care-demonstration", "florist-workbench", "botanical-macro", "editorial-flatlay"],
  LOCATION_STORY: ["architectural-interior", "doorstep-delivery", "seasonal-cinematic", "hosting-tablescape"],
  FEATURE_DEMO: ["florist-workbench", "unboxing-reveal", "flower-care-demonstration", "botanical-macro"],
  BRAND_STORY: ["editorial-flatlay", "architectural-interior", "documentary-gifting", "magazine-product-feature"],
};

export function fallbackArtDirection(sceneStrategy: string): ArtDirection {
  const byScene: Record<string, ArtDirection> = {
    PRODUCT_STUDIO: "sculptural-studio",
    HUMAN_GIFTING_MOMENT: "documentary-gifting",
    HUMAN_LIFESTYLE: "bouquet-in-motion",
    OCCASION_SCENE: "seasonal-cinematic",
    EDITORIAL_CONTENT: "magazine-product-feature",
    INFORMATIONAL_GRAPHIC: "flower-care-demonstration",
    LOCATION_STORY: "architectural-interior",
    FEATURE_DEMO: "florist-workbench",
    BRAND_STORY: "editorial-flatlay",
  };
  return byScene[sceneStrategy] ?? "magazine-product-feature";
}

export function fallbackCopyLayout(order: number): CopyLayout {
  return ([
    "top-left-editorial",
    "lower-right-caption",
    "full-bleed-left-gradient",
    "top-right-editorial",
  ] as const)[Math.max(0, Math.min(3, order - 1))] ?? "top-left-editorial";
}
