import cron from "node-cron";

import {
  getCampaigns,
  updateCampaign,
  withCampaignPublishing,
} from "./campaign.store.js";

import {
  publishFacebook,
  publishInstagram,
  ensureInstagramPostingGap,
  InstagramCooldownError,
} from "./meta.publisher.js";

let schedulerRunning = false;

function getNextSchedule(
  current: string,
  recurrence:
    | "none"
    | "daily"
    | "weekly"
) {
  if (recurrence === "none") {
    return null;
  }

  const next =
    new Date(current);

  if (recurrence === "daily") {
    next.setUTCDate(
      next.getUTCDate() + 1
    );
  }

  if (recurrence === "weekly") {
    next.setUTCDate(
      next.getUTCDate() + 7
    );
  }

  return next.toISOString();
}

async function processScheduledCampaigns() {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;

  try {
    const campaigns =
      await getCampaigns();

    const now = Date.now();

    const dueCampaigns =
      campaigns.filter(
        (campaign) =>
          campaign.status ===
            "approved" &&
          campaign.publishStatus ===
            "scheduled" &&
          Boolean(
            campaign.scheduledAt
          ) &&
          new Date(
            campaign.scheduledAt!
          ).getTime() <= now
      );

    for (const campaign of dueCampaigns) {
      try {
        console.log(
          `Publishing scheduled campaign: ${campaign.id}`
        );

        const claimed = await updateCampaign(
          campaign.id,
          {
            publishStatus:
              "publishing",
          }
        );

        if (!claimed || claimed.publishStatus !== "publishing") continue;

        const platforms =
          claimed.scheduledPlatforms ??
          [
            "facebook",
            "instagram",
          ];

        const publishedPlatforms = [...new Set(claimed.publishCyclePlatforms ?? [])];

        // Check Instagram before publishing either platform so a recent manual
        // Instagram post delays the entire campaign instead of splitting it.
        if (
          platforms.includes("instagram") &&
          !publishedPlatforms.includes("instagram") &&
          claimed.strategy.platformContent.instagram
        ) {
          await ensureInstagramPostingGap();
        }

        if (
          platforms.includes(
            "facebook"
          ) &&
          !publishedPlatforms.includes("facebook") &&
          claimed.strategy
            .platformContent.facebook
        ) {
          await withCampaignPublishing(claimed.id, publishFacebook, "facebook");

          publishedPlatforms.push(
            "facebook"
          );
        }

        if (
          platforms.includes(
            "instagram"
          ) &&
          !publishedPlatforms.includes("instagram") &&
          claimed.strategy
            .platformContent.instagram
        ) {
          await withCampaignPublishing(claimed.id, publishInstagram, "instagram");

          publishedPlatforms.push(
            "instagram"
          );
        }

        const recurrence =
          campaign.scheduleRecurrence ??
          "none";

        const nextSchedule =
          campaign.scheduledAt
            ? getNextSchedule(
                campaign.scheduledAt,
                recurrence
              )
            : null;

        if (nextSchedule) {
          await updateCampaign(
            campaign.id,
            {
              publishStatus:
                "scheduled",

              scheduledAt:
                nextSchedule,

              publishedAt:
                new Date().toISOString(),

              publishedPlatforms,

              publishCyclePlatforms: [],

              publishAttempts: 0,
            }
          );
        } else {
          await updateCampaign(
            campaign.id,
            {
              publishStatus:
                "published",

              publishedAt:
                new Date().toISOString(),

              publishedPlatforms,

              publishCyclePlatforms: [],

              publishAttempts: 0,
            }
          );
        }

        console.log(
          `Campaign publish complete: ${campaign.id}`
        );
      } catch (error) {
        console.error(
          `Campaign publish failed: ${campaign.id}`,
          error
        );

        if (error instanceof InstagramCooldownError) {
          await updateCampaign(campaign.id, {
            publishStatus: "scheduled",
            scheduledAt: error.retryAt.toISOString(),
            publishError: error.message,
          });
          console.log(`Instagram cooldown rescheduled campaign ${campaign.id} for ${error.retryAt.toISOString()}`);
          continue;
        }

        const attempts =
          (campaign.publishAttempts ??
            0) + 1;

        const maxAttempts =
          campaign.maxPublishAttempts ??
          3;

        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          attempts >= maxAttempts
        ) {
          await updateCampaign(
            campaign.id,
            {
              publishStatus:
                "failed",

              publishAttempts:
                attempts,

              publishError:
                errorMessage,
            }
          );

          continue;
        }

        await updateCampaign(
          campaign.id,
          {
            publishStatus:
              "scheduled",

            publishAttempts:
              attempts,

            publishError:
              errorMessage,

            scheduledAt:
              new Date(
                Date.now() +
                  15 *
                    60 *
                    1000
              ).toISOString(),
          }
        );

        console.log(
          `Retry ${attempts}/${maxAttempts} scheduled for campaign ${campaign.id}`
        );
      }
    }
  } finally {
    schedulerRunning = false;
  }
}

export function startCampaignScheduler() {
  console.log(
    "🕒 Campaign scheduler started"
  );

  cron.schedule(
    "* * * * *",
    () => {
      void processScheduledCampaigns();
    }
  );
}
