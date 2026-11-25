import type { ProjectConfig } from "./projects/index.js";

// Reads this project's Meta settings (GreatFlowers: META_*, other projects: their own prefix).
function metaConfig(project: ProjectConfig) {
  const pageId = project.env("META_PAGE_ID");
  const instagramId = project.env("META_INSTAGRAM_ACCOUNT_ID");
  const accessToken = project.env("META_PAGE_ACCESS_TOKEN");
  if (
    !pageId ||
    !instagramId ||
    !accessToken
  ) {
    throw new Error(
      "Meta environment variables are missing"
    );
  }
  return {
    graphUrl: `https://graph.facebook.com/${project.env("META_GRAPH_VERSION") || "v25.0"}`,
    pageId,
    instagramId,
    accessToken,
  };
}

async function graphGet(
  meta: ReturnType<typeof metaConfig>,
  path: string
) {
  const url = new URL(
    `${meta.graphUrl}/${path}`
  );

  url.searchParams.set(
    "access_token",
    meta.accessToken
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

export async function getMetaConnectionStatus(project: ProjectConfig) {
  const meta = metaConfig(project);

  const [facebook, instagram] =
    await Promise.all([
      graphGet(
        meta,
        `${meta.pageId}?fields=id,name`
      ),

      graphGet(
        meta,
        `${meta.instagramId}?fields=id,username,name`
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