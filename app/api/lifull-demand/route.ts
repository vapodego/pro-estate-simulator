import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LifullDemandRow = {
  bucket: string;
  searchPct: number | null;
  listingPct: number | null;
};

type LifullDemandPayload = {
  heatmapLevel: number | null;
  heatmapLabel: string | null;
  sourceArea: string | null;
  rentRows: LifullDemandRow[];
  ageRows: LifullDemandRow[];
  areaRows: LifullDemandRow[];
  layoutRows: LifullDemandRow[];
  stationWalkRows: LifullDemandRow[];
};

const GEMINI_MODELS = ["gemini-3-flash-preview", "gemini-2.0-flash"] as const;
const MAX_FILES = 12;

const truncate = (value: string, max = 500) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const extractJson = (text: string) => {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const fenced = fencedMatch[1].trim();
    const fencedStart = fenced.indexOf("{");
    const fencedEnd = fenced.lastIndexOf("}");
    if (fencedStart !== -1 && fencedEnd !== -1 && fencedEnd > fencedStart) {
      return fenced.slice(fencedStart, fencedEnd + 1);
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
};

const toBase64 = async (file: File) => {
  const buffer = await file.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[%％,\s]/g, "").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeRows = (value: unknown): LifullDemandRow[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<Record<keyof LifullDemandRow, unknown>>;
      const bucket = typeof row.bucket === "string" ? row.bucket.trim() : "";
      if (!bucket) return null;
      return {
        bucket,
        searchPct: toNumberOrNull(row.searchPct),
        listingPct: toNumberOrNull(row.listingPct),
      };
    })
    .filter((row): row is LifullDemandRow => row !== null);
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEYが未設定です。" }, { status: 500 });
    }

    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((item) => item instanceof File)
      .filter((file) => {
        const typed = file as File;
        if (typed.type.startsWith("image/")) return true;
        if (typed.type.includes("pdf")) return true;
        return typed.name.toLowerCase().endsWith(".pdf");
      }) as File[];

    if (!files.length) {
      return NextResponse.json({ error: "ファイルがありません。" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `ファイルは最大${MAX_FILES}件までです。` },
        { status: 400 }
      );
    }

    const promptText = `
あなたは「LIFULL HOME'S オーナー向け需要データ」の抽出AIです。
入力はスクリーンショット画像またはPDFです。以下のJSONのみを返してください。
説明文やコードブロックは不要です。

{
  "heatmapLevel": number|null,
  "heatmapLabel": string|null,
  "sourceArea": string|null,
  "rentRows": [{"bucket":"string","searchPct":number|null,"listingPct":number|null}],
  "ageRows": [{"bucket":"string","searchPct":number|null,"listingPct":number|null}],
  "areaRows": [{"bucket":"string","searchPct":number|null,"listingPct":number|null}],
  "layoutRows": [{"bucket":"string","searchPct":number|null,"listingPct":number|null}],
  "stationWalkRows": [{"bucket":"string","searchPct":number|null,"listingPct":number|null}]
}

抽出ルール:
- heatmapLevelは1〜10（10が閲覧最多、1が閲覧少）。判断不能ならnull。
- heatmapLabelは判定根拠の短い文。判断不能ならnull。
- sourceAreaは画面上の対象エリア名（例: 神奈川県横浜市神奈川区）。不明ならnull。
- 各Rowsは、左列カテゴリ名をbucketに入れる。
- searchPctは「検索回数」側の割合、listingPctは「LIFULL HOME'S掲載物件」側の割合。
- ％記号は外して数値で返す。小数はそのまま。
- 駅徒歩の見出し（例:「賃貸入居者の希望する駅徒歩」）がある表はstationWalkRowsに入れる。
- 表が見当たらないカテゴリは空配列。
`.trim();

    const fileParts: { inlineData: { mimeType: string; data: string } }[] = [];
    for (const file of files) {
      const base64 = await toBase64(file);
      fileParts.push({
        inlineData: {
          mimeType: file.type || "application/pdf",
          data: base64,
        },
      });
    }

    const candidateFileCounts = Array.from(
      new Set([
        fileParts.length,
        Math.min(fileParts.length, 8),
        Math.min(fileParts.length, 4),
      ])
    )
      .filter((count) => count > 0)
      .sort((a, b) => b - a);

    const attemptErrors: string[] = [];
    let parsed: Partial<LifullDemandPayload> | null = null;

    for (const fileCount of candidateFileCounts) {
      const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
        { text: promptText },
        ...fileParts.slice(0, fileCount),
      ];
      for (const model of GEMINI_MODELS) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.1 },
            }),
          }
        );
        if (!geminiRes.ok) {
          const errorText = await geminiRes.text();
          attemptErrors.push(
            `${model} / ${fileCount}件: ${geminiRes.status} ${truncate(errorText, 240)}`
          );
          continue;
        }
        const geminiJson = await geminiRes.json();
        const outputText =
          geminiJson?.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text ?? "")
            .join("") ?? "";
        const jsonText = extractJson(outputText);
        if (!jsonText) {
          attemptErrors.push(`${model} / ${fileCount}件: JSON抽出失敗 ${truncate(outputText, 240)}`);
          continue;
        }
        try {
          parsed = JSON.parse(jsonText) as Partial<LifullDemandPayload>;
          break;
        } catch {
          attemptErrors.push(`${model} / ${fileCount}件: JSON解析失敗 ${truncate(jsonText, 240)}`);
        }
      }
      if (parsed) break;
    }

    if (!parsed) {
      return NextResponse.json(
        {
          error: "AI解析に失敗しました。",
          details: attemptErrors.slice(0, 3).join(" | "),
        },
        { status: 502 }
      );
    }

    const rawLevel = toNumberOrNull(parsed.heatmapLevel);
    const normalized: LifullDemandPayload = {
      heatmapLevel:
        rawLevel !== null && rawLevel >= 1 && rawLevel <= 10 ? Math.round(rawLevel) : null,
      heatmapLabel: typeof parsed.heatmapLabel === "string" ? parsed.heatmapLabel : null,
      sourceArea: typeof parsed.sourceArea === "string" ? parsed.sourceArea : null,
      rentRows: normalizeRows(parsed.rentRows),
      ageRows: normalizeRows(parsed.ageRows),
      areaRows: normalizeRows(parsed.areaRows),
      layoutRows: normalizeRows(parsed.layoutRows),
      stationWalkRows: normalizeRows(parsed.stationWalkRows),
    };

    const warnings: string[] = [];
    if (
      normalized.rentRows.length === 0 &&
      normalized.ageRows.length === 0 &&
      normalized.areaRows.length === 0 &&
      normalized.layoutRows.length === 0 &&
      normalized.stationWalkRows.length === 0
    ) {
      warnings.push("表データを十分に読み取れませんでした。PDF品質やページ範囲を確認してください。");
    }

    return NextResponse.json({ data: normalized, warnings });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "LIFULL需要マップ解析に失敗しました。",
      },
      { status: 500 }
    );
  }
}
