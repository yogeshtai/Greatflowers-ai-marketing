import { generateMarketingStrategy } from "./hermes.js";

async function main() {
  const strategy = await generateMarketingStrategy({
    campaignGoal: "Generate orders",
    product: "Build Your Bouquet",
    occasion: "Anniversary",
    audience: "US customers",
    trafficSource: "Organic Social",
    platforms: [
      "Instagram",
      "Facebook",
      "Pinterest",
      "X",
      "YouTube Shorts",
    ],
    priority: "Conversions",
    additionalContext: "None",
  });

  console.log("\n🌸 GREATFLOWERS MARKETING STRATEGY\n");
  console.log(strategy);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
