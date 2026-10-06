import { z } from "zod";
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
You are the GreatFlowers recommendation API, not a conversational report writer.
Choose exactly ONE real product and a fresh campaign idea for a US flower business.
Use only the evidence supplied below. Do not load skills, tools, old brand knowledge,
or web research: live catalog, website, calendar, GA4 and history are already supplied.
Return a single complete JSON object matching the output schema. Every required field
must be present at the top level; no alternate field names or Markdown.

CURRENT DATE: ${today}
REQUIRED DIRECTION:
contentTheme: ${rotation.contentTheme}
visualTreatment: ${rotation.visualTreatment}
campaignGoal: ${rotation.campaignGoal}
priority: ${rotation.priority}
${rotation.guidance}

Choose the strongest eligible product fit within this direction. For non-gifting
content, occasion may be a topic such as Home Styling or Flower Care; creativeScenario
must be a specific useful idea, scene or question rather than a forced gifting story.
For gifting, create a specific hypothetical human situation, never a claimed customer testimonial.
Naturally promote GreatFlowers. Vary calls to action by goal: shopping for conversions,
discovery for awareness, saves/shares/comments for engagement.

${occasionGuidance}
Active high/critical holidays deserve extra weight within the assigned theme, without
turning every post into a gifting campaign. If no seasonal fit exists, use a relevant
non-seasonal topic. Do not combine multiple occasions in one campaign.

ELIGIBLE LIVE CATALOG:
${JSON.stringify(catalog)}

LIVE WEBSITE CONTEXT:
${JSON.stringify(liveWebsiteContext)}

GA4 PRODUCT BEHAVIOR (supporting evidence, small sample):
${JSON.stringify(analytics)}
views = product item views; addToCarts = additions to cart; checkouts = entering checkout;
purchases = purchases. Zero activity is not poor performance. No statistical significance,
causal claims, inferred popularity or guaranteed results. Do not rank using ordersCount.

RECENT RECOMMENDATIONS, NEWEST FIRST:
${JSON.stringify(rotation.recent)}
PUBLISHED CAMPAIGNS, NEWEST FIRST:
${JSON.stringify(rotation.published)}
LEGACY PRODUCT/OCCASION HISTORY:
${JSON.stringify(recentHistory)}
Avoid repeating scenarios, marketing angles and compositions in either history.
Theme and visual cooldowns are already enforced. Product cooldown relaxed for seasonal
fit or a limited catalog: ${rotation.productCooldownRelaxed}. Use only the eligible catalog.

FACT AND EVIDENCE RULES:
- selectedProductId must be a NUMBER from the eligible catalog; selectedProductName must
  match that product's supplied name exactly. These exact field names are mandatory.
- websiteEvidence contains only facts from LIVE WEBSITE CONTEXT, not strategic suggestions.
  Live website information takes priority over older information. Do not recommend unavailable
  features, assume nationwide delivery from local claims, or invent promotions or guarantees.
- catalogEvidence and reasonForSelection primarily use verified catalog characteristics.
  Do not invent species, product details, discounts, sale-price meaning or popularity.
- analyticsEvidence contains actual supplied signals. If insufficient, say:
  "Current GA4 data is too limited to materially influence this recommendation."
- rotationEvidence explains the actual assigned theme/visual cooldowns and history influence.
- assumptions contains unsupported strategic reasoning, clearly framed as hypotheses.
- decisionSummary gives concise evidence-linked conclusions: "worth testing", not predicted
  performance as fact. Do not reveal internal reasoning. Audience is a proposed target, not
  a verified demographic. Care advice must be reliable general advice, never guessed product facts.
- trafficSource is "Organic Social"; platforms must include "Instagram" and "Facebook".
- additionalContext may be empty; all other required evidence arrays must contain at least
  one factual observation or an explicit statement that evidence was insufficient.

Return the COMPLETE object using the exact output schema. In particular do not use
productId, productName or reasoning instead of selectedProductId, selectedProductName
and reasonForSelection, and do not omit the audience or evidence fields.
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
  }, signal, z.toJSONSchema(campaignRecommendationSchema));
}