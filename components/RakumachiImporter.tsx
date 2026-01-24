"use client";

import { useEffect, useMemo, useState } from "react";
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
    propertyType: string | null;
    address: string | null;
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
  { label: "RC (鉄筋コンクリート)", value: "RC" },
  { label: "SRC (鉄骨鉄筋コンクリート)", value: "SRC" },
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
  highlightStep2?: boolean;
  onResultChange?: (hasResult: boolean) => void;
};

export const RakumachiImporter = ({
  currentInput,
  onApply,
  history = [],
  selectedHistoryId = null,
  onSelectHistory,
  onClearHistory,
  highlightStep2 = false,
  onResultChange,
}: Props) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState({ extracted: false, manual: false });
  const [showDetails, setShowDetails] = useState(false);

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
    setLoading(true);
    setError(null);
    try {
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
          suggested !== null && suggested !== undefined && suggested !== ""
            ? formatDraftValue(field, suggested as number)
            : fallback;
        nextDraft[field.key] = nextValue;
      });
      setResult({ ...data, fields: normalized });
      setDraft(nextDraft);
      setCollapsed({ extracted: false, manual: false });
      setShowDetails(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleDraftChange = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    const patch: Partial<PropertyInput> = {};
    const getValue = (field: FieldConfig) => {
      const raw = draft[field.key];
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

    if (Object.keys(patch).length > 0) {
      onApply({ patch, listing: result?.listing ?? null, url: url.trim() });
    }
    setCollapsed((prev) => ({ ...prev, extracted: true, manual: true }));
    setShowDetails(false);
  };

  return (
    <div className="sheet-card import-card">
      <div className={`import-body${showDetails ? "" : " compact"}`}>
        <div className="import-row">
          <input
            type="url"
            placeholder="楽待の物件URLを貼り付け"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="button" className="section-toggle" onClick={handleAnalyze} disabled={loading}>
            {loading ? "解析中..." : "解析"}
          </button>
        </div>
        {history.length > 0 ? (
          <div className={`import-history-row step-zone${highlightStep2 ? " active" : ""}`}>
            <div className="step-subhead">
              <span className="step-pill">Step 2</span>
              <span className="step-title">抽出確認</span>
            </div>
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
        {result && showDetails ? (
          <>
            {result.warnings && result.warnings.length > 0 ? (
              <div className="import-warnings">
                {result.warnings.map((warning) => (
                  <div key={warning} className="form-note">
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="import-section" data-collapsed={collapsed.extracted}>
              <div className="import-title-row">
                <div className="import-title-group">
                  <div className="import-title">抽出・推定された情報</div>
                  {collapsed.extracted ? (
                    <div className="import-inline-note">
                      抽出 {sourceCounts.extracted} / 推定 {sourceCounts.inferred} / 未取得{" "}
                      {sourceCounts.missing}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="section-toggle"
                  data-open={!collapsed.extracted}
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, extracted: !prev.extracted }))
                  }
                >
                  {collapsed.extracted ? "▶ 開く" : "▼ 閉じる"}
                </button>
              </div>
              {collapsed.extracted ? null : (
                <div className="import-grid">
                  {IMPORT_FIELDS.map((field) => {
                    const source = result.fields[field.key]?.source ?? "missing";
                    const note = result.fields[field.key]?.note;
                    return (
                      <div key={field.key} className="import-item">
                        <div className="import-label">
                          <span>{field.label}</span>
                          <span className={`import-pill ${source}`}>{SOURCE_LABEL[source]}</span>
                        </div>
                        <div className="import-input">
                          {field.type === "structure" ? (
                            <select
                              value={draft[field.key] ?? ""}
                              onChange={(e) => handleDraftChange(field.key, e.target.value)}
                            >
                              <option value="">選択</option>
                              {STRUCTURE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type === "text" ? "text" : "number"}
                              value={draft[field.key] ?? ""}
                              onChange={(e) => handleDraftChange(field.key, e.target.value)}
                            />
                          )}
                          {field.unit ? <span className="import-unit">{field.unit}</span> : null}
                        </div>
                        {note ? <div className="form-note">{note}</div> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="import-section" data-collapsed={collapsed.manual}>
              <div className="import-title-row">
                <div className="import-title-group">
                  <div className="import-title">不足項目（要確認）</div>
                  {collapsed.manual ? (
                    <div className="import-inline-note">未入力のままでも反映できます。</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="section-toggle"
                  data-open={!collapsed.manual}
                  onClick={() => setCollapsed((prev) => ({ ...prev, manual: !prev.manual }))}
                >
                  {collapsed.manual ? "▶ 開く" : "▼ 閉じる"}
                </button>
              </div>
              {collapsed.manual ? null : (
                <div className="import-grid">
                  {MANUAL_FIELDS.map((field) => (
                    <div key={field.key} className="import-item">
                      <div className="import-label">
                        <span>{field.label}</span>
                        <span className="import-pill manual">{SOURCE_LABEL.manual}</span>
                      </div>
                      <div className="import-input">
                        <input
                          type={field.type === "text" ? "text" : "number"}
                          value={draft[field.key] ?? ""}
                          onChange={(e) => handleDraftChange(field.key, e.target.value)}
                        />
                        {field.unit ? <span className="import-unit">{field.unit}</span> : null}
                      </div>
                      <div className="form-note">空欄なら現状の値を維持します。</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="import-actions">
              <button type="button" className="section-toggle" onClick={handleApply}>
                シミュレーターに反映
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
