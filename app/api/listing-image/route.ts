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
  propertyName: string | null;
  propertyType: string | null;
  address: string | null;
  access: string | null;
  priceDisplay: string | null;
  structure: string | null;
  builtYearMonth: string | null;
  landRight: string | null;
  transactionType: string | null;
  priceYen: number | null;
  yieldPercent: number | null;
  annualRentYen: number | null;
  monthlyRentYen: number | null;
  buildingAgeYears: number | null;
  unitCount: number | null;
  floorAreaSqm: number | null;
  landAreaSqm: number | null;
  privateRoadAreaSqm: number | null;
  layout: string | null;
  floors: string | null;
  totalUnits: number | null;
  parking: string | null;
  buildingCoveragePercent: number | null;
  floorAreaRatioPercent: number | null;
  roadAccess: string | null;
  landCategory: string | null;
  cityPlanningArea: string | null;
  zoning: string | null;
  nationalLandReport: string | null;
  currentStatus: string | null;
  handoverDate: string | null;
  buildingConfirmationNumber: string | null;
  managementNumber: string | null;
  nextUpdateDate: string | null;
  infoRegisteredDate: string | null;
  notes: string | null;
  imageUrl: string | null;
};

const GEMINI_MODEL = "gemini-3-flash-preview";
const MAX_IMAGES = 6;

const STRUCTURE_LABELS: Record<string, string> = {
  RC: "RC造",
  SRC: "SRC造",
  S_HEAVY: "重量鉄骨",
  S_LIGHT: "軽量鉄骨",
  WOOD: "木造",
};

const truncate = (value: string, max = 500) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const extractJson = (text: string) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
};

const toBase64 = async (file: File) => {
  const buffer = await file.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEYが未設定です。" }, { status: 500 });
    }

    const formData = await request.formData();
    const files = formData.getAll("images").filter((item) => item instanceof File) as File[];
    if (!files.length) {
      return NextResponse.json({ error: "画像がありません。" }, { status: 400 });
    }
    if (files.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `画像は最大${MAX_IMAGES}枚までです。` },
        { status: 400 }
      );
    }

    const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
      {
        text: `
あなたは不動産投資の入力フォーム用のデータ抽出AIです。
以下のスクリーンショット画像から、指定のJSON形式だけを返してください。
必ずJSONのみを返し、余計な文章は出力しないでください。

【出力形式】
{
  "fields": {
    "priceYen": { "value": number|null, "source": "extracted|inferred|missing", "note": string? },
    "priceDisplay": { "value": string|null, "source": "extracted|inferred|missing", "note": string? },
    "annualRentYen": { "value": number|null, "source": "...", "note": string? },
    "monthlyRentYen": { "value": number|null, "source": "...", "note": string? },
    "yieldPercent": { "value": number|null, "source": "...", "note": string? },
    "buildingAgeYears": { "value": number|null, "source": "...", "note": string? },
    "unitCount": { "value": number|null, "source": "...", "note": string? },
    "structure": { "value": "RC|SRC|S_HEAVY|S_LIGHT|WOOD"|null, "source": "...", "note": string? },
    "floorAreaSqm": { "value": number|null, "source": "...", "note": string? },
    "landAreaSqm": { "value": number|null, "source": "...", "note": string? },
    "privateRoadAreaSqm": { "value": number|null, "source": "...", "note": string? },
    "buildingCoveragePercent": { "value": number|null, "source": "...", "note": string? },
    "floorAreaRatioPercent": { "value": number|null, "source": "...", "note": string? },
    "propertyName": { "value": string|null, "source": "...", "note": string? },
    "propertyType": { "value": string|null, "source": "...", "note": string? },
    "address": { "value": string|null, "source": "...", "note": string? },
    "access": { "value": string|null, "source": "...", "note": string? },
    "builtYearMonth": { "value": string|null, "source": "...", "note": string? },
    "landRight": { "value": string|null, "source": "...", "note": string? },
    "transactionType": { "value": string|null, "source": "...", "note": string? },
    "layout": { "value": string|null, "source": "...", "note": string? },
    "floors": { "value": string|null, "source": "...", "note": string? },
    "totalUnits": { "value": number|null, "source": "...", "note": string? },
    "parking": { "value": string|null, "source": "...", "note": string? },
    "roadAccess": { "value": string|null, "source": "...", "note": string? },
    "landCategory": { "value": string|null, "source": "...", "note": string? },
    "cityPlanningArea": { "value": string|null, "source": "...", "note": string? },
    "zoning": { "value": string|null, "source": "...", "note": string? },
    "nationalLandReport": { "value": string|null, "source": "...", "note": string? },
    "currentStatus": { "value": string|null, "source": "...", "note": string? },
    "handoverDate": { "value": string|null, "source": "...", "note": string? },
    "buildingConfirmationNumber": { "value": string|null, "source": "...", "note": string? },
    "managementNumber": { "value": string|null, "source": "...", "note": string? },
    "nextUpdateDate": { "value": string|null, "source": "...", "note": string? },
    "infoRegisteredDate": { "value": string|null, "source": "...", "note": string? },
    "notes": { "value": string|null, "source": "...", "note": string? }
  }
}

【判断ルール】
- 画像から明示的に読み取れる値は "extracted"
- 根拠がない場合は value:null, source:"missing"
- 価格・賃料は必ず「円」の整数値
- 利回りはパーセント(%)
- 築年数は「築年数」もしくは「築年月」から年数で算出（端数切り捨て）
- 戸数は「総戸数」「戸数」「住戸数」などから整数で抽出
- 構造のマッピング:
  RC=鉄筋コンクリート, SRC=鉄骨鉄筋コンクリート,
  S_HEAVY=重量鉄骨(厚), S_LIGHT=軽量鉄骨(薄), WOOD=木造
- 築年月は「YYYY年MM月」などの表記をそのまま入れる
- 交通（最寄り駅・徒歩分数）は1行で簡潔にまとめる
- 文字列項目は可能な限り画像の表記を忠実に抽出する
        `.trim(),
      },
    ];

    for (const file of files) {
      const base64 = await toBase64(file);
      parts.push({
        inlineData: {
          mimeType: file.type || "image/png",
          data: base64,
        },
      });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
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
    } catch {
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
    const accessValue = parsed.fields?.access?.value;
    const builtYearMonthValue = parsed.fields?.builtYearMonth?.value;
    const landRightValue = parsed.fields?.landRight?.value;
    const transactionTypeValue = parsed.fields?.transactionType?.value;
    const priceDisplayValue = parsed.fields?.priceDisplay?.value;
    const structureValue = parsed.fields?.structure?.value;
    const priceValue = parsed.fields?.priceYen?.value;
    const yieldValue = parsed.fields?.yieldPercent?.value;
    const annualRentValue = parsed.fields?.annualRentYen?.value;
    const monthlyRentValue = parsed.fields?.monthlyRentYen?.value;
    const buildingAgeValue = parsed.fields?.buildingAgeYears?.value;
    const unitCountValue = parsed.fields?.unitCount?.value;
    const totalUnitsValue = parsed.fields?.totalUnits?.value;
    const floorAreaValue = parsed.fields?.floorAreaSqm?.value;
    const landAreaValue = parsed.fields?.landAreaSqm?.value;
    const privateRoadAreaValue = parsed.fields?.privateRoadAreaSqm?.value;
    const layoutValue = parsed.fields?.layout?.value;
    const floorsValue = parsed.fields?.floors?.value;
    const parkingValue = parsed.fields?.parking?.value;
    const buildingCoverageValue = parsed.fields?.buildingCoveragePercent?.value;
    const floorAreaRatioValue = parsed.fields?.floorAreaRatioPercent?.value;
    const roadAccessValue = parsed.fields?.roadAccess?.value;
    const landCategoryValue = parsed.fields?.landCategory?.value;
    const cityPlanningValue = parsed.fields?.cityPlanningArea?.value;
    const zoningValue = parsed.fields?.zoning?.value;
    const nationalLandReportValue = parsed.fields?.nationalLandReport?.value;
    const currentStatusValue = parsed.fields?.currentStatus?.value;
    const handoverDateValue = parsed.fields?.handoverDate?.value;
    const buildingConfirmationValue = parsed.fields?.buildingConfirmationNumber?.value;
    const managementNumberValue = parsed.fields?.managementNumber?.value;
    const nextUpdateDateValue = parsed.fields?.nextUpdateDate?.value;
    const infoRegisteredDateValue = parsed.fields?.infoRegisteredDate?.value;
    const notesValue = parsed.fields?.notes?.value;

    const listing: ListingPreview = {
      title:
        typeof propertyNameValue === "string"
          ? propertyNameValue
          : typeof propertyTypeValue === "string"
            ? propertyTypeValue
            : null,
      propertyName: typeof propertyNameValue === "string" ? propertyNameValue : null,
      propertyType: typeof propertyTypeValue === "string" ? propertyTypeValue : null,
      address: typeof addressValue === "string" ? addressValue : null,
      access: typeof accessValue === "string" ? accessValue : null,
      priceDisplay: typeof priceDisplayValue === "string" ? priceDisplayValue : null,
      structure:
        typeof structureValue === "string"
          ? STRUCTURE_LABELS[structureValue] ?? structureValue
          : null,
      builtYearMonth: typeof builtYearMonthValue === "string" ? builtYearMonthValue : null,
      landRight: typeof landRightValue === "string" ? landRightValue : null,
      transactionType: typeof transactionTypeValue === "string" ? transactionTypeValue : null,
      priceYen: typeof priceValue === "number" ? priceValue : null,
      yieldPercent: typeof yieldValue === "number" ? yieldValue : null,
      annualRentYen: typeof annualRentValue === "number" ? annualRentValue : null,
      monthlyRentYen: typeof monthlyRentValue === "number" ? monthlyRentValue : null,
      buildingAgeYears: typeof buildingAgeValue === "number" ? buildingAgeValue : null,
      unitCount: typeof unitCountValue === "number" ? unitCountValue : null,
      floorAreaSqm: typeof floorAreaValue === "number" ? floorAreaValue : null,
      landAreaSqm: typeof landAreaValue === "number" ? landAreaValue : null,
      privateRoadAreaSqm: typeof privateRoadAreaValue === "number" ? privateRoadAreaValue : null,
      layout: typeof layoutValue === "string" ? layoutValue : null,
      floors: typeof floorsValue === "string" ? floorsValue : null,
      totalUnits: typeof totalUnitsValue === "number" ? totalUnitsValue : null,
      parking: typeof parkingValue === "string" ? parkingValue : null,
      buildingCoveragePercent:
        typeof buildingCoverageValue === "number" ? buildingCoverageValue : null,
      floorAreaRatioPercent:
        typeof floorAreaRatioValue === "number" ? floorAreaRatioValue : null,
      roadAccess: typeof roadAccessValue === "string" ? roadAccessValue : null,
      landCategory: typeof landCategoryValue === "string" ? landCategoryValue : null,
      cityPlanningArea: typeof cityPlanningValue === "string" ? cityPlanningValue : null,
      zoning: typeof zoningValue === "string" ? zoningValue : null,
      nationalLandReport:
        typeof nationalLandReportValue === "string" ? nationalLandReportValue : null,
      currentStatus: typeof currentStatusValue === "string" ? currentStatusValue : null,
      handoverDate: typeof handoverDateValue === "string" ? handoverDateValue : null,
      buildingConfirmationNumber:
        typeof buildingConfirmationValue === "string" ? buildingConfirmationValue : null,
      managementNumber: typeof managementNumberValue === "string" ? managementNumberValue : null,
      nextUpdateDate: typeof nextUpdateDateValue === "string" ? nextUpdateDateValue : null,
      infoRegisteredDate:
        typeof infoRegisteredDateValue === "string" ? infoRegisteredDateValue : null,
      notes: typeof notesValue === "string" ? notesValue : null,
      imageUrl: null,
    };

    return NextResponse.json({ fields: parsed.fields ?? {}, listing });
  } catch (error) {
    return NextResponse.json({ error: "解析に失敗しました。" }, { status: 500 });
  }
}
