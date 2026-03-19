"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ListingLayoutDetail, ListingPreview } from "./RakumachiImporter";

type ListingSummaryProps = {
  listing: ListingPreview | null;
  listingUrl?: string | null;
  onLayoutDetailsChange?: (rows: ListingLayoutDetail[]) => void;
};

type ListingFact = {
  label: string;
  value: string | null;
  placeholder?: boolean;
  warning?: string;
};

const formatManYen = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const man = Math.round((value / 10000) * 10) / 10;
  const hasDecimal = Math.abs(man % 1) > 0;
  return `${man.toLocaleString("ja-JP", {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  })}万円`;
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null;
  return `${value.toFixed(2)}%`;
};

const formatArea = (value: number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString("ja-JP", {
    minimumFractionDigits: rounded % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}㎡`;
};

const hasValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

const toInputManYen = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? String(Math.round((value / 10000) * 100) / 100)
    : "";

const toInputArea = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "";

const parseManYenInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 10000);
};

const parseAreaInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
};

const normalizeRows = (rows: ListingLayoutDetail[]) =>
  rows
    .map((row) => ({
      layout: row.layout.trim(),
      floor: typeof row.floor === "string" ? row.floor.trim() : "",
      monthlyRentYen:
        typeof row.monthlyRentYen === "number" && Number.isFinite(row.monthlyRentYen)
          ? Math.round(row.monthlyRentYen)
          : null,
      areaSqm:
        typeof row.areaSqm === "number" && Number.isFinite(row.areaSqm)
          ? Math.round(row.areaSqm * 100) / 100
          : null,
    }))
    .filter(
      (row) =>
        row.layout.length > 0 ||
        row.floor.length > 0 ||
        (typeof row.monthlyRentYen === "number" && Number.isFinite(row.monthlyRentYen)) ||
        (typeof row.areaSqm === "number" && Number.isFinite(row.areaSqm))
    )
    .slice(0, 20);

const buildFallbackLayoutRows = (listing: ListingPreview): ListingLayoutDetail[] => {
  const raw = (listing.layout ?? "").trim();
  if (!raw) return [];
  const normalized = raw.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const tokens = Array.from(
    normalized.matchAll(/(ワンルーム|[1-9][0-9]?S?LDK|[1-9][0-9]?SDK|[1-9][0-9]?LDK|[1-9][0-9]?DK|[1-9][0-9]?K|[1-9][0-9]?R)/g)
  ).map((match) => (match[1] === "ワンルーム" ? "1R" : match[1]));
  const layouts = tokens.length > 0 ? Array.from(new Set(tokens)) : [raw];
  const unitsRaw = listing.unitCount ?? listing.totalUnits ?? null;
  const units =
    typeof unitsRaw === "number" && Number.isFinite(unitsRaw) && unitsRaw > 0 ? unitsRaw : null;
  const unitRent =
    typeof listing.monthlyRentYen === "number" && Number.isFinite(listing.monthlyRentYen)
      ? units && units > 1
        ? Math.round(listing.monthlyRentYen / units)
        : Math.round(listing.monthlyRentYen)
      : null;
  const unitArea =
    typeof listing.floorAreaSqm === "number" && Number.isFinite(listing.floorAreaSqm)
      ? units && units > 1
        ? Math.round((listing.floorAreaSqm / units) * 100) / 100
        : Math.round(listing.floorAreaSqm * 100) / 100
      : null;
  return layouts.slice(0, 10).map((layout) => ({
    layout,
    floor: "",
    monthlyRentYen: unitRent,
    areaSqm: unitArea,
  }));
};

const extractStationWalkMinutes = (access: string | null | undefined) => {
  if (!access) return [];
  const values: number[] = [];
  const patterns = [
    /駅[^。\n\r]*?徒歩\s*(\d{1,3})\s*分/g,
    /徒歩\s*(\d{1,3})\s*分[^。\n\r]*?駅/g,
  ];
  for (const pattern of patterns) {
    for (const match of access.matchAll(pattern)) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) values.push(parsed);
    }
  }
  if (!values.length && access.includes("駅") && access.includes("徒歩")) {
    for (const match of access.matchAll(/徒歩\s*(\d{1,3})\s*分/g)) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) values.push(parsed);
    }
  }
  return values;
};

export const ListingSummary = ({ listing, listingUrl, onLayoutDetailsChange }: ListingSummaryProps) => {
  const initialLayoutRows = useMemo(() => {
    if (!listing) return [];
    if (Array.isArray(listing.layoutDetails)) {
      return listing.layoutDetails.map((row) => ({
        layout: typeof row.layout === "string" ? row.layout : "",
        floor: typeof row.floor === "string" ? row.floor : "",
        monthlyRentYen:
          typeof row.monthlyRentYen === "number" && Number.isFinite(row.monthlyRentYen)
            ? Math.round(row.monthlyRentYen)
            : null,
        areaSqm:
          typeof row.areaSqm === "number" && Number.isFinite(row.areaSqm)
            ? Math.round(row.areaSqm * 100) / 100
            : null,
      }));
    }
    return buildFallbackLayoutRows(listing);
  }, [listing]);
  const initialNormalizedSnapshot = useMemo(
    () => JSON.stringify(normalizeRows(initialLayoutRows)),
    [initialLayoutRows]
  );
  const [layoutRows, setLayoutRows] = useState<ListingLayoutDetail[]>(initialLayoutRows);
  const latestChangeHandlerRef = useRef(onLayoutDetailsChange);
  const lastSyncedSnapshotRef = useRef(initialNormalizedSnapshot);

  useEffect(() => {
    latestChangeHandlerRef.current = onLayoutDetailsChange;
  }, [onLayoutDetailsChange]);

  useEffect(() => {
    setLayoutRows((prev) => {
      const prevNormalized = JSON.stringify(normalizeRows(prev));
      if (prevNormalized === initialNormalizedSnapshot) return prev;
      return initialLayoutRows;
    });
    lastSyncedSnapshotRef.current = initialNormalizedSnapshot;
  }, [initialLayoutRows, initialNormalizedSnapshot]);

  useEffect(() => {
    const handler = latestChangeHandlerRef.current;
    if (!listing) return;
    if (!handler) return;
    const normalized = normalizeRows(layoutRows);
    const snapshot = JSON.stringify(normalized);
    if (snapshot === lastSyncedSnapshotRef.current) return;
    lastSyncedSnapshotRef.current = snapshot;
    handler(normalized);
  }, [layoutRows, listing]);

  if (!listing) return null;

  const updateLayoutRow = (index: number, patch: Partial<ListingLayoutDetail>) => {
    setLayoutRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index
          ? {
              layout: patch.layout ?? row.layout,
              floor: patch.floor ?? row.floor,
              monthlyRentYen:
                patch.monthlyRentYen !== undefined ? patch.monthlyRentYen : row.monthlyRentYen,
              areaSqm: patch.areaSqm !== undefined ? patch.areaSqm : row.areaSqm,
            }
          : row
      )
    );
  };

  const addLayoutRow = () => {
    setLayoutRows((prev) => [
      ...prev,
      { layout: "", floor: "", monthlyRentYen: null, areaSqm: null },
    ]);
  };

  const removeLayoutRow = (index: number) => {
    setLayoutRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const listingUrlLabel = (() => {
    if (!listingUrl) return "";
    try {
      const parsed = new URL(listingUrl);
      const path = parsed.pathname.replace(/\/$/, "");
      return `${parsed.hostname}${path}`;
    } catch {
      return listingUrl;
    }
  })();

  const listingPriceText = listing.priceDisplay ?? formatManYen(listing.priceYen ?? null);
  const listingYieldText = formatPercent(listing.yieldPercent ?? null);
  const listingAnnualText = formatManYen(listing.annualRentYen ?? null);
  const listingMonthlyText = formatManYen(listing.monthlyRentYen ?? null);
  const listingIncomeText = listingAnnualText
    ? `${listingAnnualText}${listingMonthlyText ? ` (${listingMonthlyText}/月)` : ""}`
    : listingMonthlyText
      ? `${listingMonthlyText}/月`
      : null;
  const listingBuiltText = (() => {
    if (listing.builtYearMonth && listing.buildingAgeYears) {
      return `${listing.builtYearMonth} (築${listing.buildingAgeYears}年)`;
    }
    if (listing.builtYearMonth) return listing.builtYearMonth;
    if (listing.buildingAgeYears) return `築${listing.buildingAgeYears}年`;
    return null;
  })();
  const listingFloorAreaText = formatArea(listing.floorAreaSqm ?? null);
  const listingLandAreaText = formatArea(listing.landAreaSqm ?? null);
  const listingPrivateRoadText = formatArea(listing.privateRoadAreaSqm ?? null);
  const listingUnitCountText =
    listing.unitCount !== null && listing.unitCount !== undefined
      ? `${listing.unitCount}戸`
      : null;
  const listingTotalUnitsText =
    listing.totalUnits !== null && listing.totalUnits !== undefined
      ? `${listing.totalUnits}戸`
      : null;
  const listingCoverageText = formatPercent(listing.buildingCoveragePercent ?? null);
  const listingFarText = formatPercent(listing.floorAreaRatioPercent ?? null);
  const listingTitle = listing.propertyName ?? listing.title ?? null;
  const mapsEmbedApiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
  const mapSearchQuery = (listing.address ?? "").trim() || listingTitle || "";
  const mapEmbedUrl = mapSearchQuery
    ? mapsEmbedApiKey
      ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
          mapsEmbedApiKey
        )}&q=${encodeURIComponent(mapSearchQuery)}&zoom=17&language=ja&maptype=roadmap`
      : `https://maps.google.com/maps?output=embed&hl=ja&z=17&iwloc=B&q=${encodeURIComponent(
          mapSearchQuery
        )}`
    : null;
  const stationWalkMinutes = extractStationWalkMinutes(listing.access ?? null);
  const stationWalkWarningMinute = stationWalkMinutes.find((minute) => minute >= 11) ?? null;
  const roadAccessHasPrivateRoad = (listing.roadAccess ?? "").includes("私道");
  const landRightNotOwnership = !!listing.landRight && !listing.landRight.includes("所有権");
  const cityPlanningText = (listing.cityPlanningArea ?? "").replace(/\s/g, "");
  const isUrbanizedArea = /市街化(区域|地域)/.test(cityPlanningText);
  const cityPlanningNotUrbanized = !!cityPlanningText && !isUrbanizedArea;

  const listingFacts: ListingFact[] = [
    { label: "物件名", value: listingTitle },
    { label: "所在地", value: listing.address ?? null },
    {
      label: "交通",
      value: listing.access ?? null,
      warning: stationWalkWarningMinute
        ? `駅徒歩${stationWalkWarningMinute}分（11分以上）`
        : undefined,
    },
    { label: "販売価格", value: listingPriceText },
    { label: "表面利回り", value: listingYieldText },
    { label: "想定年間収入", value: listingIncomeText },
    { label: "建物構造", value: listing.structure ?? null },
    { label: "築年月", value: listingBuiltText },
    {
      label: "土地権利",
      value: listing.landRight ?? null,
      warning: landRightNotOwnership ? "所有権以外" : undefined,
    },
    { label: "建物面積", value: listingFloorAreaText },
    { label: "土地面積", value: listingLandAreaText },
    { label: "私道負担面積", value: listingPrivateRoadText },
    { label: "間取り", value: listing.layout ?? null },
    { label: "階数", value: listing.floors ?? null },
    { label: "総戸数", value: listingTotalUnitsText },
    { label: "住戸数", value: listingUnitCountText },
    { label: "駐車場", value: listing.parking ?? null },
    { label: "建ぺい率", value: listingCoverageText },
    { label: "容積率", value: listingFarText },
    {
      label: "接道状況",
      value: listing.roadAccess ?? null,
      warning: roadAccessHasPrivateRoad ? "私道を含む" : undefined,
    },
    { label: "地目", value: listing.landCategory ?? null },
    {
      label: "都市計画区域",
      value: listing.cityPlanningArea ?? null,
      warning: cityPlanningNotUrbanized ? "市街化区域以外" : undefined,
    },
    { label: "用途地域", value: listing.zoning ?? null },
    { label: "国土法届出", value: listing.nationalLandReport ?? null },
    { label: "現況", value: listing.currentStatus ?? null },
    { label: "引渡可能年月", value: listing.handoverDate ?? null },
    { label: "建築確認番号", value: listing.buildingConfirmationNumber ?? null },
    { label: "取引態様", value: listing.transactionType ?? null },
    { label: "管理番号", value: listing.managementNumber ?? null },
    { label: "次回更新予定日", value: listing.nextUpdateDate ?? null },
    { label: "情報登録日", value: listing.infoRegisteredDate ?? null },
    { label: "注意事項", value: listing.notes ?? null },
  ].filter((item) => hasValue(item.value));

  const pairsPerRow = 3;
  const paddedFacts = [...listingFacts];
  const warningFacts = listingFacts.filter((item) => item.warning);
  const remainder = paddedFacts.length % pairsPerRow;
  if (remainder !== 0) {
    const missing = pairsPerRow - remainder;
    for (let i = 0; i < missing; i += 1) {
      paddedFacts.push({ label: "", value: "", placeholder: true });
    }
  }

  return (
    <div className="sheet-card listing-summary-card">
      <div className="listing-summary-head">
        <div className="listing-summary-title">
          {listing.propertyType ? (
            <span className="listing-chip">{listing.propertyType}</span>
          ) : null}
          {listingTitle ? <div className="listing-title">{listingTitle}</div> : null}
        </div>
      </div>
      {listingFacts.length ? (
        <div className="listing-table" role="table" aria-label="取得した物件情報">
          {paddedFacts.flatMap((item, index) => [
            <div
              key={`label-${index}`}
              className={`listing-table-label${item.placeholder ? " is-placeholder" : ""}${
                item.warning ? " is-warning" : ""
              }`}
              aria-hidden={item.placeholder ? "true" : undefined}
              title={item.warning}
            >
              {item.label}
              {item.warning ? <span className="listing-warning-mark">!</span> : null}
            </div>,
            <div
              key={`value-${index}`}
              className={`listing-table-value${item.placeholder ? " is-placeholder" : ""}${
                item.warning ? " is-warning" : ""
              }`}
              aria-hidden={item.placeholder ? "true" : undefined}
              title={item.warning}
            >
              {item.value}
            </div>,
          ])}
        </div>
      ) : (
        <div className="listing-empty">表示できる項目がありません。</div>
      )}
      <div className="listing-layout-split">
        {mapEmbedUrl ? (
          <div className="listing-map-card">
            <div className="listing-map-frame-wrap">
              <iframe
                title="物件位置マップ"
                src={mapEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="listing-map-frame"
              />
            </div>
          </div>
        ) : null}
        <div className="listing-layout-editor">
          <div className="listing-layout-editor-table">
            <div className="listing-layout-editor-header">
              <span>間取り</span>
              <span>階</span>
              <span>家賃(万円/月)</span>
              <span>広さ(㎡)</span>
              <span>操作</span>
            </div>
            {layoutRows.length === 0 ? (
              <div className="listing-layout-editor-empty">行を追加して入力してください。</div>
            ) : (
              layoutRows.map((row, index) => (
                <div key={`layout-row-${index}`} className="listing-layout-editor-row">
                  <input
                    className="field-input listing-layout-editor-input"
                    value={row.layout}
                    onChange={(event) => updateLayoutRow(index, { layout: event.target.value })}
                    placeholder="例: 1K"
                  />
                  <input
                    className="field-input listing-layout-editor-input"
                    value={row.floor}
                    onChange={(event) => updateLayoutRow(index, { floor: event.target.value })}
                    placeholder="例: 2階"
                  />
                  <input
                    className="field-input listing-layout-editor-input"
                    type="number"
                    inputMode="decimal"
                    value={toInputManYen(row.monthlyRentYen)}
                    onChange={(event) =>
                      updateLayoutRow(index, {
                        monthlyRentYen: parseManYenInput(event.target.value),
                      })
                    }
                    placeholder="例: 6.8"
                  />
                  <input
                    className="field-input listing-layout-editor-input"
                    type="number"
                    inputMode="decimal"
                    value={toInputArea(row.areaSqm)}
                    onChange={(event) =>
                      updateLayoutRow(index, {
                        areaSqm: parseAreaInput(event.target.value),
                      })
                    }
                    placeholder="例: 21.5"
                  />
                  <button
                    type="button"
                    className="chip-button listing-layout-editor-remove"
                    onClick={() => removeLayoutRow(index)}
                  >
                    削除
                  </button>
                </div>
              ))
            )}
            <div className="listing-layout-editor-footer">
              <button
                type="button"
                className="chip-button listing-layout-editor-add"
                onClick={addLayoutRow}
                aria-label="行を追加"
                title="行を追加"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
      {warningFacts.length ? (
        <div className="listing-warning-list">
          {warningFacts.map((fact) => (
            <div key={`warn-${fact.label}`} className="listing-warning-item">
              <span className="listing-warning-mark">!</span>
              <span>
                {fact.label}: {fact.warning}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {listingUrl ? (
        <a
          className="listing-url"
          href={listingUrl}
          target="_blank"
          rel="noreferrer"
          title={listingUrl}
        >
          {listingUrlLabel}
        </a>
      ) : null}
    </div>
  );
};
