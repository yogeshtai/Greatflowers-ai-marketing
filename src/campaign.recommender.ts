import { createRotationPlan, type RotationPlan } from "./campaign.rotation.js";
import type {
  WebsitePageContext,
} from "./website.context.js";
import {
  campaignRecommendationSchema,
  type CampaignRecommendation,
} from "./recommendation.schema.js";

import type {
  MarketingProduct,
} from "./greatflowers.products.js";

import { formatOccasionGuidance } from "./occasion.calendar.js";
import { requestHermesJSON } from "./hermes.json.js";
import { parseModelJSON } from "./model.json.js";

export type ProductAnalyticsSignal = {
  itemId: string;
  itemName: string;
  views: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
};

function extractJSON(output: string) {
  let cleaned = output.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error(
      `Hermes did not return recommendation JSON. Reply started with: ${cleaned.slice(0, 300).replace(/\s+/g, " ")}`
    );
  }

  return cleaned.slice(start, end + 1);
}

function createCompactCatalog(
  products: MarketingProduct[]
) {
  return products
    .filter(
      (product) =>
        product.stockStatus === "in_stock" &&
        product.image
    )
    .map((product) => ({
      id: product.id,
      name: product.name,
      description:
        product.description.slice(0, 220),
      price: product.price,
      categories: product.categories,
      url: product.url,
      image: product.image,
    }));
}

export async function generateCampaignRecommendation(
  products: MarketingProduct[],
  websiteContext: WebsitePageContext[],
  recentHistory: string[] = [],
  analytics: ProductAnalyticsSignal[] = [],
  signal?: AbortSignal,
  rotationPlan?: RotationPlan
): Promise<CampaignRecommendation> {
  const rotation = rotationPlan ?? createRotationPlan(products, [], []);
  const catalog = createCompactCatalog(rotation.candidates);

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const liveWebsiteContext =
    websiteContext.map((page) => ({
      url: page.url,
      title: page.title,
      text: page.text.slice(0, 3500),
    }));

  const occasionGuidance = formatOccasionGuidance();

  const prompt = `
Use the greatflowers-marketing-strategist skill.

You are choosing what GreatFlowers should market next.

Market:
United States

Current Date:
${today}

Primary Objective:
Promote GreatFlowers through a varied mix of useful, inspiring, engaging and sales content.
For THIS recommendation use campaignGoal: ${rotation.campaignGoal}
and priority: ${rotation.priority}.

REQUIRED CONTENT DIRECTION (selected by weighted rotation):
contentTheme: ${rotation.contentTheme}
visualTreatment: ${rotation.visualTreatment}
${rotation.guidance}
Keep these exact contentTheme and visualTreatment values in the output.
Choose the strongest product fit WITHIN this direction using catalog, website and GA4 evidence.
A holiday can shape any theme; it must not override this content direction.
For non-gifting themes, creativeScenario describes a specific useful idea, scene or question.
Use a descriptive topic for occasion when there is no gifting occasion (e.g. Home styling).
Connect the content naturally to GreatFlowers and the selected real product.
Use save/share/comment calls to action for engagement, discover/explore for awareness,
and shopping for conversions. Never invent testimonials, behind-the-scenes facts or promotions.

STRUCTURED RECOMMENDATION HISTORY (newest first):
${JSON.stringify(rotation.recent)}

PUBLISHED POST HISTORY (newest first; actual feed exposure):
${JSON.stringify(rotation.published)}

CREATIVE ROTATION:
Do not reuse recent creative scenarios, marketing angles or visual compositions from either history.
Develop a fresh human situation or useful idea, not a paraphrase of a recent post.
Theme and visual cooldowns have already been enforced before this call.
Product cooldown relaxed for seasonal fit or limited catalog: ${rotation.productCooldownRelaxed}.
Choose only from the supplied eligible catalog. Explain actual rotation decisions honestly.

${occasionGuidance}

Below is the REAL current GreatFlowers product catalog.

CATALOG:
${JSON.stringify(catalog)}

LIVE GREATFLOWERS WEBSITE CONTEXT:

${JSON.stringify(liveWebsiteContext)}

LEGACY PRODUCT / OCCASION HISTORY:

${JSON.stringify(recentHistory.map((entry, i) => `${i + 1}. ${entry}`))}

CAMPAIGN ROTATION RULES:

1. PRODUCT ROTATION: avoid repeatedly choosing the same product.
   If a product appears 2+ times in the recent history, strongly prefer a different product
   UNLESS it is clearly the best strategic fit for the current date/occasion AND the catalog
   offers limited alternatives for that occasion.

2. OCCASION ROTATION: avoid repeatedly choosing the same primary occasion.
   If the recent campaigns heavily use the same occasion, prefer another strong and relevant
   occasion when appropriate.

Find a relevant campaign within the assigned content theme. Rotation constraints are required;
use strategic fit to choose between eligible products and ideas.


REAL GREATFLOWERS GA4 BEHAVIOR DATA:

${JSON.stringify(analytics)}

GA4 DATA RULES:

This data comes from actual GreatFlowers website behavior.

Metrics mean:

- views = product items viewed
- addToCarts = items added to cart
- checkouts = items entering checkout
- purchases = items purchased

The current analytics sample is still small
and product tracking was recently standardized.

Therefore:

- Treat GA4 data as supporting evidence only.
- Do not claim statistical significance.
- Do not claim trends from a small number of events.
- Do not assume products with zero activity are unpopular.
- Do not assume the product with the most views is the best product.
- Do not penalize products that have no analytics data yet.
- Do not make causal claims.

Use wording such as:
"early signal"
"limited data"
"worth testing"
"not enough evidence yet"

When useful GA4 evidence exists,
include it inside analyticsEvidence.

If the data is too limited,
return something like:
"Current GA4 data is too limited to materially influence this recommendation."

Zero activity must NOT be interpreted as poor performance.

WEBSITE CONTEXT RULES:

This content was fetched from the live GreatFlowers website.

Use it to understand:
- current promotions
- current seasonal messaging
- currently promoted categories/features
- feature availability
- current website positioning

IMPORTANT:

Live website information takes priority over older stored
GreatFlowers knowledge when they conflict.

If the website says a feature is unavailable,
coming soon, or still being set up,
do NOT recommend that feature for a conversion campaign.

Do not automatically generalize location-specific delivery
messages to the entire United States.

Delivery cutoff times, same-day eligibility, and location-specific
availability must be treated carefully unless their nationwide
scope is explicitly confirmed.

Do not recommend unavailable products or features.

TASK:

Choose exactly ONE product from this catalog that would be a strong candidate for the next marketing campaign.

Then determine:

1. Best relevant occasion
2. CREATIVE SCENARIO: a specific human situation, styling idea, educational topic or conversation fitting the assigned theme; never present an invented story as a real customer testimonial
3. Customer intent
4. Marketing angle
5. Audience
6. Recommended social platforms
7. Why this product should be tested

CREATIVE SCENARIO RULES:

Do NOT default to standard occasions like "Birthday" or "Anniversary" as the entire creative angle.
For gifting stories, devise a SPECIFIC HUMAN SITUATION that explains why someone would send flowers.
For other themes, develop a specific useful topic or scene without forcing a gift occasion.

GOOD creative scenarios (real, personal, specific):
- "Grandmother turning 80, family wants to make her feel celebrated after a quiet year"
- "Brother recovering from surgery, needs a morale boost during a long recovery"
- "Daughter moved away for college, parents sending flowers to help her feel at home"
- "Couple celebrating 25th anniversary together, rekindling the romance after busy years"
- "Friend going through a breakup, needs a reminder she's loved and supported"
- "Colleague earned a big promotion, team sending congratulations to celebrate the win"
- "Neighbor lost their cat, sending sympathy with a gentle, comforting arrangement"

BAD creative scenarios (generic, repetitive):
- "Birthday celebration"
- "Anniversary gift"
- "Sympathy flowers"
- "Get well soon"

The creativeScenario becomes the campaign's emotional hook. Make it vivid, specific, and emotionally compelling.

The occasion field (e.g., "Birthday", "Anniversary") is still required for tracking, but the creativeScenario is where the real thinking happens.

IMPORTANT RULES:

- Only choose a product that exists in the supplied catalog.
- Use the exact supplied product ID and product name.
- Do not invent product facts.
- Do not invent discounts.
- Do not invent delivery guarantees.
- Do not invent sales statistics.

PERFORMANCE DATA RULE:

GreatFlowers now has real GA4 behavior data,
but the current sample size is limited and tracking
was only recently standardized.

Therefore:

- Do not use ordersCount as a ranking signal.
- Use GA4 behavior only as supporting evidence.
- Catalog fit, occasion relevance, website context,
  campaign rotation, and marketing reasoning remain important.
- Do not declare winners or losers from small samples.
- Do not assume products with zero analytics activity are unpopular.
- Do not assume products with more views are automatically better.
- Recommendations should still be treated as experiments.

As more analytics data is collected,
behavioral signals can become more important.

Do NOT use sale price information.
Its business meaning has not been verified.

Seasonal or customer-behavior reasoning that is not supported directly by GreatFlowers data must go into "assumptions".

Choose recommendations for TESTING.
Do not claim that the recommendation is guaranteed to perform.

Return ONLY valid JSON.

No Markdown.
No code fences.
No explanation outside JSON.

EVIDENCE GENERATION RULES:

WEBSITE EVIDENCE (websiteEvidence):
- Must come only from the supplied LIVE GREATFLOWERS WEBSITE CONTEXT.
- State only verified facts observed on the website.
- Do not add recommendations, suggestions, or strategic ideas to website evidence.
- WRONG: "WELCOME10, which could be paired with a birthday campaign."
- RIGHT: "The live website currently displays a 10% first-order promotion using WELCOME10."
- Do not invent promotions, delivery claims, features or seasonal messaging.
- If website context did not meaningfully influence the decision, explicitly say so.

CATALOG EVIDENCE (catalogEvidence):
- Must come only from the supplied product catalog.
- Explain which verified product characteristics support the recommendation.
- Product name/id/category/price/description/availability can be used.
- Do not invent product characteristics.

ANALYTICS EVIDENCE (analyticsEvidence):
- Must come only from the supplied GA4 data.
- Explain which actual signals influenced the recommendation.
- If there is no useful analytics evidence, return:
  "Current GA4 data is too limited to materially influence this recommendation."
- Zero activity must NOT be interpreted as poor performance.

ROTATION EVIDENCE (rotationEvidence):
- Explain whether recent campaign product/occasion history influenced the selection.
- If a product appears 2+ times in recent history, note whether you avoided it or chose it anyway (and why).
- Do not claim rotation influenced the decision if it did not.
- Do not choose a weak/irrelevant product or occasion simply for variety.

ASSUMPTIONS (assumptions):
- Any reasoning not directly supported by website/catalog/GA4/history must appear here.
- Keep facts and assumptions clearly separated.

DECISION SUMMARY (decisionSummary):
- Return a concise business-friendly summary explaining:
  "Based on [actual evidence], this product + occasion + marketing angle is worth testing next."
- Do not present predicted performance as verified evidence.
- WRONG: "The visually striking product may generate stronger social engagement and click-through."
- RIGHT: "The visually distinctive product is worth testing for social engagement and click-through."
- Use "worth testing" framing, not performance claims.
- Any predicted outcome without GA4 data backing it must go in assumptions, not here.
- Do not reveal private/internal chain-of-thought.
- Only provide concise conclusions tied to supplied evidence.

Use exactly:

{
  "contentTheme": "${rotation.contentTheme}",
  "visualTreatment": "${rotation.visualTreatment}",
  "selectedProductId": 0,
  "selectedProductName": "string",
  "occasion": "string",
  "creativeScenario": "string",

  "audience": "string",

  "campaignGoal": "${rotation.campaignGoal}",

  "trafficSource": "Organic Social",

  "platforms": [
    "Instagram",
    "Facebook",
    "Pinterest",
    "X",
    "YouTube Shorts"
  ],

  "priority": "${rotation.priority}",

  "reasonForSelection": "string",

  "customerIntent": "string",

  "marketingAngle": "string",

  "decisionSummary": "string",

  "websiteEvidence": [
    "string"
  ],

  "catalogEvidence": [
    "string"
  ],

  "analyticsEvidence": [
    "string"
  ],

  "rotationEvidence": [
    "string"
  ],

  "assumptions": [
    "string"
  ],

  "additionalContext": "string"
}

CAMPAIGN FOCUS RULE:

Choose exactly ONE primary occasion or customer intent.

Do not combine many occasions into a single campaign.

Prefer a focused campaign with one clear customer reason to buy.

OCCASION PRIORITY:

1. If a CRITICAL or HIGH priority seasonal occasion is active (see CURRENT OCCASION CALENDAR above),
   STRONGLY prefer that occasion unless the catalog offers no suitable products for it.
   
2. Peak-phase occasions (≤7 days away) deserve extra attention within the assigned theme.

3. If no strong seasonal fit exists, choose a topic matching the assigned theme; evergreen occasions are only necessary for gifting stories.

4. Respect the assigned theme and visual treatment. Seasonal relevance must not collapse the feed back into repetitive gift posts.

Examples:

Good (Feb 10, Valentine's in 4 days):
Occasion: Valentine's Day

Good (no active seasonal occasion):
Occasion: Birthday

Bad (Valentine's in 4 days, but chose):
Occasion: Just Because

Bad (combining multiple):
Occasion: Birthday, Anniversary, Congratulations, Get Well Soon, New Baby

If a product fits many occasions, select the ONE occasion
that gives the strongest marketing angle for this campaign.

STRICT FACT RULE:

Clearly separate verified catalog facts from marketing hypotheses.

Verified catalog facts include only information directly supplied
in the product catalog.

Do not present consumer behavior, seasonal demand,
cultural associations, audience preferences,
conversion potential, or platform performance as facts.

For unsupported strategic reasoning, use wording such as:

- "may"
- "could"
- "we recommend testing"
- "hypothesis"
- "worth testing"

All campaign recommendations are experiments,
not guaranteed outcomes.

RECOMMENDATION REASON RULE:

reasonForSelection should primarily use verified catalog evidence.

Any inferred marketing reasoning must be clearly phrased
as a hypothesis using words such as "may", "could",
or "worth testing".

EVIDENCE RULES:

Facts directly available in the supplied catalog may be stated as facts.

Examples:
- product name
- product description
- price
- stock status
- categories
- product URL

Do not ask to verify information already supplied by the live catalog.

Do not infer consumer demand from how frequently a category
appears in the catalog.

Do not describe a price as:
"affordable",
"accessible",
"good value",
"budget friendly"
or similar unless this is explicitly framed as a hypothesis.

Do not claim that an occasion has steady, daily, seasonal,
growing, or high demand unless performance data supports it.

Catalog structure is not customer-behavior data.

When the reasoning is not directly supported by catalog facts,
put it in "assumptions".

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

  return requestHermesJSON(prompt, (output) => {
    const jsonText = extractJSON(output);
    const parsedJSON = parseModelJSON(jsonText);

    const recommendation =
      campaignRecommendationSchema.parse(parsedJSON);

    if (!rotation.candidates.some(product => product.id === recommendation.selectedProductId && product.name === recommendation.selectedProductName)) {
      throw new Error("Recommendation must select an eligible catalog product with its exact name");
    }
    if (recommendation.contentTheme !== rotation.contentTheme || recommendation.visualTreatment !== rotation.visualTreatment) {
      throw new Error("Recommendation did not follow the selected content rotation");
    }
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if ([...rotation.recent, ...rotation.published].some(entry =>
      entry.creativeScenario && normalize(entry.creativeScenario) === normalize(recommendation.creativeScenario)
    )) {
      throw new Error("Recommendation repeated a recent creative scenario");
    }
    recommendation.campaignGoal = rotation.campaignGoal;
    recommendation.priority = rotation.priority;

    console.log("\n================ AI DECISION ================\n");
    console.log(`PRODUCT:\n${recommendation.selectedProductName} (ID: ${recommendation.selectedProductId})\n`);
    console.log(`OCCASION:\n${recommendation.occasion}\n`);
    console.log(`MARKETING ANGLE:\n${recommendation.marketingAngle}\n`);
    console.log("WEBSITE EVIDENCE:");
    recommendation.websiteEvidence.forEach((e) => console.log(`- ${e}`));
    console.log("\nCATALOG EVIDENCE:");
    recommendation.catalogEvidence.forEach((e) => console.log(`- ${e}`));
    console.log("\nGA4 EVIDENCE:");
    recommendation.analyticsEvidence.forEach((e) => console.log(`- ${e}`));
    console.log("\nCAMPAIGN HISTORY / ROTATION:");
    recommendation.rotationEvidence.forEach((e) => console.log(`- ${e}`));
    console.log("\nASSUMPTIONS:");
    recommendation.assumptions.forEach((a) => console.log(`- ${a}`));
    console.log(`\nDECISION SUMMARY:\n${recommendation.decisionSummary}`);
    console.log("\n=============================================\n");

    return recommendation;
  }, signal);
}