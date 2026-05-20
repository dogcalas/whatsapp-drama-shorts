import { insertMetrics, listLivePosts } from "../db/posts.ts";
import { fetchYouTubeStats } from "../uploader/youtube.ts";
import { fetchInstagramInsights } from "../uploader/instagram.ts";

export interface SyncResult {
  platform: "youtube" | "instagram";
  ok: number;
  failed: number;
}

export async function syncAllAnalytics(): Promise<SyncResult[]> {
  const out: SyncResult[] = [];

  // ---- YouTube (batch) ----
  const yt = listLivePosts("youtube").filter((p) => !!p.platform_id);
  if (yt.length > 0) {
    let ok = 0, failed = 0;
    try {
      const stats = await fetchYouTubeStats(yt.map((p) => p.platform_id!));
      for (const post of yt) {
        const s = stats.get(post.platform_id!);
        if (s) {
          insertMetrics(post.id, {
            views: s.views,
            likes: s.likes,
            comments: s.comments,
            shares: null,
            saves: null,
            reach: null,
            plays: s.views,
          });
          ok++;
        } else {
          failed++;
        }
      }
    } catch (err) {
      process.stderr.write(`[analytics] YouTube batch failed: ${(err as Error).message}\n`);
      failed = yt.length;
    }
    out.push({ platform: "youtube", ok, failed });
  }

  // ---- Instagram (one call per post) ----
  const ig = listLivePosts("instagram").filter((p) => !!p.platform_id);
  let igOk = 0, igFailed = 0;
  for (const post of ig) {
    try {
      const insights = await fetchInstagramInsights(post.platform_id!);
      insertMetrics(post.id, {
        views: insights.views,
        likes: insights.likes,
        comments: insights.comments,
        shares: insights.shares,
        saves: insights.saves,
        reach: insights.reach,
        plays: insights.plays,
      });
      igOk++;
    } catch (err) {
      process.stderr.write(
        `[analytics] IG ${post.platform_id} failed: ${(err as Error).message}\n`,
      );
      igFailed++;
    }
  }
  if (ig.length > 0) out.push({ platform: "instagram", ok: igOk, failed: igFailed });

  return out;
}
