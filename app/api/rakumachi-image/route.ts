import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";

const isPrivateIp = (ip: string) => {
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map((chunk) => Number(chunk));
    if (parts.some((part) => Number.isNaN(part))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    if (lower === "::") return true;
    return false;
  }

  return true;
};

const resolveSafeUrl = async (url: string, ref: string) => {
  const refUrl = new URL(ref);
  if (!refUrl.hostname.includes("rakumachi.jp")) {
    throw new Error("Invalid referrer host.");
  }

  const targetUrl = new URL(url, refUrl);
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("Invalid protocol.");
  }

  const host = targetUrl.hostname;
  if (net.isIP(host) !== 0) {
    if (isPrivateIp(host)) {
      throw new Error("Blocked IP.");
    }
  } else {
    const lookupResult = await lookup(host);
    if (isPrivateIp(lookupResult.address)) {
      throw new Error("Blocked host.");
    }
  }

  return { targetUrl, refUrl };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const ref = searchParams.get("ref");

    if (!url || !ref) {
      return NextResponse.json({ error: "Missing url or ref." }, { status: 400 });
    }

    const { targetUrl, refUrl } = await resolveSafeUrl(url, ref);

    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: refUrl.toString(),
        Origin: refUrl.origin,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Image fetch failed." },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid image type." }, { status: 415 });
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image proxy failed." },
      { status: 500 }
    );
  }
}
