import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ProjectConfig } from "./types.js";

export interface ProjectS3Settings {
  bucket: string | undefined;
  region: string | undefined;
  // Generated creatives and story slides.
  creativePrefix: string;
  // Images prepared for Meta publishing.
  campaignPrefix: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
}

// A marketing prefix must never be empty or point into the storefront's public media, because the
// campaign-delete path removes every object it considers its own.
function safePrefix(project: ProjectConfig, prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, "");
  if (!trimmed || /^public(\/|$)/i.test(trimmed)) {
    throw new Error(`Unsafe S3 marketing prefix "${prefix}" for project ${project.id}; use a dedicated folder such as marketing/campaign`);
  }
  return prefix;
}

export function s3Settings(project: ProjectConfig): ProjectS3Settings {
  return {
    bucket: project.env("AWS_S3_BUCKET"),
    region: project.env("AWS_REGION"),
    creativePrefix: safePrefix(project, project.env("AWS_S3_CREATIVE_PREFIX") || project.s3.defaultPrefix),
    campaignPrefix: safePrefix(project, project.env("AWS_S3_CAMPAIGN_PREFIX") || project.s3.defaultPrefix),
    accessKeyId: project.env("AWS_ACCESS_KEY_ID"),
    secretAccessKey: project.env("AWS_SECRET_ACCESS_KEY"),
  };
}

export const s3PublicUrl = (settings: ProjectS3Settings, key: string) =>
  `https://${settings.bucket}.s3.${settings.region}.amazonaws.com/${key}`;

export function createProjectS3Client(settings: ProjectS3Settings, fallbackRegion?: string): S3Client {
  const region = settings.region || fallbackRegion;
  return new S3Client({
    ...(region ? { region } : {}),
    ...(settings.accessKeyId && settings.secretAccessKey
      ? { credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey } }
      : {}),
  });
}

const clients = new Map<string, S3Client>();

function projectS3Client(project: ProjectConfig): S3Client {
  let client = clients.get(project.id);
  if (!client) {
    client = createProjectS3Client(s3Settings(project));
    clients.set(project.id, client);
  }
  return client;
}

// Uploads one marketing image to the project's bucket and returns its public URL.
export async function uploadProjectImage(
  project: ProjectConfig,
  purpose: "creative" | "campaign",
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const settings = s3Settings(project);
  const key = `${purpose === "campaign" ? settings.campaignPrefix : settings.creativePrefix}/${filename}`;
  await projectS3Client(project).send(new PutObjectCommand({ Bucket: settings.bucket, Key: key, Body: body, ContentType: contentType }));
  return s3PublicUrl(settings, key);
}
