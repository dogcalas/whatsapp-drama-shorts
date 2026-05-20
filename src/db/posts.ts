import { db } from "./index.ts";

export type Platform = "youtube" | "instagram";
export type UploadStatus = "pending" | "uploading" | "live" | "failed";

export interface PostRow {
  id: number;
  script_path: string;
  video_path: string;
  theme: string;
  language: string;
  title: string;
  hook: string;
  twist: string;
  total_messages: number;
  duration_s: number;
  created_at: number;
  platform: Platform;
  platform_id: string | null;
  platform_url: string | null;
  posted_at: number | null;
  upload_status: UploadStatus;
  upload_error: string | null;
}

export interface NewPost {
  scriptPath: string;
  videoPath: string;
  theme: string;
  language: string;
  title: string;
  hook: string;
  twist: string;
  totalMessages: number;
  durationS: number;
  platform: Platform;
}

export function insertPost(p: NewPost): number {
  const info = db()
    .prepare(
      `INSERT INTO posts
       (script_path, video_path, theme, language, title, hook, twist,
        total_messages, duration_s, created_at, platform, upload_status)
       VALUES (@scriptPath, @videoPath, @theme, @language, @title, @hook,
        @twist, @totalMessages, @durationS, @createdAt, @platform, 'pending')`,
    )
    .run({ ...p, createdAt: Math.floor(Date.now() / 1000) });
  return Number(info.lastInsertRowid);
}

export function markUploaded(args: {
  postId: number;
  platformId: string;
  platformUrl?: string | null;
}) {
  db()
    .prepare(
      `UPDATE posts SET
         platform_id = @platformId,
         platform_url = @platformUrl,
         posted_at = @postedAt,
         upload_status = 'live',
         upload_error = NULL
       WHERE id = @postId`,
    )
    .run({
      postId: args.postId,
      platformId: args.platformId,
      platformUrl: args.platformUrl ?? null,
      postedAt: Math.floor(Date.now() / 1000),
    });
}

export function markFailed(postId: number, error: string) {
  db()
    .prepare(
      `UPDATE posts SET upload_status='failed', upload_error=? WHERE id=?`,
    )
    .run(error, postId);
}

export function listLivePosts(platform?: Platform): PostRow[] {
  if (platform) {
    return db()
      .prepare(`SELECT * FROM posts WHERE upload_status='live' AND platform=?`)
      .all(platform) as PostRow[];
  }
  return db()
    .prepare(`SELECT * FROM posts WHERE upload_status='live'`)
    .all() as PostRow[];
}

export interface MetricsRow {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  plays: number | null;
}

export function insertMetrics(postId: number, m: MetricsRow) {
  db()
    .prepare(
      `INSERT INTO metrics
       (post_id, fetched_at, views, likes, comments, shares, saves, reach, plays)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      postId,
      Math.floor(Date.now() / 1000),
      m.views,
      m.likes,
      m.comments,
      m.shares,
      m.saves,
      m.reach,
      m.plays,
    );
}

/** Latest metrics + post for each live post. Used by the trend analyzer. */
export interface PostWithMetrics extends PostRow {
  latest_views: number | null;
  latest_likes: number | null;
  latest_comments: number | null;
  latest_shares: number | null;
  latest_fetched_at: number | null;
}

export function postsWithLatestMetrics(
  postedSinceTs?: number,
): PostWithMetrics[] {
  const filter = postedSinceTs
    ? `AND p.posted_at >= ${Math.floor(postedSinceTs)}`
    : "";
  return db()
    .prepare(
      `
      SELECT p.*,
             m.views     AS latest_views,
             m.likes     AS latest_likes,
             m.comments  AS latest_comments,
             m.shares    AS latest_shares,
             m.fetched_at AS latest_fetched_at
      FROM posts p
      LEFT JOIN (
        SELECT m1.*
        FROM metrics m1
        JOIN (
          SELECT post_id, MAX(fetched_at) AS max_at
          FROM metrics GROUP BY post_id
        ) m2 ON m2.post_id = m1.post_id AND m2.max_at = m1.fetched_at
      ) m ON m.post_id = p.id
      WHERE p.upload_status='live' ${filter}
    `,
    )
    .all() as PostWithMetrics[];
}

export function saveTrendSnapshot(windowDays: number, data: unknown) {
  db()
    .prepare(
      `INSERT INTO trend_snapshots (computed_at, window_days, data_json)
       VALUES (?, ?, ?)`,
    )
    .run(Math.floor(Date.now() / 1000), windowDays, JSON.stringify(data));
}

export function latestTrendSnapshot(): { data: unknown; computed_at: number } | null {
  const row = db()
    .prepare(`SELECT data_json, computed_at FROM trend_snapshots ORDER BY computed_at DESC LIMIT 1`)
    .get() as { data_json: string; computed_at: number } | undefined;
  if (!row) return null;
  return { data: JSON.parse(row.data_json), computed_at: row.computed_at };
}
