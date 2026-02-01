"use client";

import type { ListingPreview } from "./RakumachiImporter";

type ListingSummaryProps = {
  listing: ListingPreview | null;
  listingUrl?: string | null;
};

type ListingFact = {
  label: string;
  value: string | null;
  placeholder?: boolean;
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

export const ListingSummary = ({ listing, listingUrl }: ListingSummaryProps) => {
  if (!listing) return null;

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

  const listingFacts: ListingFact[] = [
    { label: "物件名", value: listingTitle },
    { label: "所在地", value: listing.address ?? null },
    { label: "交通", value: listing.access ?? null },
    { label: "販売価格", value: listingPriceText },
    { label: "表面利回り", value: listingYieldText },
    { label: "想定年間収入", value: listingIncomeText },
    { label: "建物構造", value: listing.structure ?? null },
    { label: "築年月", value: listingBuiltText },
    { label: "土地権利", value: listing.landRight ?? null },
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
    { label: "接道状況", value: listing.roadAccess ?? null },
    { label: "地目", value: listing.landCategory ?? null },
    { label: "都市計画区域", value: listing.cityPlanningArea ?? null },
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
              className={`listing-table-label${item.placeholder ? " is-placeholder" : ""}`}
              aria-hidden={item.placeholder ? "true" : undefined}
            >
              {item.label}
            </div>,
            <div
              key={`value-${index}`}
              className={`listing-table-value${item.placeholder ? " is-placeholder" : ""}`}
              aria-hidden={item.placeholder ? "true" : undefined}
            >
              {item.value}
            </div>,
          ])}
        </div>
      ) : (
        <div className="listing-empty">表示できる項目がありません。</div>
      )}
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
