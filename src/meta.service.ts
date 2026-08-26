const GRAPH_VERSION =
  process.env.META_GRAPH_VERSION || "v25.0";

const GRAPH_URL =
  `https://graph.facebook.com/${GRAPH_VERSION}`;

const pageId =
  process.env.META_PAGE_ID;

const instagramId =
  process.env.META_INSTAGRAM_ACCOUNT_ID;

const accessToken =
  process.env.META_PAGE_ACCESS_TOKEN;

function ensureConfig() {
  if (
    !pageId ||
    !instagramId ||
    !accessToken
  ) {
    throw new Error(
      "Meta environment variables are missing"
    );
  }
}

async function graphGet(
  path: string
) {
  ensureConfig();

  const url = new URL(
    `${GRAPH_URL}/${path}`
  );

  url.searchParams.set(
    "access_token",
    accessToken!
  );

  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message ||
        "Meta API request failed"
    );
  }

  return data;
}

export async function getMetaConnectionStatus() {
  ensureConfig();

  const [facebook, instagram] =
    await Promise.all([
      graphGet(
        `${pageId}?fields=id,name`
      ),

      graphGet(
        `${instagramId}?fields=id,username,name`
      ),
    ]);

  return {
    facebook: {
      connected: true,
      id: facebook.id,
      name: facebook.name,
    },

    instagram: {
      connected: true,
      id: instagram.id,
      username: instagram.username,
      name: instagram.name,
    },
  };
}