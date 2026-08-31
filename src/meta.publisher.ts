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

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function formatMetaError(data: any) {
  if (!data?.error) {
    return "Meta API request failed";
  }

  const error = data.error;

  return [
    error.message,
    error.type ? `type=${error.type}` : "",
    error.code !== undefined
      ? `code=${error.code}`
      : "",
    error.error_subcode !== undefined
      ? `subcode=${error.error_subcode}`
      : "",
    error.fbtrace_id
      ? `fbtrace_id=${error.fbtrace_id}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
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
    throw new Error(formatMetaError(data));
  }

  return data;
}

async function getInstagramContainerStatus(
  containerId: string
) {
  ensureMetaConfig();

  const url = new URL(
    `${GRAPH_URL}/${containerId}`
  );

  url.searchParams.set(
    "fields",
    "id,status_code,status"
  );

  url.searchParams.set(
    "access_token",
    accessToken!
  );

  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(formatMetaError(data));
  }

  return data;
}

async function waitForInstagramContainer(
  containerId: string
) {
  const maxAttempts = 10;
  const delayMs = 3000;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const status =
      await getInstagramContainerStatus(
        containerId
      );

    console.log(
      `[Instagram] Container ${containerId} status:`,
      status.status_code,
      status.status
    );

    if (status.status_code === "FINISHED") {
      return;
    }

    if (
      status.status_code === "ERROR" ||
      status.status_code === "EXPIRED"
    ) {
      throw new Error(
        `Instagram container failed: ${status.status || status.status_code
        }`
      );
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Instagram container ${containerId} did not become ready in time.`
  );
}

async function publishInstagramContainer(
  instagramId: string,
  containerId: string
) {
  const maxAttempts = 3;

  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      console.log(
        `[Instagram] Publishing container ${containerId}, attempt ${attempt}/${maxAttempts}`
      );

      return await graphPost(
        `${instagramId}/media_publish`,
        {
          creation_id: containerId,
        }
      );
    } catch (error) {
      lastError = error;

      console.error(
        `[Instagram] Publish attempt ${attempt} failed:`,
        error
      );

      if (attempt < maxAttempts) {
        await sleep(3000 * attempt);
      }
    }
  }

  throw lastError;
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

  // Wait until Meta confirms the media is ready.
  await waitForInstagramContainer(
    container.id
  );

  // Publish with retry protection for transient Meta failures.
  const result =
    await publishInstagramContainer(
      instagramId,
      container.id
    );

  return {
    platform: "instagram",
    published: true,
    mediaId: result.id,
    imageUrl,
  };
}
