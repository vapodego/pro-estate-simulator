import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ImportSource = "extracted" | "inferred" | "missing";

type ImportField = {
  value: number | string | null;
  source: ImportSource;
  note?: string;
};

type ListingPreview = {
  title: string | null;
  propertyType: string | null;
  address: string | null;
  imageUrl: string | null;
};

const GEMINI_MODEL = "gemini-3-flash-preview";
const truncate = (value: string, max = 500) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const extractMeta = (html: string, key: string) => {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=[\"']${key}[\"'][^>]+content=[\"']([^\"']+)[\"']`,
    "i"
  );
  const match = html.match(regex);
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
};

const extractTitle = (html: string) => {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
};

const extractJsonLdImages = (html: string) => {
  const urls: string[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const nodes = Array.isArray(data) ? data : [data];
      nodes.forEach((node) => {
        const image = node?.image;
        if (typeof image === "string") urls.push(image);
        if (Array.isArray(image)) {
          image.forEach((entry) => {
            if (typeof entry === "string") urls.push(entry);
          });
        }
        const primaryImage = node?.primaryImageOfPage?.contentUrl;
        if (typeof primaryImage === "string") urls.push(primaryImage);
      });
    } catch {
      continue;
    }
  }
  return urls;
};

const extractImageFromHtml = (html: string) => {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+(?:data-src|data-original|src)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;
    if (!/\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(url)) continue;
    urls.push(decodeHtml(url));
  }
  return urls;
};

const extractJson = (text: string) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body?.url;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URLが不正です。" }, { status: 400 });
    }
    const targetUrl = new URL(url);
    if (!targetUrl.hostname.includes("rakumachi.jp")) {
      return NextResponse.json({ error: "楽待のURLのみ対応しています。" }, { status: 400 });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEYが未設定です。" }, { status: 500 });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "Accept-Language": "ja,en;q=0.8",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `ページ取得に失敗しました。(${res.status})` },
        { status: 502 }
      );
    }
    const html = await res.text();
    const metaTitle = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
    const metaImage = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
    const titleTag = extractTitle(html);
    const listingTitle = metaTitle || titleTag;
    const jsonLdImages = extractJsonLdImages(html);
    const htmlImages = extractImageFromHtml(html);
    const rawImageUrl =
      metaImage ||
      jsonLdImages.find((url) => Boolean(url)) ||
      htmlImages.find((url) => Boolean(url)) ||
      null;
    const listingImageUrl = rawImageUrl
      ? new URL(rawImageUrl, targetUrl.origin).toString()
      : null;
    const text = stripHtml(html).slice(0, 40000);

    const prompt = `
あなたは不動産投資の入力フォーム用のデータ抽出AIです。
以下の楽待の物件ページ本文から、指定のJSON形式だけを返してください。
必ずJSONのみを返し、余計な文章は出力しないでください。

【出力形式】
{
  "fields": {
    "priceYen": { "value": number|null, "source": "extracted|inferred|missing", "note": string? },
    "annualRentYen": { "value": number|null, "source": "...", "note": string? },
    "monthlyRentYen": { "value": number|null, "source": "...", "note": string? },
    "yieldPercent": { "value": number|null, "source": "...", "note": string? },
    "buildingAgeYears": { "value": number|null, "source": "...", "note": string? },
    "structure": { "value": "RC|SRC|S_HEAVY|S_LIGHT|WOOD"|null, "source": "...", "note": string? },
    "floorAreaSqm": { "value": number|null, "source": "...", "note": string? },
    "landAreaSqm": { "value": number|null, "source": "...", "note": string? },
    "propertyName": { "value": string|null, "source": "...", "note": string? },
    "propertyType": { "value": string|null, "source": "...", "note": string? },
    "address": { "value": string|null, "source": "...", "note": string? }
  }
}

【判断ルール】
- 明示された数値があれば "extracted"
- 利回り・価格・賃料などから算出した場合は "inferred" とし、noteに根拠を簡潔に記載
- 根拠がない場合は value:null, source:"missing"
- 価格・賃料は必ず「円」の整数値
- 利回りはパーセント(%)
- 築年数は「築年数」もしくは「築年月」から年数で算出（端数切り捨て）
- 構造のマッピング:
  RC=鉄筋コンクリート, SRC=鉄骨鉄筋コンクリート,
  S_HEAVY=重量鉄骨(厚), S_LIGHT=軽量鉄骨(薄), WOOD=木造

【本文】
${text}
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return NextResponse.json(
        {
          error: "AI解析に失敗しました。",
          details: `Gemini ${geminiRes.status}: ${truncate(errorText)}`,
        },
        { status: 502 }
      );
    }
    const geminiJson = await geminiRes.json();
    const outputText =
      geminiJson?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";
    const jsonText = extractJson(outputText);
    if (!jsonText) {
      return NextResponse.json(
        { error: "AIの出力が不正です。", details: truncate(outputText) },
        { status: 502 }
      );
    }
    let parsed: { fields?: Record<string, ImportField> };
    try {
      parsed = JSON.parse(jsonText) as { fields?: Record<string, ImportField> };
    } catch (parseError) {
      return NextResponse.json(
        {
          error: "AIの出力がJSONとして解析できませんでした。",
          details: truncate(jsonText),
        },
        { status: 502 }
      );
    }
    const addressValue = parsed.fields?.address?.value;
    const propertyNameValue = parsed.fields?.propertyName?.value;
    const propertyTypeValue = parsed.fields?.propertyType?.value;
    const listing: ListingPreview = {
      title:
        typeof propertyNameValue === "string"
          ? propertyNameValue
          : listingTitle ?? null,
      propertyType: typeof propertyTypeValue === "string" ? propertyTypeValue : null,
      address: typeof addressValue === "string" ? addressValue : null,
      imageUrl: listingImageUrl,
    };
    return NextResponse.json({ fields: parsed.fields ?? {}, listing });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析に失敗しました。" },
      { status: 500 }
    );
  }
}
