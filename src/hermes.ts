
import {
  marketingStrategySchema,
  storyCreativePlanSchema,
  type StoryCreativePlan,
  type MarketingStrategy,
} from "./strategy.schema.js";

export interface CampaignInput {
  campaignGoal: string;
  product: string;
  occasion?: string | undefined;
  audience: string;
  trafficSource: string;
  platforms: string[];
  priority: string;
  additionalContext?: string | undefined;
}

const STORY_FIRST_RULES = `STORY-FIRST RULES (override generic product/advertising guidance for story slides only):
Set creativeBrief.revealSlide to 2, 3, or 4: the intentional first commercial solution reveal.
Choose the timing for this campaign; prefer meaningful buildup (often 3 or 4 for gifting),
without imposing a fixed sequence of narrative roles. First establish a human situation,
emotion, desire, need, question, tension or occasion. The solution must answer that setup.
Before revealSlide, every slide MUST have productRole "none", brandRole "none", cta "".
No selected product, flowers as a commercial solution, product names, GreatFlowers, logo,
website, ecommerce/browser screenshots, sales language, Buy/Shop/Send-this-bouquet CTAs,
or premature visual solution cues. Headlines/subheadlines must read as storytelling.
At revealSlide naturally introduce flowers, the selected product, GreatFlowers, or a verified
feature. Later slides show consequences and emotional payoff, not repeated product ads.
The final slide MUST use brandRole "reveal" and cta "Shop flowers — https://greatflowers.net", with an emotional resolution. The deterministic official GreatFlowers logo will be composited at the top-right corner; keep the top corners clear of text, faces and important details. The CTA and URL stay in the post caption/metadata, never inside the image; do not ask AI to recreate the logo.
For EVERY slide add brandRole ("none", "subtle", "reveal"), sceneChange (what is visually
new versus the previous shot; for slide 1 define the opening), and cameraDirection
(the framing/composition for this beat). Hermes decides these roles per slide.
Use brandRole "subtle" for a minimal deterministic logo only, "reveal" for normal approved
branding, and "none" for no logo, website or CTA (cta must be empty).
Continuity means recognizable characters/style, NOT repeated compositions. Adjacent shots
must change primary composition, subject placement, camera framing, character action,
product placement and room/table setup unless sceneChange explains a deliberate narrative reason.
Four distinct shots must show progression even with all text hidden.

GIFTING RELATIONSHIP (mandatory, decide this FIRST): fill giftingRelationship with a specific
sender (the customer who buys), a specific recipient, their relationship, the reason, and the
pointOfView the slides follow. Flowers are a gift between people — the viewer must never wonder
"who is giving this to whom?". A single person alone with a bouquet, with no giver or receiver
implied, is NOT a story. Self-gifting is allowed ONLY when relationship is "self-gift" and the
copy makes that explicit ("treat yourself", "you earned this").
- pointOfView "sender": we follow the giver — noticing the moment, deciding, choosing, handing over
  or watching it be received. The recipient must appear by the reveal or final slide.
- pointOfView "recipient": we follow the receiver — their day, the doorbell/handoff, the reaction.
  The sender or the act of giving (hands, a card, a delivery) must be visible at the reveal.
- pointOfView "both": alternate, and the reveal or final slide shows them together.
The reveal slide MUST show the act of giving or receiving (handed over, delivered, unwrapped,
a card read), not a bouquet that simply appears on a table.
Every storyBeat must name who is in frame and what they are doing for the other person.

HUMAN THREAD (mandatory): characterContinuity MUST describe the sender and recipient from
giftingRelationship (age, look, clothing) so they are recognizable across slides.
The pointOfView character appears in at least 3 of the 4 slides, INCLUDING the final slide;
the other person appears in at least one slide (reveal or final) unless it is a self-gift.
Do not introduce people in slide 1 and then drop them.

REVEAL vs PAYOFF (mandatory): the reveal slide and the final slide must be visibly different shots.
- Reveal slide: the product enters the established scene (handed over, set down, unwrapped, held).
  It stays in the same environment, lighting and palette as the previous slides. PRODUCT_STUDIO
  is FORBIDDEN in story-carousel mode: no studio backdrop, seamless paper or isolated catalog shot.
- Final slide: sceneStrategy MUST be HUMAN_GIFTING_MOMENT or HUMAN_LIFESTYLE, productRole
  "supporting" (never "hero"). Its storyBeat MUST describe a human reaction or consequence
  (a face, a smile, an embrace, hands touching the flowers, a quiet look). It is never a second
  product shot; the bouquet is present but not centered and not the largest element.
- The reveal and final slides must differ in cameraDirection, subject placement and product placement.

ENVIRONMENT LOCK: environmentContinuity MUST name one concrete setting and light quality
(e.g. "same candlelit dining room, warm tungsten light, evening"). Every slide, including the
reveal, stays inside that world. Never switch to a bright studio or a different location mid-story.

TEXT: headlines and subheadlines are composited programmatically onto the top-left of each
slide; the image itself is generated text-free. Keep headlines under 45 characters and
subheadlines under 110 characters so they fit cleanly.
These additional fields belong in the JSON even though the generic example omits them.`;

function buildPrompt(input: CampaignInput): string {
  return `
Campaign Goal: ${input.campaignGoal}

Product / Feature: ${input.product}

Occasion: ${input.occasion || "Not specified"}

Audience: ${input.audience}

Traffic Source: ${input.trafficSource}

Platforms: ${input.platforms.join(", ")}

Priority: ${input.priority}

Additional Context: ${input.additionalContext || "None"}

IMPORTANT OUTPUT INSTRUCTIONS:

Return ONLY valid JSON.

Do not use Markdown.
Do not use markdown code fences.
Do not add any explanation before or after the JSON.

FACT VS HYPOTHESIS RULE:

If a marketing statement is not supported by verified GreatFlowers data,
treat it as a hypothesis or recommendation.

Do not present assumptions about customer behavior,
conversion likelihood, or platform performance as verified facts.

Put important hypotheses inside the "assumptions" array.

VERIFIED PRODUCT DATA RULE:

When live GreatFlowers product information is provided
inside Additional Context, treat those supplied product fields
as verified.

Do not ask to verify information already provided,
such as:

- product name
- product description
- price
- stock status
- categories
- product URL
- product image

needsVerification should contain ONLY genuinely missing information,
such as delivery eligibility, current promotions,
cutoff times, inventory details not supplied,
or performance data that has not been provided.

Use exactly this structure:

{
  "campaignObjective": "string",

  "targetCustomer": "string",

  "customerIntent": [
    "string"
  ],

  "customerProblemOrDesire": "string",

  "emotionalTriggers": [
    "string"
  ],

  "marketingAngle": "string",

  "valueProposition": "string",

  "cta": {
    "primary": "string",
    "secondary": "string",
    "destinationUrl": "string"
  },

  "whyThisCouldWork": "string",

  "platformContent": {
    "instagram": {
      "visualConcept": "string",
      "caption": "string",
      "hashtags": ["string"]
    },

    "facebook": {
      "post": "string",
      "cta": "string"
    },

    "pinterest": {
      "titles": ["string"],
      "description": "string",
      "keywords": ["string"],
      "destinationUrl": "string"
    },

    "x": {
      "post": "string"
    },

    "youtubeShorts": {
      "hook": "string",
      "scenes": ["string"],
      "voiceoverOrText": "string",
      "cta": "string",
      "length": "string"
    }
  },

  "abTests": [
    {
      "name": "string",
      "angle": "string",
      "focus": "string",
      "measure": ["string"]
    }
  ],

  "assumptions": [
    "string"
  ],

  "needsVerification": [
    "string"
  ],

  "creativeBrief": {
    "creativeMode": "independent | story-carousel",
    "headline": "string",
    "subheadline": "string",
    "cta": "string",
    "mood": "string",
    "backgroundDirection": "string",
    "productTreatment": "string",
    "logoPlacement": "string",
    "textPlacement": "string",
    "creativeGoal": "string",
    "carouselConcept": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)",
    "giftingRelationship": {
      "sender": "string (REQUIRED in story-carousel mode: who buys/sends, with age/look/clothing)",
      "recipient": "string (who receives, with age/look/clothing)",
      "relationship": "string (e.g. husband to wife, daughter to mother, friend to friend, self-gift)",
      "reason": "string (why flowers are given in this story)",
      "pointOfView": "sender | recipient | both"
    },
    "visualContinuity": {
      "characterContinuity": "string (optional)",
      "environmentContinuity": "string (optional)",
      "colorContinuity": "string (optional)",
      "stylingContinuity": "string (optional)"
    },
    "variants": [
      {
        "order": 1,
        "creativeType": "product | lifestyle | occasion | location | feature | informational | brand-awareness",
        "sceneStrategy": "PRODUCT_STUDIO | HUMAN_GIFTING_MOMENT | HUMAN_LIFESTYLE | OCCASION_SCENE | EDITORIAL_CONTENT | INFORMATIONAL_GRAPHIC | LOCATION_STORY | FEATURE_DEMO | BRAND_STORY",
        "concept": "string",
        "headline": "string",
        "subheadline": "string",
        "cta": "string",
        "visualDirection": "string",
        "productRole": "hero | supporting | optional | none",
        "locationContext": "string (optional)",
        "occasionContext": "string (optional)",
        "colorPalette": "string",
        "compositionStyle": "string",
        "lightingStyle": "string",
        "sceneType": "string",
        "storyRole": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)",
        "storyBeat": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)"
      },
      {
        "order": 2,
        "creativeType": "product | lifestyle | occasion | location | feature | informational | brand-awareness",
        "sceneStrategy": "PRODUCT_STUDIO | HUMAN_GIFTING_MOMENT | HUMAN_LIFESTYLE | OCCASION_SCENE | EDITORIAL_CONTENT | INFORMATIONAL_GRAPHIC | LOCATION_STORY | FEATURE_DEMO | BRAND_STORY",
        "concept": "string",
        "headline": "string",
        "subheadline": "string",
        "cta": "string",
        "visualDirection": "string",
        "productRole": "hero | supporting | optional | none",
        "locationContext": "string (optional)",
        "occasionContext": "string (optional)",
        "colorPalette": "string",
        "compositionStyle": "string",
        "lightingStyle": "string",
        "sceneType": "string",
        "storyRole": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)",
        "storyBeat": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)"
      },
      {
        "order": 3,
        "creativeType": "product | lifestyle | occasion | location | feature | informational | brand-awareness",
        "sceneStrategy": "PRODUCT_STUDIO | HUMAN_GIFTING_MOMENT | HUMAN_LIFESTYLE | OCCASION_SCENE | EDITORIAL_CONTENT | INFORMATIONAL_GRAPHIC | LOCATION_STORY | FEATURE_DEMO | BRAND_STORY",
        "concept": "string",
        "headline": "string",
        "subheadline": "string",
        "cta": "string",
        "visualDirection": "string",
        "productRole": "hero | supporting | optional | none",
        "locationContext": "string (optional)",
        "occasionContext": "string (optional)",
        "colorPalette": "string",
        "compositionStyle": "string",
        "lightingStyle": "string",
        "sceneType": "string",
        "storyRole": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)",
        "storyBeat": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)"
      },
      {
        "order": 4,
        "creativeType": "product | lifestyle | occasion | location | feature | informational | brand-awareness",
        "sceneStrategy": "PRODUCT_STUDIO | HUMAN_GIFTING_MOMENT | HUMAN_LIFESTYLE | OCCASION_SCENE | EDITORIAL_CONTENT | INFORMATIONAL_GRAPHIC | LOCATION_STORY | FEATURE_DEMO | BRAND_STORY",
        "concept": "string",
        "headline": "string",
        "subheadline": "string",
        "cta": "string",
        "visualDirection": "string",
        "productRole": "hero | supporting | optional | none",
        "locationContext": "string (optional)",
        "occasionContext": "string (optional)",
        "colorPalette": "string",
        "compositionStyle": "string",
        "lightingStyle": "string",
        "sceneType": "string",
        "storyRole": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)",
        "storyBeat": "string (REQUIRED if creativeMode is story-carousel, otherwise omit)"
      }
    ]
  }
}

CREATIVE BRIEF RULES:

creativeMode (REQUIRED):

You MUST choose between two creative modes for this campaign:

1. "independent"
   - Generate 4 different standalone marketing creatives
   - Each image works independently as its own advertisement
   - Use when: The campaign benefits from multiple distinct marketing angles
   - Example: Product showcase + lifestyle moment + occasion scene + informational graphic

2. "story-carousel"
   - Generate 4 connected slides that together tell ONE coherent marketing story
   - Each slide advances the narrative
   - Use when: The campaign benefits from a sequential story that unfolds across multiple images
   - Example: A birthday gifting journey, a sympathy support story, an anniversary celebration arc

CRITICAL MODE SELECTION RULES:

Do NOT force every campaign into story-carousel mode.

Choose based on:
- Campaign objective (does it benefit from a narrative arc?)
- Occasion (some occasions naturally tell stories, others don't)
- Product type (some products work better in stories, others as standalone showcases)
- Target customer intent (are they looking for a story or quick product info?)
- Marketing angle (does the angle require narrative development?)

Story-carousel is appropriate when:
- The campaign has a clear emotional journey
- The occasion involves a sequence of moments (gifting process, celebration timeline, support journey)
- The marketing angle benefits from building anticipation or emotional development
- The customer intent involves understanding a process or experience

Independent is appropriate when:
- The campaign needs to test multiple distinct value propositions
- Different customer segments need different messaging
- The product/occasion doesn't naturally form a narrative
- Maximum creative diversity is more valuable than story continuity

The creativeBrief is for a future AI visual-generation system that will create social media campaign images.

The future system will use:
- the REAL GreatFlowers product image from the catalog
- the official GreatFlowers logo (https://greatflowers.net/assets/svg/greatflowers-logo.svg)
- your creative brief instructions

to generate finished campaign creatives.

IMPORTANT PRODUCT ACCURACY RULE:

The real catalog product image will be used as the hero product.

Do NOT instruct the image generator to redesign or replace the product.

The creativeBrief may describe:
- background environment
- lighting
- mood
- layout/composition
- typography placement
- decorative elements

The creativeBrief must NOT request changes to:
- flower types
- flower colors
- bouquet composition
- vase/container
- arrangement style
- core product appearance

productTreatment field:

Must explicitly state to preserve the real product.

Example wording:
"Use the real GreatFlowers product image as the hero product. Preserve the bouquet, flower colors, arrangement, container and important product details faithfully. Do not redesign the product."

You may adapt slightly based on the product, but the meaning must remain.

headline:

Short primary ad headline suitable for image creative.
Avoid long paragraphs.
Keep concise.

subheadline:

One short supporting sentence.
Must not invent unsupported claims.

cta:

Short CTA suitable for social advertising.

Safe CTA examples:
- Send Flowers
- Shop Flowers
- Explore the Collection
- Send Something Thoughtful
- Shop [Product Name]

Do NOT create unsupported CTAs:
- Get 50% Off (unless verified promotion exists)
- Guaranteed Delivery Today (unless verified)
- Lowest Price (unless verified)

mood:

Overall visual/emotional direction.

Examples:
- calm, comforting and elegant
- romantic, warm and premium
- cheerful, bright and celebratory

backgroundDirection:

Describe the surrounding scene/environment for the image generator.

Example:
"Soft premium interior with natural window light, neutral tones and subtle botanical elements."

Describe environment only.
Do NOT tell the generator to replace or redesign the bouquet.

logoPlacement:

Simple design instruction for the GreatFlowers logo.
The logo MUST always be placed in a top corner: "top-left" or "top-right" only.
Never place the logo at the bottom, center or middle of the image.

Examples:
- top-right with comfortable margin
- top-left with comfortable margin

textPlacement:

Text positioning instruction that ensures readability and avoids logo overlap.

CRITICAL: Text must NOT overlap the logo safe area specified in logoPlacement.

Example:
"Place the headline in the upper-left portion of the frame, well away from the top-right logo area, with comfortable negative space. Use dark text color for high contrast against the light background. Place the short supporting line below the headline if space permits. Do not render the CTA anywhere inside the image."

Guidelines:
- Always specify text position that avoids the logo area
- Specify text color for contrast (dark on light, light on dark)
- Mention if text needs shadows or overlays for readability
- Keep text in zones with clean backgrounds

creativeGoal:

Short statement explaining what this creative should achieve.

Example:
"Create a respectful sympathy ad that communicates thoughtfulness while keeping the real product as the visual focus."

carouselConcept (REQUIRED if creativeMode is "story-carousel", otherwise omit):

A single sentence explaining the overall marketing story that connects all 4 slides.

Example:
"A birthday gifting journey showing someone discovering the perfect way to celebrate a loved one through thoughtful flowers."

This is the narrative spine. All 4 slides must advance this story.

visualContinuity (REQUIRED if creativeMode is "story-carousel", otherwise omit):

Describe what should remain visually consistent across the 4 slides to create story cohesion.

characterContinuity:
Should the same person/people appear across slides? Describe who and how.

Example:
"Use the same couple throughout - a woman in her 30s selecting and giving flowers, and her partner receiving them."

Or if no character continuity is needed:
"No character continuity required."

environmentContinuity:
Should the setting remain consistent? Describe the environment.

Example:
"Warm home interior throughout - living room and dining area of the same house."

colorContinuity:
What color palette should unify the slides?

Example:
"Warm cream, soft pink, and natural wood tones throughout all slides."

stylingContinuity:
What visual style should remain consistent?

Example:
"Premium editorial photography with consistent soft natural lighting and clean typography."

variants:

You MUST return exactly 4 creative variants (slides).

Each variant must have order: 1, 2, 3, or 4.

STRATEGIC CREATIVE CONCEPT SELECTION:

FOR INDEPENDENT MODE:

Do NOT hard-code creative types (e.g. always product + lifestyle + location + occasion).

Instead, strategically choose the 4 best creative concepts from the available evidence and campaign objective.

The 4 concepts should be meaningfully different marketing approaches, not just visual variations of the same advertisement.

FOR STORY-CAROUSEL MODE:

${STORY_FIRST_RULES}

Each of the 4 slides must include:

storyRole (REQUIRED):
The narrative function of this slide in the overall story.

Do NOT hard-code roles like "setup → consideration → gesture → payoff".

Design the appropriate narrative structure for THIS specific campaign.

Examples of possible story roles (adapt to your story):
- "emotional trigger"
- "problem awareness"
- "solution discovery"
- "meaningful action"
- "emotional payoff"
- "product reveal"
- "moment of connection"
- "celebration peak"

storyBeat (REQUIRED):
What specifically happens in this slide? What changes from the previous slide?

Example:
"The recipient opens the door to find the flower delivery waiting, their expression shifting from ordinary to surprised delight."

CRITICAL STORY CONNECTION RULE:

Every slide must answer: "What changed from the previous slide?"

Four slides must NOT simply show the same message differently.

BAD story progression:
Slide 1 → bouquet on table
Slide 2 → bouquet in different room
Slide 3 → bouquet near person
Slide 4 → bouquet on another table

GOOD story progression:
Slide 1 → establishes the emotional situation or need
Slide 2 → develops the moment or consideration
Slide 3 → introduces the meaningful action or solution
Slide 4 → delivers the emotional or product payoff

The story must have PROGRESSION, not repetition.

Available creative types:

1. creativeType: "product"
   Product-focused creative showcasing the specific GreatFlowers product.
   productRole: typically "hero"
   Use when: Product is central to the campaign goal.

2. creativeType: "lifestyle"
   Emotional/lifestyle creative showing gifting moments, relationships, or life contexts.
   productRole: "hero", "supporting", or "optional"
   Use when: Emotional connection or gifting context is the primary angle.

3. creativeType: "occasion"
   Occasion-focused creative tied to specific events (Mother's Day, Valentine's, birthdays, sympathy, etc.).
   productRole: "hero" or "supporting"
   occasionContext: REQUIRED - specify the occasion
   Use when: Campaign is tied to a specific occasion or calendar event.

4. creativeType: "location"
   Location-focused creative highlighting delivery areas, local presence, or geographic relevance.
   productRole: "supporting", "optional", or "none"
   locationContext: REQUIRED - specify the location/area (ONLY if verified in Additional Context)
   Use when: Location/delivery is a key differentiator AND verified data supports it.
   CRITICAL: Do NOT invent locations. Only use verified delivery areas from Additional Context.

5. creativeType: "feature"
   Feature-focused creative promoting specific GreatFlowers services (e.g. Build Your Bouquet, same-day delivery, subscription).
   productRole: "supporting", "optional", or "none"
   Use when: A specific verified feature is the campaign focus.
   CRITICAL: Only promote features explicitly mentioned in Additional Context or verified GreatFlowers data.

6. creativeType: "informational"
   Educational/content creative providing value (flower care tips, occasion guides, calendar content).
   productRole: "optional" or "none"
   Use when: Building brand authority or providing helpful content is the goal.

7. creativeType: "brand-awareness"
   Brand-focused creative highlighting GreatFlowers' values, quality, or service promise.
   productRole: "optional" or "none"
   Use when: Building brand recognition or trust is the primary objective.

sceneStrategy (REQUIRED for each variant):

This field controls the VISUAL COMPOSITION STRATEGY for image generation.

Choose the sceneStrategy that best matches the creativeType and concept:

1. PRODUCT_STUDIO
   Commercial product photography. Product is the main visual subject.
   Use with: creativeType "product" + productRole "hero"

2. HUMAN_GIFTING_MOMENT
   Person giving, receiving, or interacting with flowers. Emotional moment is the hero.
   Use with: creativeType "lifestyle" + productRole "supporting"

3. HUMAN_LIFESTYLE
   Human lifestyle scene where flowers participate naturally.
   Use with: creativeType "lifestyle" + productRole "supporting" or "optional"

4. OCCASION_SCENE
   Scene that visually communicates the occasion. Occasion/environment dominates.
   Use with: creativeType "occasion" + productRole "supporting" or "optional"

5. EDITORIAL_CONTENT
   Editorial/social content composition (occasion guides, flower stories, seasonal content, care tips).
   Use with: creativeType "informational" + productRole "optional" or "none"
   CRITICAL: Product should NOT dominate. This is NOT a product advertisement.

6. INFORMATIONAL_GRAPHIC
   Structured useful-content design. Product should not dominate the canvas.
   Use with: creativeType "informational" + productRole "optional" or "none"

7. LOCATION_STORY
   Location/environment/story leads the composition.
   Use with: creativeType "location" + productRole "supporting" or "optional"

8. FEATURE_DEMO
   Visually demonstrate the verified feature/service.
   Use with: creativeType "feature" + productRole varies

9. BRAND_STORY
   Broader brand/service composition. Do not make one product the hero.
   Use with: creativeType "brand-awareness" + productRole "optional" or "none"

CRITICAL SCENE STRATEGY DIVERSITY:

FOR INDEPENDENT MODE:

The 4 variants MUST use meaningfully different sceneStrategy values.

Do NOT assign strategies by card position. Choose based on the strategic concept.

Different variants should produce visually distinct kinds of marketing content:
- Example: PRODUCT_STUDIO + HUMAN_GIFTING_MOMENT + EDITORIAL_CONTENT + OCCASION_SCENE
- NOT: PRODUCT_STUDIO + PRODUCT_STUDIO + PRODUCT_STUDIO + PRODUCT_STUDIO with different headlines

FOR STORY-CAROUSEL MODE:

The 4 slides may use similar sceneStrategy values IF the story requires it for continuity,
EXCEPT: PRODUCT_STUDIO is never allowed, and the final slide must be HUMAN_GIFTING_MOMENT
or HUMAN_LIFESTYLE. Prefer human-led strategies throughout so the characters carry the story.

Each slide must still have visual progression through the storyBeat.

CREATIVE CONCEPT DIVERSITY:

FOR INDEPENDENT MODE:

The 4 variants should use at least 3 different creativeType values.

Prefer 4 different types when strategically appropriate.

FOR STORY-CAROUSEL MODE:

The 4 slides may use the same or similar creativeType values if the story requires it.

Focus on narrative progression rather than type diversity.

Each variant should have:
- different concept (strategic approach)
- different sceneStrategy (visual composition strategy)
- different headline
- different productRole (when appropriate)
- different visualDirection

Do not duplicate the exact same headline, concept, or sceneStrategy across variants.

CRITICAL VISUAL DIVERSITY REQUIREMENT:

FOR INDEPENDENT MODE:

The 4 variants MUST have distinctly different visual styles to avoid repetitive-looking creatives.

FOR STORY-CAROUSEL MODE:

The 4 slides should maintain visual continuity as specified in visualContinuity, while still showing clear progression through the story.

Each variant must specify these 4 visual style fields:

colorPalette:
Specific color direction for the scene and props (NOT the product flowers).

Examples:
- "warm autumn tones with rust, amber, and cream"
- "cool minimalist whites and soft grays"
- "vibrant jewel tones with emerald and sapphire accents"
- "soft pastels with blush pink and lavender"
- "rich earth tones with terracotta and sage"
- "monochromatic neutrals with beige and taupe"

compositionStyle:
The visual layout and framing approach.

Examples:
- "flat-lay overhead shot with symmetrical arrangement"
- "lifestyle scene with natural perspective"
- "editorial close-up with shallow depth of field"
- "environmental portrait showing context"
- "hero product centered with negative space"
- "asymmetric composition with rule of thirds"

lightingStyle:
The quality and direction of light in the scene.

Examples:
- "golden hour warmth with soft side lighting"
- "bright studio lighting with clean highlights"
- "moody dramatic shadows with directional light"
- "soft diffused natural window light"
- "backlit glow with rim lighting"
- "even ambient light with no harsh shadows"

sceneType:
The physical environment and setting.

Examples:
- "cozy kitchen counter with morning coffee setup"
- "elegant bedroom nightstand with silk linens"
- "rustic outdoor garden table with natural elements"
- "modern minimalist desk with clean lines"
- "romantic dining table with candlelight"
- "bright sunlit windowsill with botanical props"

VISUAL DIVERSITY ENFORCEMENT:

FOR INDEPENDENT MODE:

The 4 variants MUST use different values for at least 3 out of 4 style fields.

Do NOT generate variants with the same colorPalette, compositionStyle, AND lightingStyle.

Aim for maximum visual contrast between the four creatives.

FOR STORY-CAROUSEL MODE:

Visual style fields should support the visualContinuity plan while allowing for progression.

Some fields may remain consistent across slides if specified in visualContinuity.

concept field:

A brief strategic description of what this specific creative is trying to achieve.

Examples:
- "Showcase the premium quality and vibrant colors of this specific bouquet"
- "Capture the emotional moment of surprising someone with flowers"
- "Highlight same-day delivery convenience for last-minute gifting"
- "Position flowers as the perfect Mother's Day gift"

productRole field:

Describes how the actual GreatFlowers product participates in this creative:

- "hero": Product is the main visual focus
- "supporting": Product is visible but not the primary focus
- "optional": Product may or may not appear
- "none": Creative does not feature the product

Do NOT force a product into every creative when it doesn't fit the concept.

locationContext and occasionContext:

Only populate these when relevant to the creativeType.

locationContext: Required for "location" type. Specify the geographic area (ONLY if verified).
occasionContext: Required for "occasion" type. Specify the event/occasion.

SAME-DAY DELIVERY RULE:

If delivery messaging is used in creative copy, use safe wording:
"Same-day delivery available in eligible areas."

Do NOT say:
- Same-day delivery guaranteed
- Same-day delivery everywhere
- Order now for guaranteed same-day delivery

unless explicitly verified.

LANGUAGE RULE:

All generated text — headlines, subheadlines, CTAs, captions, hashtags, story beats,
concepts and every other copy field — MUST use American English spelling, vocabulary
and phrasing (e.g. "color" not "colour", "favorite" not "favourite").

FACTUAL SAFETY RULES FOR CREATIVE COPY:

Do NOT invent:
- discounts or coupon codes
- prices
- delivery guarantees
- customer reviews or ratings
- order counts or popularity claims
- bestseller claims
- sales performance claims
- flower contents not in verified product data
- statistics or competitor comparisons

Creative copy must come from:
1. verified live website information
2. verified selected-product information
3. the selected campaign occasion/intent
4. explicitly supported campaign context

If something is unknown, do not state it as fact.

URL RULES:

All URL fields must contain ONLY the raw URL.

Correct:
"https://greatflowers.net/build-your-bouquet/"

Incorrect:
"[https://greatflowers.net/build-your-bouquet/](https://greatflowers.net/build-your-bouquet/)"

Never use Markdown link syntax anywhere in the JSON.

Only include platformContent entries for the platforms requested by the campaign.

INSTAGRAM HASHTAG RULES:

The instagram.hashtags array MUST contain at least 15 relevant hashtags.

Hashtag requirements:
- Return at least 15 hashtags (15-25 is ideal)
- Do NOT include the "#" symbol in the strings (the backend adds it)
- Each hashtag must be a single word or compound word with no spaces
- Mix broad reach tags (e.g. "Flowers", "FlowerDelivery") with niche tags (e.g. "PreservedRoses", "WeddingGift")
- Always include "GreatFlowers" as one of the hashtags
- Include occasion, product-type, and audience-relevant tags
- No duplicate hashtags

Never place unsupported business claims inside the JSON.

The creativeBrief is REQUIRED for all new strategies.

FACT CLASSIFICATION:

- Facts supplied in Additional Context are verified facts.
- Do not put supplied product facts into needsVerification.
- Unknown information belongs in needsVerification.
- Marketing hypotheses belong in assumptions.
- Do not present hypotheses as facts.

WHY THIS COULD WORK RULE:

"whyThisCouldWork" must clearly distinguish verified catalog evidence
from marketing hypotheses.

Statements about:
- cultural associations
- customer preferences
- emotional response
- visual performance
- standing out on social media
- likelihood of conversion

must use hypothesis language such as:

"may"
"could"
"we recommend testing"
"worth testing"

Do not state these as verified facts.

CRITICAL PROGRAMMATIC OUTPUT RULE:

You are being called by a backend API.

Return the complete JSON response directly in your final response.

DO NOT:
- create or write files
- save JSON to disk
- return a file path
- return a summary of the campaign
- tell the user that JSON is ready somewhere
- use tools to persist the response

The backend can only read your final stdout response.

Your final response MUST start with {
and MUST end with }

Return the complete JSON object directly.
`.trim();
}

function extractJSON(output: string): string {
  let cleaned = output.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Hermes did not return JSON");
  }

  return cleaned.slice(start, end + 1);
}

function normalizeUrl(value?: string): string | undefined {
  if (!value) return value;

  const markdownLink = value.match(/^\[([^\]]+)\]\([^)]+\)$/);

  if (markdownLink) {
    return markdownLink[1];
  }

  return value.trim();
}

function normalizeHashtags(
  hashtags: unknown
): string[] {
  if (!Array.isArray(hashtags)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of hashtags) {
    if (typeof raw !== "string") {
      continue;
    }

    // Strip leading "#", trim, and remove internal spaces
    const tag = raw
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "");

    if (!tag) {
      continue;
    }

    const key = tag.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(tag);
  }

  return normalized;
}

function normalizeStrategyUrls(data: any) {
  if (data?.cta?.destinationUrl) {
    data.cta.destinationUrl = normalizeUrl(
      data.cta.destinationUrl
    );
  }

  if (data?.platformContent?.pinterest?.destinationUrl) {
    data.platformContent.pinterest.destinationUrl =
      normalizeUrl(
        data.platformContent.pinterest.destinationUrl
      );
  }

  if (data?.platformContent?.instagram?.hashtags) {
    data.platformContent.instagram.hashtags =
      normalizeHashtags(
        data.platformContent.instagram.hashtags
      );
  }

  return data;
}

export async function generateMarketingStrategy(
  input: CampaignInput
): Promise<MarketingStrategy> {
  const output = await requestHermes(`Use the greatflowers-marketing-strategist skill.\n\n${buildPrompt(input)}`);

  try {
    const jsonText = extractJSON(output);
    const parsedJSON = JSON.parse(jsonText);

    const normalizedJSON =
      normalizeStrategyUrls(parsedJSON);

    return marketingStrategySchema.parse(
      normalizedJSON
    );
  } catch (error) {
    console.error("Raw Hermes output:", output);
    throw error;
  }
}

async function requestHermes(prompt: string): Promise<string> {
  const apiUrl =
    process.env.HERMES_API_URL ||
    "http://127.0.0.1:8642/v1/chat/completions";

  const apiKey = process.env.HERMES_API_KEY;

  if (!apiKey) {
    throw new Error("HERMES_API_KEY is not configured");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "hermes-agent",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Hermes API failed (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as any;

  const output = data?.choices?.[0]?.message?.content;

  if (!output || typeof output !== "string") {
    console.error("Unexpected Hermes API response:", data);
    throw new Error("Hermes API returned no message content");
  }

  return output;
}

export async function generateStoryCreativePlan(
  input: CampaignInput,
  selectedProduct: unknown,
  strategy: Record<string, unknown>
): Promise<StoryCreativePlan> {
  const output = await requestHermes(`
Use the greatflowers-marketing-strategist skill.
Create ONLY a dedicated four-slide StoryCreativePlan for the supplied campaign.
The user explicitly selected Story Creatives. Always produce the connected story,
regardless of the original creativeMode. Do not regenerate the campaign strategy,
change the selected product, or create independent advertisements.
Campaign: ${JSON.stringify(input)}
Selected catalog product: ${JSON.stringify(selectedProduct)}
Existing strategy (context only): ${JSON.stringify(strategy)}
${STORY_FIRST_RULES}
For this standalone output put revealSlide and carouselConcept at the ROOT and use
slides (not creativeBrief or variants). Include a visualContinuity plan identifying
recurring characters and consistent style, while each shot advances the story.
Use only supplied product facts and verified campaign context. Do not invent prices,
discounts, delivery guarantees, reviews or service claims. Keep hypotheses out of factual copy.
Return ONLY JSON conforming to this schema, with no markdown or explanation:
${JSON.stringify(storyCreativePlanSchema.toJSONSchema())}
`);
  return storyCreativePlanSchema.parse(JSON.parse(extractJSON(output)));
}
