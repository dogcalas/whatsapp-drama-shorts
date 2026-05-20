import fs from "node:fs";
import { google, youtube_v3 } from "googleapis";
import type { Script } from "../types/script.ts";

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
}

function ytClient(): youtube_v3.Youtube {
  const clientId = required("YOUTUBE_CLIENT_ID");
  const clientSecret = required("YOUTUBE_CLIENT_SECRET");
  const refreshToken = required("YOUTUBE_REFRESH_TOKEN");
  const oAuth2 = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: "v3", auth: oAuth2 });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function buildYouTubeMetadata(script: Script): {
  title: string;
  description: string;
  tags: string[];
} {
  const isEs = script.meta.language === "es";
  // YouTube counts spaces — keep titles under 100 chars and ensure #Shorts hint.
  const shorts = "#Shorts";
  const baseTitle = script.meta.title.slice(0, 75);
  const title = `${baseTitle} ${shorts}`.slice(0, 100);
  const description = [
    script.meta.hook,
    "",
    isEs ? "🔥 Más historias así, sígueme." : "🔥 More dramas like this — follow.",
    "",
    "#shorts #drama #whatsapp",
    `#${script.meta.theme}`,
  ].join("\n");
  const tags = [
    "shorts",
    "drama",
    "whatsapp",
    script.meta.theme,
    isEs ? "espanol" : "english",
  ];
  return { title, description, tags };
}

export async function uploadToYouTube(args: {
  videoPath: string;
  script: Script;
}): Promise<YouTubeUploadResult> {
  const yt = ytClient();
  const meta = buildYouTubeMetadata(args.script);
  const res = await yt.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          categoryId: "24", // Entertainment
          defaultLanguage: args.script.meta.language,
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: fs.createReadStream(args.videoPath),
      },
    },
    {
      // Streaming upload; required for files over a few MB.
      onUploadProgress: (evt: { bytesRead: number }) => {
        if (process.env.DRAMA_DEBUG) {
          process.stderr.write(`[yt] uploaded ${evt.bytesRead} bytes\n`);
        }
      },
    },
  );
  const videoId = res.data.id;
  if (!videoId) {
    throw new Error("YouTube did not return a video id");
  }
  return {
    videoId,
    url: `https://www.youtube.com/shorts/${videoId}`,
  };
}

export interface YouTubeStats {
  views: number | null;
  likes: number | null;
  comments: number | null;
}

export async function fetchYouTubeStats(videoIds: string[]): Promise<Map<string, YouTubeStats>> {
  if (videoIds.length === 0) return new Map();
  const yt = ytClient();
  const out = new Map<string, YouTubeStats>();
  // The API supports up to 50 ids per call.
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const res = await yt.videos.list({
      part: ["statistics"],
      id: chunk,
      maxResults: 50,
    });
    for (const item of res.data.items ?? []) {
      const s = item.statistics ?? {};
      out.set(item.id!, {
        views: s.viewCount ? Number(s.viewCount) : null,
        likes: s.likeCount ? Number(s.likeCount) : null,
        comments: s.commentCount ? Number(s.commentCount) : null,
      });
    }
  }
  return out;
}
