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

export const SCENE_ENVIRONMENTS = [
  "entryway-console",
  "kitchen-counter",
  "dining-table",
  "living-room-seating",
  "bedside-nightstand",
  "sunlit-windowsill",
  "florist-workbench",
  "studio-backdrop",
  "outdoor-garden",
  "cafe-table",
  "workplace-desk",
  "front-doorstep",
] as const;

export type SceneEnvironment = typeof SCENE_ENVIRONMENTS[number];

export const LIGHTING_SETUPS = [
  "bright-daylight",
  "diffused-overcast",
  "golden-hour",
  "candlelit-warm",
  "hard-studio",
  "backlit-glow",
  "lamplit-evening",
] as const;

export type LightingSetup = typeof LIGHTING_SETUPS[number];

export const ENVIRONMENT_GUIDANCE: Record<SceneEnvironment, string> = {
  "entryway-console": "A hallway or entryway console table with a mirror, keys or post nearby. Narrow depth and architectural lines behind.",
  "kitchen-counter": "A working kitchen counter with everyday morning life around it. Worktop texture, cabinetry and daylight.",
  "dining-table": "A dining or gathering table seen across its surface, with place settings or glassware implied around the flowers.",
  "living-room-seating": "A sofa, armchair or coffee-table setting with soft furnishing texture and room depth behind.",
  "bedside-nightstand": "A bedside table with linens, a lamp or a book. Intimate scale and a quiet private mood.",
  "sunlit-windowsill": "Directly at a window, with the frame, glass and outside light part of the composition.",
  "florist-workbench": "A working bench with stems, trimmings, twine and wrapping in progress. Workshop texture, not a styled display.",
  "studio-backdrop": "A seamless or textured studio backdrop with controlled staging and no domestic context at all.",
  "outdoor-garden": "Outdoors among planting, a terrace or a garden table, with real daylight and open air behind.",
  "cafe-table": "A small cafe or bistro table with a cup or two, in a public setting with life behind.",
  "workplace-desk": "A desk or workspace with work objects present but subordinate to the flowers.",
  "front-doorstep": "An exterior doorway, porch or threshold, with the door and step part of the frame.",
};

export const LIGHTING_GUIDANCE: Record<LightingSetup, string> = {
  "bright-daylight": "Open, bright daylight with crisp shadows and a clean, awake feeling.",
  "diffused-overcast": "Soft even overcast light with gentle shadows and calm, muted contrast.",
  "golden-hour": "Low warm directional sun with long shadows and a golden cast.",
  "candlelit-warm": "Low warm candle or firelight with deep falloff and pooled highlights.",
  "hard-studio": "Controlled studio lighting with deliberate highlight shape and crisp edges.",
  "backlit-glow": "Light behind the subject producing rim light, glow and translucency through petals.",
  "lamplit-evening": "Interior lamplight after dark, warm pools of light against cooler shadow.",
};

export function fallbackEnvironment(order: number): SceneEnvironment {
  return ([
    "dining-table",
    "sunlit-windowsill",
    "living-room-seating",
    "kitchen-counter",
  ] as const)[Math.max(0, Math.min(3, order - 1))] ?? "dining-table";
}

export function fallbackLightingSetup(order: number): LightingSetup {
  return ([
    "diffused-overcast",
    "bright-daylight",
    "golden-hour",
    "lamplit-evening",
  ] as const)[Math.max(0, Math.min(3, order - 1))] ?? "diffused-overcast";
}

export const PREFERRED_ART_DIRECTIONS: Record<string, readonly ArtDirection[]> = {
  PRODUCT_STUDIO: ["sculptural-studio", "botanical-macro", "color-block-editorial", "magazine-product-feature", "editorial-flatlay"],
  HUMAN_GIFTING_MOMENT: ["documentary-gifting", "doorstep-delivery", "bouquet-in-motion", "unboxing-reveal", "seasonal-cinematic"],
  HUMAN_LIFESTYLE: ["bouquet-in-motion", "florist-workbench", "hosting-tablescape", "architectural-interior", "flower-care-demonstration"],
  OCCASION_SCENE: ["seasonal-cinematic", "hosting-tablescape", "documentary-gifting", "doorstep-delivery", "architectural-interior"],
  EDITORIAL_CONTENT: ["magazine-product-feature", "editorial-flatlay", "botanical-macro", "color-block-editorial", "flower-care-demonstration"],
  INFORMATIONAL_GRAPHIC: ["flower-care-demonstration", "florist-workbench", "botanical-macro", "editorial-flatlay", "color-block-editorial"],
  LOCATION_STORY: ["architectural-interior", "doorstep-delivery", "seasonal-cinematic", "hosting-tablescape", "florist-workbench"],
  FEATURE_DEMO: ["florist-workbench", "unboxing-reveal", "flower-care-demonstration", "botanical-macro", "magazine-product-feature"],
  BRAND_STORY: ["editorial-flatlay", "architectural-interior", "documentary-gifting", "magazine-product-feature", "color-block-editorial", "sculptural-studio"],
};

export function artDirectionPreferences(): string {
  return Object.entries(PREFERRED_ART_DIRECTIONS)
    .map(([scene, directions]) => `- ${scene}: ${directions.join(", ")}`)
    .join("\n");
}

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
