import type {
  SavedCampaign,
} from "./campaign.store.js";
import {
  prepareInstagramImage,
  prepareFacebookImage,
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

function resolveSelectedCreatives(
  campaign: SavedCampaign
): Array<{ imageUrl: string; type: string }> {
  // Priority 1: selectedCreatives (new multi-select format)
  if (campaign.selectedCreatives && campaign.selectedCreatives.length > 0) {
    // Sort by order without mutating original array
    return [...campaign.selectedCreatives]
      .sort((a, b) => a.order - b.order)
      .map(c => ({ imageUrl: c.imageUrl, type: c.type }));
  }

  // Priority 2: selectedCreative (legacy single-select format)
  if (campaign.selectedCreative) {
    return [{
      imageUrl: campaign.selectedCreative.imageUrl,
      type: campaign.selectedCreative.type
    }];
  }

  // Priority 3: No selection - return empty array (will use product fallback)
  return [];
}

async function resolveImageUrl(
  prepareImage: (url: string) => Promise<string>,
  selectedCreativeUrl: string | undefined,
  productImageUrl: string | null | undefined
): Promise<string> {
  const candidateUrls: string[] = [];
  if (selectedCreativeUrl) {
    candidateUrls.push(selectedCreativeUrl);
  }
  if (productImageUrl) {
    candidateUrls.push(productImageUrl);
  }

  for (let i = 0; i < candidateUrls.length; i++) {
    const url = candidateUrls[i];

    if (!url) {
      continue;
    }

    try {
      const preparedUrl = await prepareImage(url);
      console.log(
        `✅ Prepared image for publishing: ${preparedUrl}`
      );
      return preparedUrl;
    } catch (error) {
      console.warn(
        `⚠️ Failed to prepare image ${url}:`,
        error
      );

      // If this is the last candidate, return the original URL
      // as a last resort so the flow doesn't stop.
      if (i === candidateUrls.length - 1) {
        console.warn(
          `🔄 Falling back to original image URL: ${url}`
        );
        return url;
      }
    }
  }

  throw new Error(
    "No image URL available for publishing"
  );
}

export function formatHashtags(
  hashtags: string[] | undefined
): string {
  if (!hashtags || hashtags.length === 0) {
    return "";
  }

  return hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) =>
      tag.startsWith("#") ? tag : `#${tag}`
    )
    .join(" ");
}

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

async function createInstagramCarouselChildContainer(
  instagramId: string,
  imageUrl: string
): Promise<string> {
  console.log(`[Instagram Carousel] Creating child container for: ${imageUrl}`);

  const result = await graphPost(
    `${instagramId}/media`,
    {
      image_url: imageUrl,
      is_carousel_item: "true",
    }
  );

  if (!result.id) {
    throw new Error("Instagram carousel child container was not created.");
  }

  console.log(`[Instagram Carousel] Child container created: ${result.id}`);
  return result.id;
}

async function createInstagramCarouselParentContainer(
  instagramId: string,
  childContainerIds: string[],
  caption: string
): Promise<string> {
  console.log(
    `[Instagram Carousel] Creating parent container with ${childContainerIds.length} children`
  );

  const result = await graphPost(
    `${instagramId}/media`,
    {
      media_type: "CAROUSEL",
      children: childContainerIds.join(","),
      caption,
    }
  );

  if (!result.id) {
    throw new Error("Instagram carousel parent container was not created.");
  }

  console.log(`[Instagram Carousel] Parent container created: ${result.id}`);
  return result.id;
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

async function publishInstagramCarousel(
  campaign: SavedCampaign,
  selectedCreatives: Array<{ imageUrl: string; type: string }>
): Promise<{
  platform: string;
  published: boolean;
  mediaId: string;
  imageUrls: string[];
}> {
  if (!instagramId) {
    throw new Error("META_INSTAGRAM_ACCOUNT_ID is missing.");
  }

  const instagram = campaign.strategy.platformContent.instagram;

  if (!instagram) {
    throw new Error("Campaign does not contain Instagram content.");
  }

  console.log(
    `[Instagram Carousel] Publishing ${selectedCreatives.length} images in order`
  );

  // Step 1: Prepare all images
  const preparedImages: Array<{ url: string; type: string }> = [];

  for (const creative of selectedCreatives) {
    try {
      const preparedUrl = await prepareInstagramImage(creative.imageUrl);
      preparedImages.push({ url: preparedUrl, type: creative.type });
      console.log(
        `[Instagram Carousel] Prepared ${creative.type}: ${preparedUrl}`
      );
    } catch (error) {
      console.error(
        `[Instagram Carousel] Failed to prepare ${creative.type}:`,
        error
      );
      throw new Error(
        `Failed to prepare carousel image for ${creative.type}: ${error}`
      );
    }
  }

  // Step 2: Create child containers for each image
  const childContainerIds: string[] = [];

  for (const image of preparedImages) {
    try {
      const childId = await createInstagramCarouselChildContainer(
        instagramId,
        image.url
      );
      childContainerIds.push(childId);
    } catch (error) {
      console.error(
        `[Instagram Carousel] Failed to create child container for ${image.type}:`,
        error
      );
      throw new Error(
        `Failed to create carousel child container for ${image.type}: ${error}`
      );
    }
  }

  // Step 3: Wait for all child containers to be ready
  console.log(
    `[Instagram Carousel] Waiting for ${childContainerIds.length} child containers to be ready`
  );

  for (let i = 0; i < childContainerIds.length; i++) {
    const childId = childContainerIds[i];
    const imageType = preparedImages[i]?.type || `image ${i + 1}`;

    try {
      if (!childId) {
        throw new Error(`Child container ID ${i + 1} is missing`);
      }
      await waitForInstagramContainer(childId);
      console.log(
        `[Instagram Carousel] Child container ${i + 1}/${childContainerIds.length} (${imageType}) is ready`
      );
    } catch (error) {
      console.error(
        `[Instagram Carousel] Child container ${childId} (${imageType}) failed:`,
        error
      );
      throw new Error(
        `Carousel child container ${childId} (${imageType}) failed: ${error}`
      );
    }
  }

  // Step 4: Create parent carousel container
  const caption = [instagram.caption, formatHashtags(instagram.hashtags)]
    .filter(Boolean)
    .join("\n\n");

  const carouselContainerId = await createInstagramCarouselParentContainer(
    instagramId,
    childContainerIds,
    caption
  );

  // Step 5: Wait for parent carousel container to be ready
  console.log(
    `[Instagram Carousel] Waiting for parent carousel container to be ready`
  );

  try {
    await waitForInstagramContainer(carouselContainerId);
  } catch (error) {
    console.error(
      `[Instagram Carousel] Parent carousel container failed:`,
      error
    );
    throw new Error(`Carousel parent container failed: ${error}`);
  }

  // Step 6: Publish the carousel
  console.log(`[Instagram Carousel] Publishing carousel`);

  const result = await publishInstagramContainer(
    instagramId,
    carouselContainerId
  );

  console.log(
    `[Instagram Carousel] Successfully published carousel with ${selectedCreatives.length} images`
  );

  return {
    platform: "instagram",
    published: true,
    mediaId: result.id,
    imageUrls: preparedImages.map((img) => img.url),
  };
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

  const productImage = campaign.selectedProduct?.image;

  if (!productImage) {
    throw new Error(
      "Campaign does not have a product image. A product image is required to publish."
    );
  }

  const productUrl = campaign.selectedProduct?.url || "";

  const message = [
    facebook.post,
    productUrl,
    facebook.cta || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Use selected creative image if available, fall back to product image
  const imageUrl = await resolveImageUrl(
    prepareFacebookImage,
    campaign.selectedCreative?.imageUrl,
    productImage
  );

  const result = await graphPost(
    `${pageId}/photos`,
    {
      message,
      url: imageUrl,
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

  const productImage = campaign.selectedProduct?.image;

  if (!productImage) {
    throw new Error(
      "Campaign does not have a product image. A product image is required to publish."
    );
  }

  if (!instagramId) {
    throw new Error(
      "META_INSTAGRAM_ACCOUNT_ID is missing."
    );
  }

  // Resolve selected creatives with priority logic
  const selectedCreatives = resolveSelectedCreatives(campaign);

  // Route based on number of selected creatives
  if (selectedCreatives.length >= 2) {
    // Multi-image: Use carousel publishing
    console.log(
      `[Instagram] Publishing carousel with ${selectedCreatives.length} images`
    );
    return await publishInstagramCarousel(campaign, selectedCreatives);
  }

  // Single image or fallback: Use existing single-image flow
  console.log("[Instagram] Publishing single image");

  // Use selected creative image if available, fall back to product image
  const imageUrl = await resolveImageUrl(
    prepareInstagramImage,
    selectedCreatives[0]?.imageUrl,
    productImage
  );

  const caption = [
    instagram.caption,
    formatHashtags(instagram.hashtags),
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
