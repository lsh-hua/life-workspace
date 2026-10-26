import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/app-version";
import { isNewerVersion } from "@/lib/version-compare";

export const dynamic = "force-dynamic";

const RELEASES_API = "https://api.github.com/repos/lsh-hua/life-workspace/releases/latest";
const RELEASES_PAGE = "https://github.com/lsh-hua/life-workspace/releases";

export async function GET() {
  try {
    const response = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "life-workbench-version-check",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) {
      return NextResponse.json({ status: "unreleased", currentVersion: APP_VERSION, releasesUrl: RELEASES_PAGE });
    }
    if (!response.ok) return NextResponse.json({ error: "GitHub 暂时无法提供版本信息。" }, { status: 503 });

    const release: unknown = await response.json();
    if (!release || typeof release !== "object") {
      return NextResponse.json({ error: "GitHub 返回的版本信息无效。" }, { status: 502 });
    }
    const tag = (release as { tag_name?: unknown }).tag_name;
    const publishedAt = (release as { published_at?: unknown }).published_at;
    if (typeof tag !== "string" || !/^v?\d+\.\d+\.\d+$/.test(tag)) {
      return NextResponse.json({ error: "最新发布版本号格式无效。" }, { status: 502 });
    }
    return NextResponse.json({
      status: isNewerVersion(tag, APP_VERSION) ? "available" : "current",
      currentVersion: APP_VERSION,
      latestVersion: tag.replace(/^v/, ""),
      publishedAt: typeof publishedAt === "string" ? publishedAt : null,
      releaseUrl: RELEASES_PAGE,
    });
  } catch {
    return NextResponse.json({ error: "无法连接 GitHub，请检查网络后重试。" }, { status: 503 });
  }
}
