import fs from "node:fs";
import { validateScript, type Script } from "../types/script.ts";
import { insertPost, markFailed, markUploaded, type Platform } from "../db/posts.ts";
import { uploadToYouTube } from "./youtube.ts";
import { uploadToInstagram } from "./instagram.ts";

export interface PostArgs {
  scriptPath: string;
  videoPath: string;
  platforms: Platform[];
}

export interface PostOutcome {
  platform: Platform;
  postId: number;
  ok: boolean;
  url?: string | null;
  error?: string;
}

export async function postVideo(args: PostArgs): Promise<PostOutcome[]> {
  const script = validateScript(JSON.parse(fs.readFileSync(args.scriptPath, "utf8")));
  const stat = await fs.promises.stat(args.videoPath);
  if (stat.size === 0) throw new Error(`Empty video file: ${args.videoPath}`);

  const outcomes: PostOutcome[] = [];
  for (const platform of args.platforms) {
    const postId = insertPost({
      scriptPath: args.scriptPath,
      videoPath: args.videoPath,
      theme: script.meta.theme,
      language: script.meta.language,
      title: script.meta.title,
      hook: script.meta.hook,
      twist: script.meta.twist,
      totalMessages: script.messages.length,
      durationS: script.meta.estimatedDurationSeconds,
      platform,
    });
    try {
      if (platform === "youtube") {
        const r = await uploadToYouTube({ videoPath: args.videoPath, script });
        markUploaded({ postId, platformId: r.videoId, platformUrl: r.url });
        outcomes.push({ platform, postId, ok: true, url: r.url });
      } else if (platform === "instagram") {
        const r = await uploadToInstagram({ videoPath: args.videoPath, script });
        markUploaded({ postId, platformId: r.mediaId, platformUrl: r.permalink });
        outcomes.push({ platform, postId, ok: true, url: r.permalink });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markFailed(postId, message);
      outcomes.push({ platform, postId, ok: false, error: message });
    }
  }
  return outcomes;
}

export function intendedPlatformsFromEnv(): Platform[] {
  const p = (process.env.DRAMA_PLATFORMS ?? "youtube,instagram")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return p.filter((x): x is Platform => x === "youtube" || x === "instagram");
}

export { Script };
