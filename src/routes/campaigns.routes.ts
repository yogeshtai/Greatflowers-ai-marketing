import { getGreatFlowersProducts } from "../greatflowers.products.js";
import { getCampaigns, deleteCampaign, getCampaignById, saveCampaign, updateCampaignStatus, updateCampaign } from "../campaign.store.js";
import { z } from "zod";
import { generateMarketingStrategy } from "../hermes.js";
import { singleFlight } from "../http.helpers.js";
import { campaignSchema } from "./campaign.schema.js";
import express from "express";

const router = express.Router();

router.post("/api/strategies/generate", singleFlight("strategy", async (req, res) => {
  try {
    const parsed = campaignSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign input",
        details: parsed.error.flatten(),
      });
    }

    const strategy = await generateMarketingStrategy(parsed.data);

    return res.json({
      success: true,
      strategy,
    });
  } catch (error) {
    console.error("Strategy generation failed:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to generate marketing strategy",
    });
  }
}));

router.post("/api/campaigns", async (req, res) => {
  try {
    const {
      input,
      strategy,
      selectedProduct,
      creatives,
      selectedCreative,
      selectedCreatives,
      storyPlan,
      storyConcept,
      storyVisualContinuity,
      storyCreatives,
      selectedStoryCarousel,
    } = req.body;

    if (!input || !strategy) {
      return res.status(400).json({
        success: false,
        error: "Input and strategy are required",
      });
    }

    const campaign = await saveCampaign(
      input,
      strategy,
      selectedProduct,
      creatives,
      selectedCreative,
      selectedCreatives,
      {
        storyPlan,
        storyConcept,
        storyVisualContinuity,
        storyCreatives,
        selectedStoryCarousel,
      }
    );

    return res.status(201).json({
      success: true,
      campaign,
    });
  } catch (error) {
    console.error(
      "Save campaign failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Failed to save campaign",
    });
  }
});

router.delete("/api/campaigns/:id", async (req, res) => {
  try {
    const deleted = await deleteCampaign(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: "Campaign not found" });
    return res.json({ success: true });
  } catch (error) {
    console.error("Campaign deletion failed:", error);
    const publishing = error instanceof Error && error.message.startsWith("Campaign is publishing");
    return res.status(publishing ? 409 : 500).json({ success: false,
      error: publishing ? error.message : "Could not finish deleting campaign assets. The campaign remains saved for retry; its schedule is cancelled." });
  }
});

router.get("/api/campaigns", async (_req, res) => {
  try {
    const campaigns = await getCampaigns();

    return res.json({
      success: true,
      campaigns,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to get campaigns",
    });
  }
});

router.get(
  "/api/campaigns/:id",
  async (req, res) => {
    const campaign = await getCampaignById(
      req.params.id
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      campaign,
    });
  }
);

router.put(
  "/api/campaigns/:id",
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        input,
        strategy,
        selectedProduct,
        creatives,
        selectedCreative,
        selectedCreatives,
        storyPlan,
        storyConcept,
        storyVisualContinuity,
        storyCreatives,
        selectedStoryCarousel,
      } = req.body;

      const campaign = await updateCampaign(id, {
        ...(input ? { input } : {}),
        ...(strategy ? { strategy } : {}),
        ...(selectedProduct
          ? { selectedProduct }
          : {}),
        ...(creatives ? { creatives } : {}),
        ...(selectedCreative
          ? { selectedCreative }
          : {}),
        ...(selectedCreatives
          ? { selectedCreatives }
          : {}),
        ...(storyPlan !== undefined ? { storyPlan } : {}),
        ...(storyConcept !== undefined
          ? { storyConcept }
          : {}),
        ...(storyVisualContinuity !== undefined
          ? { storyVisualContinuity }
          : {}),
        ...(storyCreatives !== undefined
          ? { storyCreatives }
          : {}),
        ...(selectedStoryCarousel !== undefined
          ? { selectedStoryCarousel }
          : {}),
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      return res.json({
        success: true,
        campaign,
      });
    } catch (error) {
      console.error("Update campaign failed:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to update campaign",
      });
    }
  }
);

router.patch(
  "/api/campaigns/:id/status",
  async (req, res) => {
    const status = req.body.status;

    if (
      !["draft", "approved", "rejected"].includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign status",
      });
    }

    const campaign =
      await updateCampaignStatus(
        req.params.id,
        status
      );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      campaign,
    });
  }
);

router.get(
  "/api/greatflowers/products",
  async (_req, res) => {
    try {
      const products =
        await getGreatFlowersProducts();

      return res.json({
        success: true,
        count: products.length,
        products,
      });
    } catch (error) {
      console.error(
        "GreatFlowers products failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to fetch GreatFlowers products",
      });
    }
  }
);

export default router;
