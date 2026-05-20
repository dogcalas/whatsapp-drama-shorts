import type { Script } from "../types/script.ts";
import { hostVideo } from "./video-host.ts";

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? "v21.0";

export interface InstagramUploadResult {
  mediaId: string;
  permalink: string | null;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function buildInstagramCaption(script: Script): string {
  const isEs = script.meta.language === "es";
  return [
    script.meta.hook,
    "",
    isEs ? "Más dramas así 👇 sígueme" : "More dramas like this 👇 follow",
    "",
    "#reels #drama #whatsapp",
    `#${script.meta.theme}`,
  ].join("\n");
}

/**
 * Uploads a video to Instagram as a Reel via the Graph API.
 *
 * Meta's API requires `video_url` to be a public URL it can fetch from. We
 * accept one in two ways:
 *  - PUBLIC_VIDEO_BASE_URL + a temporary local HTTP server (default)
 *  - IG_VIDEO_URL pre-set if the caller has the file already hosted (CDN)
 */
export async function uploadToInstagram(args: {
  videoPath: string;
  script: Script;
}): Promise<InstagramUploadResult> {
  const igUserId = required("IG_BUSINESS_ACCOUNT_ID");
  const token = required("IG_ACCESS_TOKEN");
  const caption = buildInstagramCaption(args.script);

  // Resolve the public URL Meta should fetch from.
  let videoUrl = process.env.IG_VIDEO_URL ?? null;
  let host: { close: () => Promise<void> } | null = null;
  if (!videoUrl) {
    const baseUrl = process.env.PUBLIC_VIDEO_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "Set PUBLIC_VIDEO_BASE_URL (e.g. https://your-vps.example.com) or " +
          "set IG_VIDEO_URL to a pre-hosted file.",
      );
    }
    const port = parseInt(process.env.IG_HOST_PORT ?? "8787", 10);
    const served = await hostVideo({
      filePath: args.videoPath,
      publicBaseUrl: baseUrl,
      port,
    });
    videoUrl = served.url;
    host = served;
  }

  try {
    // 1) Create the media container
    const createRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`,
      {
        method: "POST",
        body: new URLSearchParams({
          media_type: "REELS",
          video_url: videoUrl!,
          caption,
          share_to_feed: "true",
          access_token: token,
        }),
      },
    );
    const create = (await createRes.json()) as { id?: string; error?: unknown };
    if (!create.id) {
      throw new Error(`IG container creation failed: ${JSON.stringify(create.error ?? create)}`);
    }

    // 2) Poll container status until Meta has processed the video
    await pollContainerReady(create.id, token);

    // 3) Publish the container
    const pubRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`,
      {
        method: "POST",
        body: new URLSearchParams({
          creation_id: create.id,
          access_token: token,
        }),
      },
    );
    const pub = (await pubRes.json()) as { id?: string; error?: unknown };
    if (!pub.id) {
      throw new Error(`IG publish failed: ${JSON.stringify(pub.error ?? pub)}`);
    }

    // 4) Fetch permalink (best-effort)
    const linkRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pub.id}?fields=permalink&access_token=${token}`,
    );
    const link = (await linkRes.json()) as { permalink?: string };

    return { mediaId: pub.id, permalink: link.permalink ?? null };
  } finally {
    if (host) await host.close().catch(() => {});
  }
}

async function pollContainerReady(containerId: string, token: string): Promise<void> {
  const start = Date.now();
  const timeoutMs = 5 * 60 * 1000; // 5 minutes
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${containerId}?fields=status_code,status&access_token=${token}`,
    );
    const data = (await res.json()) as { status_code?: string; status?: string };
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error(`IG container error: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("IG container processing timed out after 5 minutes");
}

export interface InstagramInsights {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  plays: number | null;
}

export async function fetchInstagramInsights(mediaId: string): Promise<InstagramInsights> {
  const token = required("IG_ACCESS_TOKEN");
  // Reels metrics; "views" maps to "plays" for video media on IG.
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}/insights?metric=plays,reach,likes,comments,shares,saved&access_token=${token}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    data?: Array<{ name: string; values: Array<{ value: number }> }>;
    error?: unknown;
  };
  if (json.error) {
    throw new Error(`IG insights failed: ${JSON.stringify(json.error)}`);
  }
  const valueOf = (name: string): number | null => {
    const m = json.data?.find((d) => d.name === name);
    const v = m?.values?.[0]?.value;
    return typeof v === "number" ? v : null;
  };
  return {
    plays: valueOf("plays"),
    views: valueOf("plays"),
    reach: valueOf("reach"),
    likes: valueOf("likes"),
    comments: valueOf("comments"),
    shares: valueOf("shares"),
    saves: valueOf("saved"),
  };
}
