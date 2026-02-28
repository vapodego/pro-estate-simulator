"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PropertyInput, StructureType } from "../utils/types";
import {
  getSuggestedBuildingRatio,
  getSuggestedInterestRate,
  getSuggestedLoanDuration,
  getSuggestedOccupancyRate,
  getSuggestedOperatingExpenseRate,
} from "../utils/estimates";

type ImportSource = "extracted" | "inferred" | "missing" | "manual";

type ImportField = {
  value: number | string | null;
  source: ImportSource;
  note?: string;
};

type ImportResponse = {
  fields: Record<string, ImportField>;
  listing?: {
    title: string | null;
    propertyName?: string | null;
    propertyType: string | null;
    address: string | null;
    access: string | null;
    structure: string | null;
    builtYearMonth: string | null;
    buildingAgeYears: number | null;
    landRight: string | null;
    transactionType: string | null;
    priceYen: number | null;
    priceDisplay: string | null;
    yieldPercent: number | null;
    annualRentYen: number | null;
    monthlyRentYen: number | null;
    floorAreaSqm: number | null;
    landAreaSqm: number | null;
    privateRoadAreaSqm: number | null;
    layout: string | null;
    floors: string | null;
    unitCount: number | null;
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
  warnings?: string[];
};

export type ListingPreview = NonNullable<ImportResponse["listing"]>;

export type ImportHistoryItem = {
  id: string;
  url: string;
  listing: ListingPreview | null;
  input: PropertyInput;
  autoFilled: (keyof PropertyInput)[];
  createdAt: number;
};

type FieldConfig = {
  key: string;
  label: string;
  type: "yen" | "percent" | "number" | "structure" | "text";
  unit?: string;
  mapTo?: keyof PropertyInput;
  required?: boolean;
};

const STRUCTURE_OPTIONS: { label: string; value: StructureType }[] = [
  { label: "RC", value: "RC" },
  { label: "SRC", value: "SRC" },
  { label: "重量鉄骨 (厚)", value: "S_HEAVY" },
  { label: "軽量鉄骨 (薄)", value: "S_LIGHT" },
  { label: "木造", value: "WOOD" },
];

const IMPORT_FIELDS: FieldConfig[] = [
  { key: "priceYen", label: "物件価格", type: "yen", unit: "万円", mapTo: "price", required: true },
  { key: "monthlyRentYen", label: "月額賃料（満室）", type: "yen", unit: "万円", mapTo: "monthlyRent", required: true },
  { key: "annualRentYen", label: "年間賃料（満室）", type: "yen", unit: "万円" },
  { key: "yieldPercent", label: "表面利回り", type: "percent", unit: "%"},
  { key: "structure", label: "構造", type: "structure", mapTo: "structure", required: true },
  { key: "buildingAgeYears", label: "築年数", type: "number", unit: "年", mapTo: "buildingAge", required: true },
  { key: "unitCount", label: "戸数", type: "number", unit: "戸", mapTo: "unitCount" },
  { key: "propertyType", label: "物件種別", type: "text" },
  { key: "address", label: "所在地", type: "text" },
  { key: "floorAreaSqm", label: "延床面積", type: "number", unit: "㎡" },
  { key: "landAreaSqm", label: "土地面積", type: "number", unit: "㎡" },
];

const MANUAL_FIELDS: FieldConfig[] = [
  { key: "loanAmount", label: "借入金額", type: "yen", unit: "万円", mapTo: "loanAmount", required: true },
  { key: "interestRate", label: "金利", type: "percent", unit: "%", mapTo: "interestRate", required: true },
  { key: "loanDuration", label: "返済期間", type: "number", unit: "年", mapTo: "loanDuration", required: true },
  { key: "occupancyRate", label: "入居率", type: "percent", unit: "%", mapTo: "occupancyRate", required: true },
  { key: "operatingExpenseRate", label: "運営経費率", type: "percent", unit: "%", mapTo: "operatingExpenseRate" },
  { key: "buildingRatio", label: "建物比率", type: "percent", unit: "%", mapTo: "buildingRatio" },
];

const SOURCE_LABEL: Record<ImportSource, string> = {
  extracted: "抽出",
  inferred: "推定",
  missing: "未取得",
  manual: "要入力",
};

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};


const normalizeFields = (fields: Record<string, ImportField>) => {
  const next = { ...fields };
  const price = next.priceYen?.value ?? null;
  const monthly = next.monthlyRentYen?.value ?? null;
  const annual = next.annualRentYen?.value ?? null;
  const yieldPercent = next.yieldPercent?.value ?? null;

  if (!monthly && annual) {
    next.monthlyRentYen = {
      value: Math.round(Number(annual) / 12),
      source: "inferred",
      note: "年間賃料から月額に換算",
    };
  }

  if (!annual && monthly) {
    next.annualRentYen = {
      value: Math.round(Number(monthly) * 12),
      source: "inferred",
      note: "月額賃料から年間に換算",
    };
  }

  if (!annual && price && yieldPercent) {
    const inferredAnnual = Math.round((Number(price) * Number(yieldPercent)) / 100);
    next.annualRentYen = {
      value: inferredAnnual,
      source: "inferred",
      note: "価格と利回りから推定",
    };
    if (!monthly) {
      next.monthlyRentYen = {
        value: Math.round(inferredAnnual / 12),
        source: "inferred",
        note: "価格と利回りから推定",
      };
    }
  }

  return next;
};

type Props = {
  currentInput: PropertyInput;
  onApply: (payload: { patch: Partial<PropertyInput>; listing: ListingPreview | null; url: string }) => void;
  history?: ImportHistoryItem[];
  selectedHistoryId?: string | null;
  onSelectHistory?: (id: string) => void;
  onClearHistory?: () => void;
  onResultChange?: (hasResult: boolean) => void;
  onStartAnalyze?: () => void;
  onCacheLookup?: (url: string) => Promise<{ input: PropertyInput; listing: ListingPreview | null } | null>;
};

export const RakumachiImporter = ({
  currentInput,
  onApply,
  history = [],
  selectedHistoryId = null,
  onSelectHistory,
  onClearHistory,
  onResultChange,
  onStartAnalyze,
  onCacheLookup,
}: Props) => {
  const IMAGE_LIMIT = 6;
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<
    { id: string; url: string; name: string; type: string }[]
  >([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState({ extracted: false, manual: false });
  const [showDetails, setShowDetails] = useState(false);
  const activeHistory = useMemo(
    () =>
      selectedHistoryId ? history.find((item) => item.id === selectedHistoryId) ?? null : null,
    [history, selectedHistoryId]
  );

  const appendImageFiles = (files: File[]) => {
    if (!files.length) return;
    setImageFiles((prev) => {
      const next = [...prev, ...files].slice(0, IMAGE_LIMIT);
      if (next.length < prev.length + files.length) {
        setError(`ファイルは最大${IMAGE_LIMIT}件までです。`);
      }
      return next;
    });
  };

  const removeImage = (id: string) => {
    setImageFiles((prev) => {
      const next = prev.filter(
        (file) => `${file.name}-${file.size}-${file.lastModified}` !== id
      );
      return next;
    });
  };

  useEffect(() => {
    const nextPreviews = imageFiles.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      url: URL.createObjectURL(file),
      name: file.name,
      type: file.type,
    }));
    setImagePreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [imageFiles]);

  useEffect(() => {
    if (!selectedHistoryId) return;
    const item = history.find((entry) => entry.id === selectedHistoryId);
    if (item?.url && /^https?:/i.test(item.url)) {
      setUrl(item.url);
    }
  }, [history, selectedHistoryId]);

  const hashFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return `${file.name}-${file.size}-${file.lastModified}`;
    }
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  const buildImageCacheKey = async (files: File[]) => {
    const hashes = await Promise.all(files.map(hashFile));
    return `image:${hashes.join("-")}`;
  };

  const manualDefaults = useMemo(() => {
    const toDefault = (value: number, scale = 1) =>
      Number.isFinite(value) && value > 0 ? (value / scale).toString() : "";
    return {
      loanAmount: toDefault(currentInput.loanAmount, 10000),
      interestRate: toDefault(currentInput.interestRate),
      loanDuration: toDefault(currentInput.loanDuration),
      occupancyRate: toDefault(currentInput.occupancyRate),
      operatingExpenseRate: toDefault(currentInput.operatingExpenseRate),
      buildingRatio: toDefault(currentInput.buildingRatio),
    };
  }, [currentInput]);

  useEffect(() => {
    onResultChange?.(Boolean(result));
  }, [result, onResultChange]);

  const sourceCounts = useMemo(() => {
    const counts = { extracted: 0, inferred: 0, missing: 0 };
    if (!result?.fields) return counts;
    Object.values(result.fields).forEach((field) => {
      const source = field?.source ?? "missing";
      if (source === "extracted") counts.extracted += 1;
      else if (source === "inferred") counts.inferred += 1;
      else counts.missing += 1;
    });
    return counts;
  }, [result]);

  const getSuggestedManuals = (fields: Record<string, ImportField>) => {
    const price = Number(fields.priceYen?.value ?? currentInput.price ?? 0);
    const structure = (fields.structure?.value as StructureType | undefined) ?? currentInput.structure;
    const buildingAge = Number(fields.buildingAgeYears?.value ?? currentInput.buildingAge ?? 0);
    const suggestedLoanAmount = price > 0 ? Math.round(price * 0.95) : null;
    const suggestedInterestRate = getSuggestedInterestRate(structure);
    const suggestedLoanDuration = getSuggestedLoanDuration(structure, buildingAge);
    const suggestedOccupancyRate = getSuggestedOccupancyRate(buildingAge);
    const suggestedOperatingExpenseRate = getSuggestedOperatingExpenseRate(structure, buildingAge);
    const suggestedBuildingRatio = getSuggestedBuildingRatio(structure, buildingAge);

    return {
      loanAmount: suggestedLoanAmount,
      interestRate: suggestedInterestRate,
      loanDuration: suggestedLoanDuration,
      occupancyRate: suggestedOccupancyRate,
      operatingExpenseRate: suggestedOperatingExpenseRate,
      buildingRatio: suggestedBuildingRatio,
    };
  };

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError("URLを入力してください。");
      return;
    }
    if (imageFiles.length > 0) {
      setImageFiles([]);
    }
    onStartAnalyze?.();
    setLoading(true);
    setError(null);
    setResult(null);
    setCacheHit(false);
    setDraft({});
    setCollapsed({ extracted: false, manual: false });
    setShowDetails(false);
    try {
      if (onCacheLookup) {
        const cached = await onCacheLookup(url.trim());
        if (cached) {
          setResult({ fields: {}, listing: cached.listing ?? undefined, warnings: ["cache"] });
          setCacheHit(true);
          onApply({ patch: cached.input, listing: cached.listing ?? null, url: url.trim() });
          return;
        }
      }
      const response = await fetch("/api/rakumachi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const details = body?.details ? ` (${body.details})` : "";
        throw new Error(`${body?.error ?? "解析に失敗しました。"}${details}`);
      }
      const data = (await response.json()) as ImportResponse;
      const normalized = normalizeFields(data.fields ?? {});
      const nextDraft: Record<string, string> = {};
      const suggestedManuals = getSuggestedManuals(normalized);
      const formatDraftValue = (field: FieldConfig, value: number | string | null | undefined) => {
        if (value === null || value === undefined || value === "") return "";
        if (field.type === "yen") {
          return (Number(value) / 10000).toString();
        }
        return String(value);
      };
      IMPORT_FIELDS.forEach((field) => {
        const value = normalized[field.key]?.value;
        if (value === null || value === undefined || value === "") {
          nextDraft[field.key] = "";
          return;
        }
        if (field.type === "yen") {
          nextDraft[field.key] = (Number(value) / 10000).toString();
        } else {
          nextDraft[field.key] = String(value);
        }
      });
      MANUAL_FIELDS.forEach((field) => {
        if (field.key in nextDraft) return;
        const suggested = suggestedManuals[field.key as keyof typeof suggestedManuals];
        const fallback = manualDefaults[field.key as keyof typeof manualDefaults] ?? "";
        const nextValue =
          typeof suggested === "number" && Number.isFinite(suggested)
            ? formatDraftValue(field, suggested)
            : fallback;
        nextDraft[field.key] = nextValue;
      });
      const patch: Partial<PropertyInput> = {};
      const getValue = (field: FieldConfig) => {
        const raw = nextDraft[field.key];
        if (!raw) return null;
        if (field.type === "structure") return raw as StructureType;
        const numeric = toNumber(raw);
        if (numeric === null) return null;
        if (field.type === "yen") return Math.round(numeric * 10000);
        return numeric;
      };

      IMPORT_FIELDS.forEach((field) => {
        if (!field.mapTo) return;
        const value = getValue(field);
        if (value !== null) {
          patch[field.mapTo] = value as never;
        }
      });

      MANUAL_FIELDS.forEach((field) => {
        if (!field.mapTo) return;
        const value = getValue(field);
        if (value !== null) {
          patch[field.mapTo] = value as never;
        }
      });

      setResult({ ...data, fields: normalized });
      setDraft(nextDraft);
      setCollapsed({ extracted: true, manual: true });
      setShowDetails(false);
      if (Object.keys(patch).length > 0) {
        onApply({ patch, listing: data.listing ?? null, url: url.trim() });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleImageAnalyze = async () => {
    if (imageFiles.length === 0) {
      setError("画像を追加してください。");
      return;
    }
    onStartAnalyze?.();
    setLoading(true);
    setError(null);
    setResult(null);
    setCacheHit(false);
    setDraft({});
    setCollapsed({ extracted: false, manual: false });
    setShowDetails(false);
    try {
      const cacheKey = await buildImageCacheKey(imageFiles);
      if (onCacheLookup) {
        const cached = await onCacheLookup(cacheKey);
        if (cached) {
          setResult({ fields: {}, listing: cached.listing ?? undefined, warnings: ["cache"] });
          setCacheHit(true);
          onApply({ patch: cached.input, listing: cached.listing ?? null, url: cacheKey });
          setImageFiles([]);
          return;
        }
      }

      const formData = new FormData();
      imageFiles.forEach((file) => {
        formData.append("images", file);
      });
      const response = await fetch("/api/listing-image", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const details = body?.details ? ` (${body.details})` : "";
        throw new Error(`${body?.error ?? "解析に失敗しました。"}${details}`);
      }
      const data = (await response.json()) as ImportResponse;
      const normalized = normalizeFields(data.fields ?? {});
      const nextDraft: Record<string, string> = {};
      const suggestedManuals = getSuggestedManuals(normalized);
      const formatDraftValue = (field: FieldConfig, value: number | string | null | undefined) => {
        if (value === null || value === undefined || value === "") return "";
        if (field.type === "yen") {
          return (Number(value) / 10000).toString();
        }
        return String(value);
      };
      IMPORT_FIELDS.forEach((field) => {
        const value = normalized[field.key]?.value;
        if (value === null || value === undefined || value === "") {
          nextDraft[field.key] = "";
          return;
        }
        if (field.type === "yen") {
          nextDraft[field.key] = (Number(value) / 10000).toString();
        } else {
          nextDraft[field.key] = String(value);
        }
      });
      MANUAL_FIELDS.forEach((field) => {
        if (field.key in nextDraft) return;
        const suggested = suggestedManuals[field.key as keyof typeof suggestedManuals];
        const fallback = manualDefaults[field.key as keyof typeof manualDefaults] ?? "";
        const nextValue =
          typeof suggested === "number" && Number.isFinite(suggested)
            ? formatDraftValue(field, suggested)
            : fallback;
        nextDraft[field.key] = nextValue;
      });
      const patch: Partial<PropertyInput> = {};
      const getValue = (field: FieldConfig) => {
        const raw = nextDraft[field.key];
        if (!raw) return null;
        if (field.type === "structure") return raw as StructureType;
        const numeric = toNumber(raw);
        if (numeric === null) return null;
        if (field.type === "yen") return Math.round(numeric * 10000);
        return numeric;
      };

      IMPORT_FIELDS.forEach((field) => {
        if (!field.mapTo) return;
        const value = getValue(field);
        if (value !== null) {
          patch[field.mapTo] = value as never;
        }
      });

      MANUAL_FIELDS.forEach((field) => {
        if (!field.mapTo) return;
        const value = getValue(field);
        if (value !== null) {
          patch[field.mapTo] = value as never;
        }
      });

      setResult({ ...data, fields: normalized });
      setDraft(nextDraft);
      setCollapsed({ extracted: true, manual: true });
      setShowDetails(false);
      if (Object.keys(patch).length > 0) {
        onApply({ patch, listing: data.listing ?? null, url: cacheKey });
      }
      setImageFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleUnifiedAnalyze = async () => {
    if (imageFiles.length > 0) {
      await handleImageAnalyze();
      return;
    }
    await handleAnalyze();
  };

  const handleDraftChange = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable) return;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    appendImageFiles(pastedFiles);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []).filter(
      (file) => file.type.startsWith("image/") || file.type.includes("pdf")
    );
    appendImageFiles(files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(
      (file) => file.type.startsWith("image/") || file.type.includes("pdf")
    );
    if (files.length > 0) {
      appendImageFiles(files);
    }
    event.target.value = "";
  };

  return (
    <div className="sheet-card import-card" onPaste={handlePaste}>
      <div className="import-body compact">
        <div className="import-row">
          <input
            type="url"
            placeholder="楽待の物件URLを貼り付け"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!loading) handleUnifiedAnalyze();
              }
            }}
          />
          <button
            type="button"
            className="section-toggle"
            onClick={handleUnifiedAnalyze}
            disabled={loading || (!url.trim() && imageFiles.length === 0)}
          >
            {loading ? "解析中..." : "解析"}
          </button>
        </div>
        <div
          className={`import-drop-zone${isDragging ? " is-dragging" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!loading && (imageFiles.length > 0 || url.trim())) {
                handleUnifiedAnalyze();
              }
            }
          }}
          tabIndex={0}
          role="button"
          aria-label="スクショまたはPDFをドロップして解析"
        >
          <div className="import-drop-title">スクショ・PDFをここにドロップ</div>
          <div className="import-drop-note">または Cmd+V / Ctrl+V で貼り付け</div>
        </div>
        <div className="import-upload-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="import-file-input"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="import-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            画像/PDFを選択
          </button>
        </div>
        {imageFiles.length > 0 ? (
          <div className="form-note">ファイル {imageFiles.length}件を解析します。</div>
        ) : null}
        {imagePreviews.length > 0 ? (
          <div className="import-thumbs">
            {imagePreviews.map((item) => (
              <div key={item.id} className="import-thumb" title={item.name}>
                {item.type.includes("pdf") ? (
                  <div className="import-thumb-file">PDF</div>
                ) : (
                  <img src={item.url} alt={item.name} />
                )}
                <button
                  type="button"
                  className="import-thumb-remove"
                  onClick={() => removeImage(item.id)}
                  aria-label={`${item.name} を削除`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {history.length > 0 ? (
          <div className="import-history-row">
            <div className="import-history">
              {history.map((item) => {
                const label = item.listing?.title ?? item.listing?.propertyType ?? "物件";
                const isActive = selectedHistoryId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`import-history-item${isActive ? " active" : ""}`}
                    onClick={() => {
                      setShowDetails(false);
                      onSelectHistory?.(item.id);
                    }}
                    title={item.url}
                  >
                    {item.listing?.propertyType ? (
                      <span className="import-history-chip">{item.listing.propertyType}</span>
                    ) : null}
                    <span className="import-history-title">{label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="import-history-clear"
              onClick={() => onClearHistory?.()}
            >
              履歴を削除
            </button>
          </div>
        ) : null}
        {error ? <div className="auth-error">{error}</div> : null}
        {cacheHit ? <div className="form-note">キャッシュから復元しました。</div> : null}
        {!cacheHit && result ? <div className="form-note">解析結果を自動で反映しました。</div> : null}
      </div>
    </div>
  );
};
