import type {
  SavedCampaign,
} from "./campaign.store.js";
import {
  prepareInstagramImage,
} from "./meta.image.js";

const GRAPH_VERSION =
  process.env.META_GRAPH_VERSION || "v25.0";

const GRAPH_URL =
  `https://graph.facebook.com/${GRAPH_VERSION}`;

  const instagramId =
  process.env.META_INSTAGRAM_ACCOUNT_ID;

const pageId =
  process.env.META_PAGE_ID;

const accessToken =
  process.env.META_PAGE_ACCESS_TOKEN;

function ensureMetaConfig() {
  if (!pageId || !accessToken) {
    throw new Error(
      "Meta environment variables are missing"
    );
  }
}

async function graphPost(
  path: string,
  body: Record<string, string>
) {
  ensureMetaConfig();

  const form = new URLSearchParams({
    ...body,
    access_token: accessToken!,
  });

  const response = await fetch(
    `${GRAPH_URL}/${path}`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },

      body: form,
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message ||
        "Meta publishing request failed"
    );
  }

  return data;
}

export async function publishFacebook(
  campaign: SavedCampaign
) {
  if (campaign.status !== "approved") {
    throw new Error(
      "Campaign must be approved before publishing."
    );
  }

  const facebook =
    campaign.strategy.platformContent.facebook;

  if (!facebook) {
    throw new Error(
      "Campaign does not contain Facebook content."
    );
  }

  // No duplicate product URL here.
  const message = [
    facebook.post,
    facebook.cta || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await graphPost(
    `${pageId}/feed`,
    {
      message,

      // Product URL is supplied separately as Facebook link.
      ...(campaign.selectedProduct?.url
        ? {
            link: campaign.selectedProduct.url,
          }
        : {}),
    }
  );

  return {
    platform: "facebook",
    published: true,
    postId: result.id,
  };
}

export async function publishInstagram(
  campaign: SavedCampaign
) {
  if (campaign.status !== "approved") {
    throw new Error(
      "Campaign must be approved before publishing."
    );
  }

  const instagram =
    campaign.strategy.platformContent.instagram;

  if (!instagram) {
    throw new Error(
      "Campaign does not contain Instagram content."
    );
  }

  const originalImage =
    campaign.selectedProduct?.image;

  if (!originalImage) {
    throw new Error(
      "Campaign does not have a product image."
    );
  }

  if (!instagramId) {
    throw new Error(
      "META_INSTAGRAM_ACCOUNT_ID is missing."
    );
  }

  // WebP → JPEG → public S3 URL
  const imageUrl =
    await prepareInstagramImage(originalImage);

  const caption = [
    instagram.caption,
    instagram.hashtags?.join(" ") || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Create Instagram media container
  const container = await graphPost(
    `${instagramId}/media`,
    {
      image_url: imageUrl,
      caption,
    }
  );

  if (!container.id) {
    throw new Error(
      "Instagram media container was not created."
    );
  }

  // Publish the container
  const result = await graphPost(
    `${instagramId}/media_publish`,
    {
      creation_id: container.id,
    }
  );

  return {
    platform: "instagram",
    published: true,
    mediaId: result.id,
    imageUrl,
  };
}
