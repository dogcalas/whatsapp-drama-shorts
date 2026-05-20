import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

/**
 * Tiny one-shot HTTP server that exposes a single video file at a randomised
 * path. Instagram's Graph API requires `video_url` to be a public HTTPS URL,
 * so for a self-hosted VPS workflow we spin one of these up, hand the URL to
 * Meta, wait for them to fetch the file, and tear it down.
 *
 * For production you'd point PUBLIC_VIDEO_BASE_URL at a CDN or signed S3 URL
 * and skip this helper entirely.
 */
export interface VideoHost {
  url: string; // public URL Meta should fetch
  close: () => Promise<void>;
}

export async function hostVideo(args: {
  filePath: string;
  publicBaseUrl: string; // e.g. https://your-vps.example.com (no trailing /)
  port: number;
  bindHost?: string;
}): Promise<VideoHost> {
  const token = crypto.randomBytes(16).toString("hex");
  const fileName = path.basename(args.filePath);
  const pathPart = `/video/${token}/${encodeURIComponent(fileName)}`;
  const stat = await fs.promises.stat(args.filePath);

  const server = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith(`/video/${token}/`)) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d+)-(\d+)?$/.exec(range);
      if (!m) {
        res.statusCode = 416;
        res.end();
        return;
      }
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.writeHead(206, {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      fs.createReadStream(args.filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(args.filePath).pipe(res);
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(args.port, args.bindHost ?? "0.0.0.0", resolve),
  );

  return {
    url: `${args.publicBaseUrl.replace(/\/$/, "")}${pathPart}`,
    close: () =>
      new Promise((resolve) =>
        server.close(() => resolve()),
      ),
  };
}
