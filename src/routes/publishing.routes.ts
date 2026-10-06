import { publishFacebook, publishInstagram, formatHashtags } from "../meta.publisher.js";
import { withCampaignPublishing, getCampaignById, updateCampaign } from "../campaign.store.js";
import { prepareInstagramImage } from "../meta.image.js";
import express from "express";

const router = express.Router();

router.get(
  "/api/campaigns/:id/meta-preview",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      if (campaign.status !== "approved") {
        return res.status(400).json({
          success: false,
          error:
            "Campaign must be approved before publishing",
        });
      }

      const facebook =
        campaign.strategy.platformContent.facebook;

      const instagram =
        campaign.strategy.platformContent.instagram;

      return res.json({
        success: true,

        campaignId: campaign.id,

        product: campaign.selectedProduct
          ? {
              id: campaign.selectedProduct.id,
              name: campaign.selectedProduct.name,
              url: campaign.selectedProduct.url,
              image: campaign.selectedProduct.image,
            }
          : null,

        facebook: facebook
          ? {
              message: [
                facebook.post,
                facebook.cta || "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : null,

        instagram: instagram
          ? {
              caption: [
                instagram.caption,
                formatHashtags(instagram.hashtags),
                campaign.selectedProduct?.url || "",
              ]
                .filter(Boolean)
                .join("\n\n"),

              image:
                campaign.selectedProduct?.image ||
                null,
            }
          : null,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to create Meta preview",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

router.post(
  "/api/campaigns/:id/publish/facebook",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      if (campaign.status !== "approved") {
        return res.status(400).json({
          success: false,
          error:
            "Campaign must be approved before publishing",
        });
      }

      const result =
        await withCampaignPublishing(campaign.id, publishFacebook, "facebook");

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      console.error(
        "Facebook publishing failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Facebook publishing failed",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

router.post(
  "/api/campaigns/:id/publish/instagram",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      if (campaign.status !== "approved") {
        return res.status(400).json({
          success: false,
          error:
            "Campaign must be approved before publishing",
        });
      }

      const result =
        await withCampaignPublishing(campaign.id, publishInstagram, "instagram");

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      console.error(
        "Instagram publishing failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Instagram publishing failed",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

router.post(
  "/api/campaigns/:id/schedule",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(
          req.params.id
        );

      if (!campaign) {
        return res
          .status(404)
          .json({
            success: false,
            error:
              "Campaign not found",
          });
      }

      if (
        campaign.status !==
        "approved"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Only approved campaigns can be scheduled",
          });
      }

      const {
        scheduledAt,
        timezone =
          "America/Los_Angeles",
        platforms = [
          "facebook",
          "instagram",
        ],
        recurrence =
          "none",
        maxAttempts = 3,
      } = req.body;

      if (!scheduledAt) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "scheduledAt is required",
          });
      }

      const scheduledDate =
        new Date(scheduledAt);

      if (
        Number.isNaN(
          scheduledDate.getTime()
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Invalid scheduledAt",
          });
      }

      if (
        scheduledDate.getTime() <=
        Date.now()
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Schedule must be in the future",
          });
      }

      const allowedPlatforms = [
        "facebook",
        "instagram",
      ];

      const selectedPlatforms =
        platforms.filter(
          (platform: string) =>
            allowedPlatforms.includes(
              platform
            )
        );

      if (
        selectedPlatforms.length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Select at least one platform",
          });
      }

      if (
        ![
          "none",
          "daily",
          "weekly",
        ].includes(recurrence)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Invalid recurrence",
          });
      }

      const updated =
        await updateCampaign(
          campaign.id,
          {
            scheduledAt:
              scheduledDate.toISOString(),

            scheduledTimezone:
              timezone,

            scheduledPlatforms:
              selectedPlatforms,

            scheduleRecurrence:
              recurrence,

            publishStatus:
              "scheduled",

            publishAttempts: 0,

            maxPublishAttempts:
              maxAttempts,
          }
        );

      return res.json({
        success: true,
        campaign: updated,
      });
    } catch (error) {
      console.error(
        "Schedule failed:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            "Failed to schedule campaign",
        });
    }
  }
);

router.patch(
  "/api/campaigns/:id/schedule",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(
          req.params.id
        );

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error:
            "Campaign not found",
        });
      }

      if (
        campaign.status !==
        "approved"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Only approved campaigns can be scheduled",
        });
      }

      const {
        scheduledAt,
        timezone,
        platforms,
        recurrence,
      } = req.body;

      const updates: Partial<
        typeof campaign
      > = {
        publishStatus:
          "scheduled",
      };

      if (scheduledAt) {
        const date =
          new Date(scheduledAt);

        if (
          Number.isNaN(
            date.getTime()
          ) ||
          date.getTime() <=
            Date.now()
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Invalid schedule time",
          });
        }

        updates.scheduledAt =
          date.toISOString();
      }

      if (timezone) {
        updates.scheduledTimezone =
          timezone;
      }

      if (platforms) {
        updates.scheduledPlatforms =
          platforms;
      }

      if (recurrence) {
        updates.scheduleRecurrence =
          recurrence;
      }

      const updated =
        await updateCampaign(
          campaign.id,
          updates
        );

      return res.json({
        success: true,
        campaign: updated,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error:
          "Failed to reschedule campaign",
      });
    }
  }
);

router.post(
  "/api/campaigns/:id/schedule/cancel",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(
          req.params.id
        );

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error:
            "Campaign not found",
        });
      }

      const updated =
        await updateCampaign(
          campaign.id,
          {
            publishStatus:
              "cancelled",
          }
        );

      return res.json({
        success: true,
        campaign: updated,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error:
          "Failed to cancel schedule",
      });
    }
  }
);

router.get("/api/meta/test-image", async (req, res) => {
  try {
    const originalImage =
      "https://greatflowers.s3.us-west-2.amazonaws.com/products/img/european-meadow.webp";

    const instagramImage =
      await prepareInstagramImage(originalImage);

    return res.json({
      success: true,
      originalImage,
      instagramImage,
    });
  } catch (error) {
    console.error("Instagram image test failed:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

export default router;
