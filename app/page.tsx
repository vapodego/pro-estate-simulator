"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SimulationForm } from "../components/SimulationForm";
import { SimulationChart } from "../components/SimulationChart";
import { RakumachiImporter, ImportHistoryItem } from "../components/RakumachiImporter";
import { ListingSummary } from "../components/ListingSummary";
import { calculateNPV, calculateIRR } from "../utils/finance";
import { calculateSimulation, calculatePMT, calculateUsefulLife } from "../utils/simulation";
import { PropertyInput, ScenarioConfig, YearlyResult } from "../utils/types";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type User,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, googleProvider } from "../utils/firebase";
import { Building2, Calculator, History, Save, UserCircle } from "lucide-react";
import { applyEstimatedDefaultsWithMeta } from "../utils/estimates";

// デフォルトの初期値（空の状態）
const DEFAULT_INPUT: PropertyInput = {
  price: 0,
  buildingRatio: 0,
  miscCostRate: 0,
  landEvaluationRate: 0,
  buildingEvaluationRate: 0,
  landTaxReductionRate: 0,
  propertyTaxRate: 1.7,
  newBuildTaxReductionEnabled: false,
  newBuildTaxReductionYears: 3,
  newBuildTaxReductionRate: 50,
  structure: "RC",
  buildingAge: 0,
  enableEquipmentSplit: false,
  equipmentRatio: 0,
  equipmentUsefulLife: 0,
  waterContributionRate: 0,
  fireInsuranceRate: 0,
  loanFeeRate: 0,
  registrationCostRate: 0,
  acquisitionTaxRate: 0,
  acquisitionLandReductionRate: 0,
  loanCoverageMode: "PRICE_ONLY",
  equityRatio: 0,
  loanAmount: 0,
  interestRate: 0,
  loanDuration: 0,
  monthlyRent: 0,
  occupancyRate: 0,
  occupancyDetailEnabled: false,
  occupancyRateYear1to2: 0,
  occupancyRateYear3to10: 0,
  occupancyRateYear11to20: 0,
  occupancyRateYear20to30: 0,
  occupancyRateYear30to40: 0,
  rentDeclineRate: 0,
  unitCount: 0,
  cleaningVisitsPerMonth: 0,
  operatingExpenseRate: 0,
  oerMode: "SIMPLE",
  oerRateItems: [],
  oerFixedItems: [],
  oerEventItems: [],
  oerLeasingEnabled: true,
  oerLeasingMonths: 0,
  oerLeasingTenancyYears: 0,
  repairEvents: [], // 修繕イベント
  vacancyModel: "FIXED",
  vacancyCycleYears: 0,
  vacancyCycleMonths: 0,
  vacancyProbability: 0,
  vacancyProbabilityMonths: 0,
  taxType: "CORPORATE",
  incomeTaxRate: 0,
  otherIncome: 0,
  corporateMinimumTax: 0,
  exitEnabled: false,
  exitYear: 0,
  exitCapRate: 0,
  exitBrokerageRate: 0,
  exitBrokerageFixed: 0,
  exitOtherCostRate: 0,
  exitShortTermTaxRate: 0,
  exitLongTermTaxRate: 0,
  exitDiscountRate: 0,
  scenarioEnabled: false,
  scenarioInterestShockYear: 0,
  scenarioInterestShockDelta: 0,
  scenarioRentCurveEnabled: false,
  scenarioRentDeclineEarlyRate: 0,
  scenarioRentDeclineLateRate: 0,
  scenarioRentDeclineSwitchYear: 0,
  scenarioOccupancyDeclineEnabled: false,
  scenarioOccupancyDeclineStartYear: 0,
  scenarioOccupancyDeclineDelta: 0,
};

type InvestmentDemandTrend = "UP" | "FLAT" | "DOWN" | "UNKNOWN";
type InvestmentTargetFit = "HIGH" | "MID" | "LOW" | "UNKNOWN";
type InvestmentConvenience = "HIGH" | "MID" | "LOW" | "UNKNOWN";
type InvestmentHazardRisk = "NONE" | "LOW" | "HIGH" | "UNKNOWN";
type InvestmentCompetition = "LOW" | "MID" | "HIGH" | "UNKNOWN";
type PortySigmaKey = "minus1Sigma" | "baseSigma" | "plus1Sigma";
type PortyFloorKey = "floor1" | "floor2" | "floor3";
type PortyRentRow = Record<PortySigmaKey, number | null>;
type PortyRentByFloor = Record<PortyFloorKey, PortyRentRow>;

type InvestmentInput = {
  demandTrend: InvestmentDemandTrend;
  targetFit: InvestmentTargetFit;
  walkMinutes: number | "";
  convenience: InvestmentConvenience;
  hazardRisk: InvestmentHazardRisk;
  rentGapPercent: number | "";
  competitionLevel: InvestmentCompetition;
  fieldAdjustment: number;
};

type PurchaseChecklistItem = {
  id: string;
  label: string;
};

type PurchaseChecklistSection = {
  id: string;
  title: string;
  items: PurchaseChecklistItem[];
};

type PurchaseChecklistMap = Record<string, boolean>;

const DEFAULT_INVESTMENT_INPUT: InvestmentInput = {
  demandTrend: "UNKNOWN",
  targetFit: "UNKNOWN",
  walkMinutes: "",
  convenience: "UNKNOWN",
  hazardRisk: "UNKNOWN",
  rentGapPercent: "",
  competitionLevel: "UNKNOWN",
  fieldAdjustment: 0,
};

type ExtraInfoInput = {
  memo: string;
  purchaseChecklist: PurchaseChecklistMap;
  comparableText: string;
  portyRentByFloor: PortyRentByFloor;
  populationText: string;
  ridershipText: string;
  vacancyText: string;
  landPriceText: string;
  hazard: HazardInput;
  locationChecklist: LocationChecklistInput;
};

type LocationManualLevel = "UNKNOWN" | "GOOD" | "CAUTION" | "BAD";

type LocationManualChecks = {
  slopeAndSidewalk: LocationManualLevel;
  nightLightingSafety: LocationManualLevel;
  smellVibration: LocationManualLevel;
  litterGraffiti: LocationManualLevel;
  dangerousRoads: LocationManualLevel;
};

type LocationPointSummary = {
  name: string | null;
  distanceMeters: number | null;
  durationMinutes: number | null;
  line?: string | null;
};

type LocationChecklistAuto = {
  fetchedAt: string;
  normalizedAddress: string | null;
  originLat: number | null;
  originLng: number | null;
  station: LocationPointSummary | null;
  busStop: LocationPointSummary | null;
  convenienceStore: LocationPointSummary | null;
  supermarket: LocationPointSummary | null;
  hospital: LocationPointSummary | null;
  pharmacy: LocationPointSummary | null;
  stationOptions?: LocationPointSummary[];
  busStopOptions?: LocationPointSummary[];
  convenienceOptions?: LocationPointSummary[];
  supermarketOptions?: LocationPointSummary[];
  convenienceCount800m: number | null;
  supermarketCount800m: number | null;
  hospitalCount800m: number | null;
  pharmacyCount800m: number | null;
  schoolCount800m: number | null;
  parkCount800m: number | null;
  cemeteryCount1500m: number | null;
  wasteFacilityCount1500m: number | null;
  factoryCount1500m: number | null;
};

type LocationChecklistInput = {
  address: string;
  auto: LocationChecklistAuto | null;
  manual: LocationManualChecks;
};

type HazardTypeKey = "flood" | "collapse" | "debrisFlow" | "landslide";

type HazardSelection = {
  enabled: boolean;
  severity: string;
};

type HazardInput = Record<HazardTypeKey, HazardSelection>;

const FLOOD_SEVERITY_OPTIONS = [
  { value: "20m_over", label: "20m〜", penalty: 15 },
  { value: "10m_20m", label: "10m〜20m", penalty: 12 },
  { value: "5m_10m", label: "5m〜10m", penalty: 10 },
  { value: "3m_5m", label: "3m〜5m", penalty: 8 },
  { value: "0_5m_3m", label: "0.5m〜3m", penalty: 6 },
  { value: "0_5m_1m", label: "0.5m〜1m", penalty: 4 },
  { value: "0m_0_5m", label: "〜0.5m", penalty: 2 },
  { value: "0m_0_3m", label: "〜0.3m", penalty: 1 },
] as const;

const SEDIMENT_SEVERITY_OPTIONS = [
  { value: "special", label: "特別警戒区域", penalty: 8 },
  { value: "warning", label: "警戒区域", penalty: 4 },
] as const;

const HAZARD_TYPE_LABELS: Record<HazardTypeKey, string> = {
  flood: "洪水",
  collapse: "土砂（崩壊）",
  debrisFlow: "土砂（土石流）",
  landslide: "土砂（地すべり）",
};

const DEFAULT_HAZARD_INPUT: HazardInput = {
  flood: { enabled: false, severity: FLOOD_SEVERITY_OPTIONS[0].value },
  collapse: { enabled: false, severity: SEDIMENT_SEVERITY_OPTIONS[0].value },
  debrisFlow: { enabled: false, severity: SEDIMENT_SEVERITY_OPTIONS[0].value },
  landslide: { enabled: false, severity: SEDIMENT_SEVERITY_OPTIONS[0].value },
};

const DEFAULT_LOCATION_MANUAL_CHECKS: LocationManualChecks = {
  slopeAndSidewalk: "UNKNOWN",
  nightLightingSafety: "UNKNOWN",
  smellVibration: "UNKNOWN",
  litterGraffiti: "UNKNOWN",
  dangerousRoads: "UNKNOWN",
};

const cloneLocationManualChecks = (
  source: LocationManualChecks = DEFAULT_LOCATION_MANUAL_CHECKS
): LocationManualChecks => ({
  slopeAndSidewalk: source.slopeAndSidewalk,
  nightLightingSafety: source.nightLightingSafety,
  smellVibration: source.smellVibration,
  litterGraffiti: source.litterGraffiti,
  dangerousRoads: source.dangerousRoads,
});

const createDefaultLocationChecklist = (): LocationChecklistInput => ({
  address: "",
  auto: null,
  manual: cloneLocationManualChecks(),
});

const LIFULL_OWNER_URL = "https://toushi.homes.co.jp/owner";

const PURCHASE_CHECKLIST_SECTIONS: PurchaseChecklistSection[] = [
  {
    id: "population_planning",
    title: "1. 周辺人口・施設の中長期計画の確認",
    items: [
      { id: "pop_projection_10y", label: "自治体の人口推計（10年後まで）を確認したか。" },
      { id: "univ_company_move_plan", label: "大学・企業の統合・移転計画を調べたか。" },
      { id: "public_transport_plan", label: "公共交通機関の整備計画はあるか。" },
      { id: "commercial_open_close_plan", label: "商業施設の開発・撤退予定を把握しているか。" },
    ],
  },
  {
    id: "tenant_diversity",
    title: "2. 入居者属性の偏りと多様性のチェック",
    items: [
      { id: "worker_age_1km", label: "半径1km以内の就業者数・年齢構成を確認したか。" },
      {
        id: "multi_target_location",
        label:
          "複数の入居者層が見込める立地条件か（特定の大学や工場などの単一ターゲットに依存していないか）。",
      },
      { id: "competitor_tenant_attr", label: "競合物件の入居者属性を調査したか。" },
      { id: "broker_demand_hearing", label: "賃貸仲介会社からの需要ヒアリングを行ったか。" },
      { id: "liful_homes_rental_demand", label: "LIFULL HOME'Sで賃貸需要の確認をしたか。" },
      {
        id: "liful_homes_layout_supply_demand",
        label:
          "LIFULL HOME'Sで間取りの需給バランスを確認したか。（「入居希望者の検索条件」が「掲載物件の状況」より多い割合か）",
      },
      {
        id: "liful_homes_station_walk_supply_demand",
        label: "LIFULL HOME'Sで賃貸入居者の希望する駅徒歩の需給を確認したか。",
      },
    ],
  },
  {
    id: "cashflow_scenario",
    title: "3. 空室・維持コスト含めたキャッシュフロー作成",
    items: [
      {
        id: "pessimistic_occupancy_cf",
        label:
          "入居率60〜80％などの悲観的なシナリオを含めた収支シミュレーションを行ったか。",
      },
      {
        id: "interest_shock_cf",
        label: "金利上昇リスク（＋1％、＋2％など）を考慮した返済額の変動を計算したか。",
      },
      {
        id: "fixed_cost_net_income",
        label: "税金・保険料・管理費などの固定費を算出し、実質収入を把握しているか。",
      },
    ],
  },
  {
    id: "maintenance_plan",
    title: "4. メンテナンス積立と想定修繕時期の記録",
    items: [
      {
        id: "repair_schedule_by_age",
        label: "築年数別の修繕計画を策定し、設備の更新時期を把握しているか。",
      },
      {
        id: "monthly_repair_reserve",
        label: "修繕のための月額積立金額（家賃の5〜12％程度）を適切に設定しているか。",
      },
      { id: "emergency_repair_fund", label: "緊急修繕に対応できる資金を確保しているか。" },
    ],
  },
  {
    id: "resale_value",
    title: "5. リセールバリュー（売却市場）の見極め",
    items: [
      {
        id: "trade_price_5y",
        label: "同エリアにおける過去5年間の取引価格推移を確認したか。",
      },
      { id: "pop_land_corr", label: "人口動態と地価の相関性を分析したか。" },
      { id: "investor_demand_forecast", label: "投資家需要の将来予測を立てているか。" },
      { id: "multi_exit_patterns", label: "出口戦略（売却）の複数パターンを検討しているか。" },
    ],
  },
  {
    id: "on_site_finance_rules",
    title: "6. 現地調査と資金計画の基本ルール（最終確認）",
    items: [
      {
        id: "site_visit_3times",
        label:
          "現地調査は最低3回、異なる時間帯に実施し、実際の生活環境を体感したか。",
      },
      { id: "ltv_under_80", label: "借入比率は物件価格の80％以下に抑えられているか。" },
      {
        id: "vacancy_buffer_6to12m",
        label: "少なくとも半年〜1年分の空室損失に対応できる自己資金を確保しているか。",
      },
    ],
  },
];

const createDefaultPurchaseChecklist = (): PurchaseChecklistMap => {
  const checklist: PurchaseChecklistMap = {};
  PURCHASE_CHECKLIST_SECTIONS.forEach((section) => {
    section.items.forEach((item) => {
      checklist[item.id] = false;
    });
  });
  return checklist;
};

const clonePurchaseChecklist = (
  source?: Partial<Record<string, unknown>>
): PurchaseChecklistMap => {
  const base = createDefaultPurchaseChecklist();
  if (!source) return base;
  Object.keys(base).forEach((id) => {
    const value = source[id];
    if (typeof value === "boolean") {
      base[id] = value;
    }
  });
  return base;
};

const renderPurchaseChecklistLabel = (label: string): ReactNode => {
  const keyword = "LIFULL HOME'S";
  const keywordIndex = label.indexOf(keyword);
  if (keywordIndex < 0) return label;
  const before = label.slice(0, keywordIndex);
  const after = label.slice(keywordIndex + keyword.length);
  return (
    <>
      {before}
      <a
        className="extra-info-inline-link"
        href={LIFULL_OWNER_URL}
        target="_blank"
        rel="noreferrer"
      >
        {keyword}
      </a>
      {after}
    </>
  );
};

const createDefaultPortyRentByFloor = (): PortyRentByFloor => ({
  floor1: { minus1Sigma: null, baseSigma: null, plus1Sigma: null },
  floor2: { minus1Sigma: null, baseSigma: null, plus1Sigma: null },
  floor3: { minus1Sigma: null, baseSigma: null, plus1Sigma: null },
});

const clonePortyRentByFloor = (source?: PortyRentByFloor): PortyRentByFloor => ({
  floor1: {
    minus1Sigma: source?.floor1?.minus1Sigma ?? null,
    baseSigma: source?.floor1?.baseSigma ?? null,
    plus1Sigma: source?.floor1?.plus1Sigma ?? null,
  },
  floor2: {
    minus1Sigma: source?.floor2?.minus1Sigma ?? null,
    baseSigma: source?.floor2?.baseSigma ?? null,
    plus1Sigma: source?.floor2?.plus1Sigma ?? null,
  },
  floor3: {
    minus1Sigma: source?.floor3?.minus1Sigma ?? null,
    baseSigma: source?.floor3?.baseSigma ?? null,
    plus1Sigma: source?.floor3?.plus1Sigma ?? null,
  },
});

const cloneHazardInput = (source: HazardInput = DEFAULT_HAZARD_INPUT): HazardInput => ({
  flood: { ...source.flood },
  collapse: { ...source.collapse },
  debrisFlow: { ...source.debrisFlow },
  landslide: { ...source.landslide },
});

const createDefaultExtraInfo = (): ExtraInfoInput => ({
  memo: "",
  purchaseChecklist: createDefaultPurchaseChecklist(),
  comparableText: "",
  portyRentByFloor: createDefaultPortyRentByFloor(),
  populationText: "",
  ridershipText: "",
  vacancyText: "",
  landPriceText: "",
  hazard: cloneHazardInput(),
  locationChecklist: createDefaultLocationChecklist(),
});

const DEFAULT_EXTRA_INFO: ExtraInfoInput = createDefaultExtraInfo();

const LOCATION_MANUAL_LABELS: Record<keyof LocationManualChecks, string> = {
  slopeAndSidewalk: "坂道・歩道状況",
  nightLightingSafety: "夜間の明るさ・安全性",
  smellVibration: "臭い・振動",
  litterGraffiti: "落書き・ゴミ散乱",
  dangerousRoads: "危険な道路・交差点",
};

const LOCATION_MANUAL_LEVEL_OPTIONS: Array<{ value: LocationManualLevel; label: string }> = [
  { value: "UNKNOWN", label: "未確認" },
  { value: "GOOD", label: "問題なし" },
  { value: "CAUTION", label: "注意" },
  { value: "BAD", label: "懸念あり" },
];

const PORTY_FLOOR_LABELS: Record<PortyFloorKey, string> = {
  floor1: "1階",
  floor2: "2階",
  floor3: "3階",
};

const PORTY_SIGMA_COLUMNS: Array<{ key: PortySigmaKey; label: string }> = [
  { key: "minus1Sigma", label: "-1σ" },
  { key: "baseSigma", label: "0" },
  { key: "plus1Sigma", label: "+1σ" },
];

const normalizeExtraInfo = (value: unknown): ExtraInfoInput => {
  if (!value || typeof value !== "object") {
    return createDefaultExtraInfo();
  }
  const source = value as Partial<Record<keyof ExtraInfoInput, unknown>>;
  const rawPurchaseChecklist =
    source.purchaseChecklist && typeof source.purchaseChecklist === "object"
      ? (source.purchaseChecklist as Partial<Record<string, unknown>>)
      : undefined;
  const hazardSource =
    source.hazard && typeof source.hazard === "object"
      ? (source.hazard as Partial<Record<HazardTypeKey, unknown>>)
      : {};
  const rawLocationChecklist =
    source.locationChecklist && typeof source.locationChecklist === "object"
      ? (source.locationChecklist as Partial<Record<keyof LocationChecklistInput, unknown>>)
      : {};
  const rawLocationManual =
    rawLocationChecklist.manual && typeof rawLocationChecklist.manual === "object"
      ? (rawLocationChecklist.manual as Partial<Record<keyof LocationManualChecks, unknown>>)
      : {};
  const normalizeManualLevel = (value: unknown): LocationManualLevel =>
    value === "GOOD" || value === "CAUTION" || value === "BAD" ? value : "UNKNOWN";
  const rawLocationAuto =
    rawLocationChecklist.auto && typeof rawLocationChecklist.auto === "object"
      ? (rawLocationChecklist.auto as Partial<LocationChecklistAuto>)
      : null;
  const normalizePoint = (value: unknown): LocationPointSummary | null => {
    if (!value || typeof value !== "object") return null;
    const point = value as Partial<LocationPointSummary>;
    return {
      name: typeof point.name === "string" ? point.name : null,
      distanceMeters: typeof point.distanceMeters === "number" ? point.distanceMeters : null,
      durationMinutes: typeof point.durationMinutes === "number" ? point.durationMinutes : null,
      line: typeof point.line === "string" ? point.line : null,
    };
  };
  const normalizePointList = (value: unknown): LocationPointSummary[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => normalizePoint(item))
      .filter((item): item is LocationPointSummary => item !== null);
  };
  const normalizeCount = (value: unknown) => (typeof value === "number" ? value : null);
  const rawPortyRentByFloor =
    source.portyRentByFloor && typeof source.portyRentByFloor === "object"
      ? (source.portyRentByFloor as Partial<Record<PortyFloorKey, unknown>>)
      : {};
  const normalizeRentValue = (value: unknown): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const normalizePortyRow = (value: unknown): PortyRentRow => {
    if (!value || typeof value !== "object") {
      return { minus1Sigma: null, baseSigma: null, plus1Sigma: null };
    }
    const row = value as Partial<Record<PortySigmaKey, unknown>>;
    return {
      minus1Sigma: normalizeRentValue(row.minus1Sigma),
      baseSigma: normalizeRentValue(row.baseSigma),
      plus1Sigma: normalizeRentValue(row.plus1Sigma),
    };
  };
  const normalizeHazardItem = (
    key: HazardTypeKey,
    defaultSeverity: string
  ): HazardSelection => {
    const entry = hazardSource[key];
    if (!entry || typeof entry !== "object") {
      return { ...DEFAULT_HAZARD_INPUT[key] };
    }
    const raw = entry as Partial<Record<keyof HazardSelection, unknown>>;
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
      severity: typeof raw.severity === "string" ? raw.severity : defaultSeverity,
    };
  };
  return {
    memo: typeof source.memo === "string" ? source.memo : "",
    purchaseChecklist: clonePurchaseChecklist(rawPurchaseChecklist),
    comparableText: typeof source.comparableText === "string" ? source.comparableText : "",
    portyRentByFloor: clonePortyRentByFloor({
      floor1: normalizePortyRow(rawPortyRentByFloor.floor1),
      floor2: normalizePortyRow(rawPortyRentByFloor.floor2),
      floor3: normalizePortyRow(rawPortyRentByFloor.floor3),
    }),
    populationText: typeof source.populationText === "string" ? source.populationText : "",
    ridershipText: typeof source.ridershipText === "string" ? source.ridershipText : "",
    vacancyText: typeof source.vacancyText === "string" ? source.vacancyText : "",
    landPriceText: typeof source.landPriceText === "string" ? source.landPriceText : "",
    hazard: {
      flood: normalizeHazardItem("flood", FLOOD_SEVERITY_OPTIONS[0].value),
      collapse: normalizeHazardItem("collapse", SEDIMENT_SEVERITY_OPTIONS[0].value),
      debrisFlow: normalizeHazardItem("debrisFlow", SEDIMENT_SEVERITY_OPTIONS[0].value),
      landslide: normalizeHazardItem("landslide", SEDIMENT_SEVERITY_OPTIONS[0].value),
    },
    locationChecklist: {
      address:
        typeof rawLocationChecklist.address === "string" ? rawLocationChecklist.address : "",
      auto: rawLocationAuto
        ? {
            fetchedAt:
              typeof rawLocationAuto.fetchedAt === "string"
                ? rawLocationAuto.fetchedAt
                : "",
            normalizedAddress:
              typeof rawLocationAuto.normalizedAddress === "string"
                ? rawLocationAuto.normalizedAddress
                : null,
            originLat: typeof rawLocationAuto.originLat === "number" ? rawLocationAuto.originLat : null,
            originLng: typeof rawLocationAuto.originLng === "number" ? rawLocationAuto.originLng : null,
            station: normalizePoint(rawLocationAuto.station),
            busStop: normalizePoint(rawLocationAuto.busStop),
            convenienceStore: normalizePoint(rawLocationAuto.convenienceStore),
            supermarket: normalizePoint(rawLocationAuto.supermarket),
            hospital: normalizePoint(rawLocationAuto.hospital),
            pharmacy: normalizePoint(rawLocationAuto.pharmacy),
            stationOptions: normalizePointList(rawLocationAuto.stationOptions),
            busStopOptions: normalizePointList(rawLocationAuto.busStopOptions),
            convenienceOptions: normalizePointList(rawLocationAuto.convenienceOptions),
            supermarketOptions: normalizePointList(rawLocationAuto.supermarketOptions),
            convenienceCount800m: normalizeCount(rawLocationAuto.convenienceCount800m),
            supermarketCount800m: normalizeCount(rawLocationAuto.supermarketCount800m),
            hospitalCount800m: normalizeCount(rawLocationAuto.hospitalCount800m),
            pharmacyCount800m: normalizeCount(rawLocationAuto.pharmacyCount800m),
            schoolCount800m: normalizeCount(rawLocationAuto.schoolCount800m),
            parkCount800m: normalizeCount(rawLocationAuto.parkCount800m),
            cemeteryCount1500m: normalizeCount(rawLocationAuto.cemeteryCount1500m),
            wasteFacilityCount1500m: normalizeCount(rawLocationAuto.wasteFacilityCount1500m),
            factoryCount1500m: normalizeCount(rawLocationAuto.factoryCount1500m),
          }
        : null,
      manual: {
        slopeAndSidewalk: normalizeManualLevel(rawLocationManual.slopeAndSidewalk),
        nightLightingSafety: normalizeManualLevel(rawLocationManual.nightLightingSafety),
        smellVibration: normalizeManualLevel(rawLocationManual.smellVibration),
        litterGraffiti: normalizeManualLevel(rawLocationManual.litterGraffiti),
        dangerousRoads: normalizeManualLevel(rawLocationManual.dangerousRoads),
      },
    },
  };
};

const DEFAULT_LEFT_ORDER = [
  "tip",
  "breakdownPrice",
  "breakdownInitial",
  "breakdownTax",
  "breakdownDep",
  "breakdownLoan",
];
const DEFAULT_RIGHT_ORDER = [
  "kpi",
  "investmentScore",
  "charts",
  "cashflow",
  "simulation",
  "repayment",
  "exit",
  "scenario",
];

const normalizeUrl = (url: string) => url.trim();

const hashUrl = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

type TableRow = {
  label: string;
  value: (result: YearlyResult) => number;
  tone?: "negative" | "subtle" | "highlight" | "highlight-strong";
  outflow?: boolean;
  rowHighlight?: boolean;
  format?: "yen" | "percent" | "ratio";
};

type TableSection = {
  title: string;
  rows: TableRow[];
};

type SavedSimulation = {
  id: string;
  name: string;
  createdAt: Date | null;
  input: PropertyInput;
  listing: ImportHistoryItem["listing"];
  listingUrl: string | null;
  extraInfo: ExtraInfoInput;
  aiMessages: { role: "user" | "assistant"; content: string }[];
};

type AnalysisRunItem = {
  id: string;
  url: string;
  listing: ImportHistoryItem["listing"];
  input: PropertyInput;
  extraInfo: ExtraInfoInput;
  aiMessages: { role: "user" | "assistant"; content: string }[];
  createdAt: Date | null;
  updatedAt: Date | null;
};

type SortableCardProps = {
  id: string;
  children: ReactNode;
};

const SortableCard = ({ id, children }: SortableCardProps) => {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={`sortable-item${isDragging ? " is-dragging" : ""}`}>
      <div className="sortable-content">
        <button
          type="button"
          className="drag-band"
          ref={setActivatorNodeRef}
          aria-label="並び替え"
          {...listeners}
          {...attributes}
        />
        {children}
      </div>
    </div>
  );
};

const formatCell = (
  value: number,
  outflow?: boolean,
  format: "yen" | "percent" | "ratio" = "yen"
) => {
  if (!Number.isFinite(value)) return "-";
  if (format === "percent") {
    return `${value.toFixed(2)}%`;
  }
  if (format === "ratio") {
    return value.toFixed(2);
  }
  const abs = Math.round(Math.abs(value));
  let prefix = "";
  if (outflow) {
    prefix = "▲";
  } else if (value < 0) {
    prefix = "-";
  }
  return `${prefix}${abs.toLocaleString()}円`;
};

const formatYen = (value: number) => `${Math.round(value).toLocaleString()}円`;
const formatPercent = (value: number) => `${value.toFixed(2)}%`;
const formatMultiple = (value: number) => `${value.toFixed(2)}x`;
const formatRatio = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : "-");
type KpiRisk = "good" | "warn" | "bad" | "neutral";
type KpiInfo = {
  title: string;
  summary: string;
  detail: string;
  formula?: string;
  threshold?: string;
};
const KPI_INFO: Record<string, KpiInfo> = {
  dscr: {
    title: "DSCR",
    summary:
      "物件が生む純収益（NOI）が年間元利返済額（ADS）をどれだけ余裕を持ってカバーできるかを示す、最重要の安全指標。",
    detail:
      "金融機関が最重視する指標の一つで、運営経費を過小評価すると実態より高く見えてしまいます。固定資産税・都市計画税、管理委託費、将来修繕の積立などを含めた“実質NOI”で評価するのが実務的です。1.30以上は理想水準、1.20前後は審査ライン、1.00〜1.10は警戒域で、軽微な空室や金利上昇で資金繰りが崩れやすくなります。",
    formula: "NOI / 年間元利返済額(ADS)",
    threshold: "1.30以上が安全圏",
  },
  dscrStress: {
    title: "DSCR（+1%）",
    summary: "金利が1%上昇した想定での返済余力。",
    detail:
      "低金利環境ではDSCRが高く見えがちですが、金利が1%上がるとADSが増えDSCRが急落することがあります。安全余裕を持たせるには、ストレス後でも1.0を割り込まない設計が望ましいです。",
    formula: "金利+1%時のNOI / ADS",
    threshold: "1.20以上が目安",
  },
  repaymentRatio: {
    title: "返済比率",
    summary: "満室時の年収（GPI）に対する年間返済額（ADS）の割合。",
    detail:
      "直感的な安全指標です。返済比率が60%になると、運営経費20%＋空室損10%を仮定しただけで残りが10%になり、突発修繕で赤字化しやすくなります。安全圏は45〜50%以下。",
    formula: "年間返済額(ADS) / 満室年収(GPI)",
    threshold: "50%以下が目安",
  },
  ber: {
    title: "損益分岐点入居率",
    summary: "赤字にならない最低限の入居率（空室耐性）。",
    detail:
      "運営経費＋返済が満室家賃の何%を占めるかを示します。80%以下なら空室が20〜30%でも耐えられる計算ですが、85%以上だと常時満室が前提となり危険度が高いです。",
    formula: "(運営経費+ADS) / 満室年収(GPI)",
    threshold: "80%以下が目安",
  },
  noiYield: {
    title: "実質利回り（NOI）",
    summary: "運営費を差し引いた後の実質利回り。",
    detail:
      "表面利回りではなく、運営コストを引いた収益力を見ます。分母は物件価格だけでなく諸経費込みの取得総額で評価するのが実務的です。",
    formula: "NOI / 取得総額",
    threshold: "金利+1.5〜2.0%を目安",
  },
  yieldGap: {
    title: "イールドギャップ",
    summary: "実質利回りと借入金利の差。",
    detail:
      "差が十分にプラスならレバレッジが効きます。ギャップが薄い、またはマイナスの場合は借入するほど投資効率が下がる“負のレバレッジ”になり得ます。",
    formula: "実質利回り - 金利",
    threshold: "+1.5%以上が目安",
  },
  ccrPreTax: {
    title: "CCR（税引前）",
    summary: "自己資金に対する税引前キャッシュフローの効率。",
    detail:
      "投下自己資金に対する年間手残りの効率性を示します。CCRを高めるための過度な借入はDSCRや返済比率を悪化させるため、安全性とのバランスが重要です。",
    formula: "税引前CF / 自己資金",
    threshold: "5〜10%が標準",
  },
  ccrPostTax: {
    title: "CCR（税引後）",
    summary: "税金を支払った後の自己資金効率。",
    detail:
      "税負担やデッドクロス影響を含めた実質的な効率を示します。税引前と比べて落ち込みが大きい場合は、節税設計や出口戦略の見直しが必要です。",
    formula: "税引後CF / 自己資金",
    threshold: "4〜8%が目安",
  },
  atcf: {
    title: "税引後CF（ATCF）",
    summary: "税金まで差し引いた年間の手残り。",
    detail:
      "税引前CFがプラスでも、税負担でマイナスになる場合があります。ATCFが赤字に転じる年がないかを確認することが重要です。",
    threshold: "0円以上が望ましい",
  },
  cashFlow10yWithExit: {
    title: "10年CF累計+売却手残り",
    summary: "1〜10年の税引後CF累計に、出口時の売却手残りを加えた合計。",
    detail:
      "中期運用での現金回収力を一目で確認するための指標です。売却年を10年以外に設定している場合でも、10年累計CFに設定売却年の手残りを合算します。",
    formula: "Σ(1〜10年の税引後CF) + 売却手残り",
    threshold: "0円以上が目安",
  },
  deadCross: {
    title: "デッドクロス",
    summary: "元金返済が減価償却費を上回るタイミング。",
    detail:
      "減価償却が減る一方、元金返済は経費にならないため税負担が増え、手残りが急に細くなります。到来年数を把握して出口や繰上返済の判断に使います。",
    threshold: "できるだけ遅い方が良い",
  },
};
type KpiInfoKey = keyof typeof KPI_INFO;
type TableRowInfo = {
  title: string;
  body: string;
  note?: string;
};
const TABLE_ROW_INFO: Record<string, TableRowInfo> = {
  家賃収入: {
    title: "家賃収入",
    body:
      "説明：その年に入ってくる賃料収入（入居率・家賃下落などを反映後）。\n影響：増えるほどCFが改善。入居率・賃料設定・空室モデルが主因です。",
  },
  元本返済: {
    title: "元本返済",
    body:
      "説明：ローン返済のうち「元金（借入残高が減る部分）」の支払額。\n影響：CF上はマイナス。ただし資産（自己資本）を積み上げる効果があります。",
  },
  借入利息: {
    title: "借入利息",
    body:
      "説明：ローン返済のうち「利息（金融機関に支払うコスト）」の支払額。\n影響：CFを直接圧迫。金利・借入額・残高（初期ほど大きい）で増減します。",
  },
  返済利息: {
    title: "返済利息",
    body:
      "説明：ローン返済のうち「利息（金融機関に支払うコスト）」の支払額。\n影響：CFを直接圧迫。金利・借入額・残高（初期ほど大きい）で増減します。",
  },
  "固定資産税・都市計画税": {
    title: "固定資産税・都市計画税",
    body:
      "説明：毎年発生する不動産の保有税（自治体に支払う税金）。\n影響：CFを下げる固定費。評価額・税率・住宅用地特例の有無で変わります。",
  },
  修繕費: {
    title: "修繕費",
    body:
      "説明：設備故障対応や原状回復、定期修繕などの費用（設定により積立/イベント含む）。\n影響：CFを下げます。築年数、修繕イベント設定、物件の品質でブレやすい項目です。",
  },
  不動産取得税: {
    title: "不動産取得税",
    body:
      "説明：購入後に一度だけ（または分割で）発生し得る税金。\n影響：発生年のCFを下げます。評価額・軽減の有無で変わります。",
  },
  管理費等経費: {
    title: "管理費等経費",
    body:
      "説明：管理委託料、清掃、共用部光熱、募集費（AD等）、保険など運営に必要な経費の合計。\n影響：増えるとNOIとCFが悪化。OER（運営経費率）や内訳設定が主因です。",
  },
  所得税: {
    title: "所得税",
    body:
      "説明：不動産所得に対して発生する税金（概算）。\n影響：CFを下げます。家賃収入−経費−減価償却など「課税所得」の計算結果で変動します。",
  },
  所得税概算: {
    title: "所得税概算",
    body:
      "説明：上の「所得概算」から計算した税額の目安。\n影響：税率や個人/法人の前提で変わります。正確には税理士・確定申告の計算に準拠します。",
  },
  減価償却費: {
    title: "減価償却費",
    body:
      "説明：建物・設備の価値を年数で費用化する会計上の経費（現金支出は伴わない）。\n影響：課税所得を下げやすく、所得税を抑える方向に働きます（ただしCFそのものは増えません）。",
  },
  経費計: {
    title: "経費計",
    body:
      "説明：運営費（管理・修繕・税など）＋必要に応じて取得税等を含む、その年の費用合計。\n影響：増えるとNOIとCFが悪化。内訳を見て「一時費用」か「恒常費用」か切り分けが重要です。",
  },
  所得概算: {
    title: "所得概算",
    body:
      "説明：不動産の「税務上の利益」の概算（収入−経費−減価償却 など）。\n影響：プラスが大きいほど課税が増え、マイナスなら損失（損益通算等は前提による）になります。",
  },
  "法人税(15/23%)": {
    title: "法人税(15/23%)",
    body:
      "法人所得の階層に応じた税率で算出した法人税等です。税額が増えるほどCFは悪化します。",
  },
  法人均等割: {
    title: "法人均等割",
    body: "赤字でも発生する法人住民税の均等割です。固定的にCFを下げます。",
  },
  支払計: {
    title: "支払計",
    body:
      "説明：その年に出ていく支払いの合計（税・経費・返済など）。\n影響：支払計が大きいほどCFが悪化。内訳のどこが増えているか確認が重要です。",
  },
  年度収支: {
    title: "年度収支",
    body:
      "説明：その年の最終的な手残り（概算CF）。\n影響：プラスなら現金が増え、マイナスなら持ち出し。家賃収入と返済・経費のバランスで決まります。",
  },
  売却手残り: {
    title: "売却手残り",
    body: "売却年に一度だけ計上される売却後の手残り額です。",
  },
  売却込み年度収支: {
    title: "売却込み年度収支",
    body: "年度収支に売却手残りを加えた年次キャッシュフローです。",
  },
  元金: {
    title: "元金",
    body:
      "説明：月々の返済のうち、借入残高が減る部分。\n影響：初期は小さく、時間とともに増える傾向（元利均等）。",
  },
  利息: {
    title: "利息",
    body:
      "説明：月々の返済のうち、金利コスト部分。\n影響：初期ほど大きく、残高が減るにつれ減少します。",
  },
  月額返済計: {
    title: "月額返済計",
    body:
      "説明：毎月の返済額（元金＋利息）。\n影響：CFに直接影響。金利・期間・借入額で決まります。",
  },
  "借入残高 (年末)": {
    title: "借入残高",
    body:
      "説明：年末時点で残っている借入元本。\n影響：翌年以降の利息計算のベース。残高が減るほど利息負担は軽くなります。",
  },
  借入残高: {
    title: "借入残高",
    body:
      "説明：その時点で残っているローン元本。\n影響：残高が大きいほど利息負担が重くなりやすい。元本返済が進むと徐々に減ります。",
  },
  年間返済額: {
    title: "年間返済額",
    body:
      "説明：その年の返済総額（元金＋利息）。\n影響：CFを押し下げる主要要因。金利上昇時に増えやすいです。",
  },
  年間返済元金: {
    title: "年間返済元金",
    body:
      "説明：その年に返した「元本」の合計。\n影響：CF上はマイナスですが、借入残高が減り、資産形成（自己資本増）に繋がります。",
  },
  年間返済利息: {
    title: "年間返済利息",
    body:
      "説明：その年に支払った「利息」の合計。\n影響：CFと収益性を直接悪化。金利上昇時に増えやすい項目です。",
  },
  年間返済計: {
    title: "年間返済計",
    body:
      "説明：元金＋利息の年間合計返済額。\n影響：返済が重いほどCFが悪化。期間を伸ばすと軽く、金利が上がると重くなります。",
  },
  "うち元金": {
    title: "うち元金",
    body:
      "説明：年間返済額のうち元本部分。\n影響：CFは減るが、残高を減らし自己資本を積み上げます。",
  },
  "うち利息": {
    title: "うち利息",
    body:
      "説明：年間返済額のうち利息部分。\n影響：純粋なコスト。金利が高いほど、初期ほど大きいです。",
  },
  返済比率: {
    title: "返済比率",
    body:
      "説明：収入に対して返済がどれくらい重いかを示す比率（ツール定義により「返済/家賃収入」等）。\n影響：高いほど返済負担が重く、CFが出にくい傾向。低いほど余裕が出ます。",
  },
  DSCR: {
    title: "DSCR",
    body:
      "説明：返済余裕を示す指標。一般に DSCR＝NOI ÷ 年間返済額。\n影響：1.0はギリギリ、1.2以上で安定寄り。高いほど銀行評価・耐久力が強いです。",
  },
  純利回り: {
    title: "純利回り",
    body:
      "説明：運営費等を差し引いた後の利回り（NOIベースの利回り）。\n影響：高いほど収益性が高い。空室・経費が増えると低下します。",
  },
  CCR: {
    title: "CCR",
    body:
      "説明：投入した自己資金に対して、年間CFがどれだけ出るか。\n一般に CCR＝年間税前CF ÷ 自己資金（頭金＋諸費用など）。\n影響：自己資金が少ないほど上がりやすい一方、リスク（耐性）が弱くなることがあります。",
  },
};
const formatFirebaseError = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "code" in error) {
    const { code, message } = error as FirebaseError;
    return `${fallback} (${code}${message ? `: ${message}` : ""})`;
  }
  return fallback;
};

export default function Home() {
  const [inputData, setInputData] = useState<PropertyInput>(DEFAULT_INPUT);
  const [autoFilledKeys, setAutoFilledKeys] = useState<(keyof PropertyInput)[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [hasImportResult, setHasImportResult] = useState(false);
  const [hasViewedResults, setHasViewedResults] = useState(false);
  const [hasCompletedSteps, setHasCompletedSteps] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>(
    []
  );
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [aiCacheHit, setAiCacheHit] = useState(false);
  const [authDebug, setAuthDebug] = useState<string[]>([]);
  const [pendingAiPromptId, setPendingAiPromptId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(1);
  const [activeKpiInfo, setActiveKpiInfo] = useState<KpiInfoKey | null>(null);
  const [activeTableInfo, setActiveTableInfo] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [savedItems, setSavedItems] = useState<SavedSimulation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRunItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<"latest" | "all">("latest");
  const [leftOrder, setLeftOrder] = useState(DEFAULT_LEFT_ORDER);
  const [rightOrder, setRightOrder] = useState(DEFAULT_RIGHT_ORDER);
  const [formVersion, setFormVersion] = useState(0);
  const [investmentInput, setInvestmentInput] = useState(DEFAULT_INVESTMENT_INPUT);
  const [investmentEditOpen, setInvestmentEditOpen] = useState(false);
  const [extraInfo, setExtraInfo] = useState<ExtraInfoInput>(createDefaultExtraInfo);
  const [showCompletedChecklist, setShowCompletedChecklist] = useState(false);
  const [locationLookupLoading, setLocationLookupLoading] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState<string | null>(null);
  const [areaStatsLookupLoading, setAreaStatsLookupLoading] = useState(false);
  const [areaStatsLookupError, setAreaStatsLookupError] = useState<string | null>(null);
  const [areaStatsLookupNotice, setAreaStatsLookupNotice] = useState<string | null>(null);
  const analysisRunIdRef = useRef<string | null>(null);
  const analysisRunUrlRef = useRef<string | null>(null);
  const ridershipLookupKeyRef = useRef<string>("");
  const resultsRef = useRef<HTMLElement | null>(null);
  const aiMessagesRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [openSections, setOpenSections] = useState({
    kpi: true,
    investmentScore: false,
    cashflow: false,
    simulation: false,
    repayment: false,
    chart: true,
    detail: true,
    exit: false,
    scenario: false,
    breakdownPrice: true,
    breakdownInitial: true,
    breakdownTax: true,
    breakdownDep: true,
    breakdownLoan: true,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateInvestmentInput = <K extends keyof InvestmentInput>(
    key: K,
    value: InvestmentInput[K]
  ) => {
    setInvestmentInput((prev) => ({ ...prev, [key]: value }));
  };

  const extractLabelValue = (text: string, label: string) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 改行をまたいで次の項目値を拾わないよう、同一行のみを抽出する。
    const regex = new RegExp(`(?:^|\\n)\\s*${escapedLabel}\\s*[:：]?\\s*([^\\n]*)`, "m");
    const match = text.match(regex);
    if (!match) return null;
    const value = match[1].trim();
    return value.length > 0 ? value : null;
  };

  const parsePlainNumber = (value: string | null | undefined) => {
    if (!value) return null;
    const normalized = value.replace(/,/g, "").replace(/[^\d.\-+]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parsePercentNumber = (value: string | null | undefined) => {
    if (!value) return null;
    const match = value.match(/[+\-−±]?\d+(?:\.\d+)?/);
    if (!match) return null;
    let token = match[0].replace("−", "-");
    if (token.startsWith("±")) token = "0";
    const parsed = Number(token);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getDeltaToneClass = (value: string | null | undefined) => {
    if (!value) return "delta-neutral";
    if (value.includes("±")) return "delta-neutral";
    const parsed = parsePercentNumber(value);
    if (parsed === null || parsed === 0) return "delta-neutral";
    return parsed > 0 ? "delta-up" : "delta-down";
  };

  const renderDelta = (value: string | null | undefined, unit: "%" | "pt" = "%") => {
    if (!value) return null;
    const compact = value.replace(/\s+/g, "");
    if (compact === "-") {
      return <span className="delta-value delta-neutral">(-{unit})</span>;
    }
    const withoutUnit = compact.replace(/%|pt/gi, "");
    const shown = `${withoutUnit}${unit}`;
    return <span className={`delta-value ${getDeltaToneClass(value)}`}>({shown})</span>;
  };

  const formatDistance = (meters: number | null | undefined) =>
    typeof meters === "number" ? `${Math.round(meters).toLocaleString()}m` : "—";

  const formatMinutes = (minutes: number | null | undefined) =>
    typeof minutes === "number" ? `${minutes}分` : "—";

  const formatStationLine = (line: string | null | undefined) => {
    if (!line) return "";
    return line.replace("（Google分類）", "").trim();
  };

  const renderLocationOptionList = (
    label: string,
    items: LocationPointSummary[] | undefined,
    withLine = false
  ) => {
    if (!items?.length) return null;
    return (
      <div className="extra-info-inline-candidates">
        <div className="extra-info-inline-candidates-label">{label}</div>
        {items.slice(0, 5).map((item, index) => (
          <div
            key={`${label}-${item.name ?? "unknown"}-${item.distanceMeters ?? "na"}-${index}`}
            className="extra-info-inline-candidate"
          >
            <span>
              {item.name ?? "—"}
              {withLine && item.line ? ` (${formatStationLine(item.line)})` : ""}
            </span>
            <strong>
              {formatMinutes(item.durationMinutes)} / {formatDistance(item.distanceMeters)}
            </strong>
          </div>
        ))}
      </div>
    );
  };

  const getManualLevelToneClass = (level: LocationManualLevel) => {
    if (level === "GOOD") return "is-good";
    if (level === "CAUTION") return "is-mid";
    if (level === "BAD") return "is-bad";
    return "is-neutral";
  };

  const comparableSummary = useMemo(() => {
    const text = extraInfo.comparableText.trim();
    if (!text) return null;
    const rawYield = extractLabelValue(text, "表面利回り");
    const rawAvgYield = extractLabelValue(text, "周辺地域の平均利回り");
    const normalizedYield = rawYield && /%/.test(rawYield) ? rawYield : null;
    const normalizedAvgYield = rawAvgYield && /%/.test(rawAvgYield) ? rawAvgYield : null;
    return {
      salePrice: extractLabelValue(text, "販売価格"),
      yield: normalizedYield,
      avgYield: normalizedAvgYield,
      annualIncome: extractLabelValue(text, "想定年間収入"),
      address: extractLabelValue(text, "所在地"),
      access: extractLabelValue(text, "交通"),
      structure: extractLabelValue(text, "建物構造"),
      builtYear: extractLabelValue(text, "築年月"),
      landRight: extractLabelValue(text, "土地権利"),
      buildingArea: extractLabelValue(text, "建物面積"),
      landArea: extractLabelValue(text, "土地面積"),
      transactionType: extractLabelValue(text, "取引態様"),
    };
  }, [extraInfo.comparableText]);

  const populationSummary = useMemo(() => {
    const text = extraInfo.populationText.trim();
    if (!text) return null;

    const lines = text
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parseRows = (block: string, includeHouseholds: boolean) => {
      const blockLines = block
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const rows: Array<{
        year: string;
        population: string | null;
        populationDelta: string | null;
        households: string | null;
        householdsDelta: string | null;
      }> = [];

      for (let i = 0; i < blockLines.length; i += 1) {
        const yearMatch = blockLines[i].match(/^(\d{4})$/);
        if (!yearMatch) continue;
        const year = yearMatch[1];

        let population: string | null = null;
        let populationDelta: string | null = null;
        let households: string | null = null;
        let householdsDelta: string | null = null;

        for (let j = i + 1; j < Math.min(blockLines.length, i + 10); j += 1) {
          if (blockLines[j].match(/^(\d{4})$/)) break;
          const numMatch = blockLines[j].match(/^([0-9,]+)$/);
          if (numMatch) {
            if (!population) {
              population = numMatch[1];
              continue;
            }
            if (includeHouseholds && !households) {
              households = numMatch[1];
              continue;
            }
          }
          const deltaMatch = blockLines[j].match(/\(([+\-−0-9.]+)%\)/);
          if (deltaMatch) {
            if (!populationDelta) {
              populationDelta = deltaMatch[1].replace("−", "-");
              continue;
            }
            if (includeHouseholds && !householdsDelta) {
              householdsDelta = deltaMatch[1].replace("−", "-");
              continue;
            }
          }
          if (blockLines[j].includes("(-%)")) {
            if (!populationDelta) {
              populationDelta = "-";
              continue;
            }
            if (includeHouseholds && !householdsDelta) {
              householdsDelta = "-";
              continue;
            }
          }
        }

        if (population || households) {
          rows.push({
            year,
            population,
            populationDelta,
            households,
            householdsDelta,
          });
        }
      }
      return rows;
    };

    const latestPopulationMatch = text.match(/人口\s*([0-9,]+)人/);
    const latestPopulationDeltaMatch = text.match(
      /人口[\s\S]*?\(([+\-−0-9.]+)%\)/
    );
    const latestHouseholdsMatch = text.match(/世帯数\s*([0-9,]+)世帯/);
    const latestHouseholdsDeltaMatch = text.match(
      /世帯数[\s\S]*?\(([+\-−0-9.]+)%\)/
    );

    const forecastBlockMatch = text.match(/将来予測データ[\s\S]*?実績データ/);
    const forecastBlock = forecastBlockMatch
      ? forecastBlockMatch[0].replace(/実績データ[\s\S]*$/, "")
      : "";
    const forecastRows = parseRows(forecastBlock, false);

    const actualBlockMatch = text.match(/実績データ([\s\S]*?)(出典データ|$)/);
    const actualBlock = actualBlockMatch ? actualBlockMatch[1] : text;
    const actualRows = parseRows(actualBlock, true);

    const byYear = new Map<string, (typeof actualRows)[number]>();
    [...forecastRows, ...actualRows].forEach((row) => {
      const prev = byYear.get(row.year);
      byYear.set(row.year, {
        year: row.year,
        population: row.population ?? prev?.population ?? null,
        populationDelta: row.populationDelta ?? prev?.populationDelta ?? null,
        households: row.households ?? prev?.households ?? null,
        householdsDelta: row.householdsDelta ?? prev?.householdsDelta ?? null,
      });
    });
    const yearlyRows = Array.from(byYear.values()).sort((a, b) => Number(b.year) - Number(a.year));

    return {
      area: lines.find((line) => /(都|道|府|県).*(市|区|町|村)/.test(line)) ?? null,
      population: latestPopulationMatch ? latestPopulationMatch[1] : actualRows[0]?.population ?? null,
      populationDelta:
        latestPopulationDeltaMatch?.[1]?.replace("−", "-") ??
        actualRows[0]?.populationDelta ??
        null,
      households: latestHouseholdsMatch ? latestHouseholdsMatch[1] : actualRows[0]?.households ?? null,
      householdsDelta:
        latestHouseholdsDeltaMatch?.[1]?.replace("−", "-") ??
        actualRows[0]?.householdsDelta ??
        null,
      forecastRows,
      actualRows,
      yearlyRows,
    };
  }, [extraInfo.populationText]);

  const ridershipSummary = useMemo(() => {
    const text = extraInfo.ridershipText.trim();
    if (!text) return null;
    const stationMatch = text.match(/^\s*([^\n]*駅)\s*$/m);
    const ridershipMatch = text.match(/乗降客数\s*([0-9,]+)人/);
    const deltaMatch = text.match(/乗降客数[\s\S]*?\(([+\-0-9.]+)%\)/);
    const tableBlockMatch = text.match(/実績データ([\s\S]*?)(出典データ|$)/);
    const tableBlock = tableBlockMatch ? tableBlockMatch[1] : text;
    const tableLines = tableBlock
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const yearlyRows: {
      year: string;
      ridership: string | null;
      delta: string | null;
    }[] = [];
    for (let i = 0; i < tableLines.length; i += 1) {
      const yearMatch = tableLines[i].match(/^(\d{4})$/);
      if (!yearMatch) continue;
      const year = yearMatch[1];
      let ridership: string | null = null;
      let delta: string | null = null;
      for (let j = i + 1; j < Math.min(tableLines.length, i + 6); j += 1) {
        if (tableLines[j].match(/^(\d{4})$/)) break;
        const ridershipMatchLine = tableLines[j].match(/^([0-9,]+)$/);
        if (ridershipMatchLine && !ridership) {
          ridership = ridershipMatchLine[1];
          continue;
        }
        const deltaMatchLine = tableLines[j].match(/\(([+\-0-9.]+)%\)/);
        if (deltaMatchLine && !delta) {
          delta = deltaMatchLine[1];
          continue;
        }
        if (tableLines[j].includes("(-%)") && !delta) {
          delta = "-";
        }
      }
      if (ridership) {
        yearlyRows.push({
          year,
          ridership,
          delta,
        });
      }
    }

    const latestRow = yearlyRows[0] ?? null;
    return {
      station: stationMatch ? stationMatch[1] : null,
      ridership: ridershipMatch ? ridershipMatch[1] : latestRow?.ridership ?? null,
      delta: deltaMatch ? deltaMatch[1] : latestRow?.delta ?? null,
      yearlyRows,
    };
  }, [extraInfo.ridershipText]);

  const vacancySummary = useMemo(() => {
    const text = extraInfo.vacancyText.trim();
    if (!text) return null;
    const rateMatch = text.match(/空室率\s*([0-9.]+)%/);
    const deltaMatch = text.match(/\(([+\-0-9.]+)pt\)/);
    const countMatch = text.match(/([0-9,]+)\(空家\)\s*\/\s*([0-9,]+)\(借家\)/);
    const tableBlockMatch = text.match(/実績データ([\s\S]*?)(出典データ|$)/);
    const tableBlock = tableBlockMatch ? tableBlockMatch[1] : text;
    const tableLines = tableBlock
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const yearlyRows: {
      year: string;
      rate: string | null;
      delta: string | null;
      emptyUnits: string | null;
      rentalUnits: string | null;
    }[] = [];
    for (let i = 0; i < tableLines.length; i += 1) {
      const yearMatch = tableLines[i].match(/^(\d{4})$/);
      if (!yearMatch) continue;
      const year = yearMatch[1];
      let rate: string | null = null;
      let delta: string | null = null;
      let emptyUnits: string | null = null;
      let rentalUnits: string | null = null;
      for (let j = i + 1; j < Math.min(tableLines.length, i + 8); j += 1) {
        if (tableLines[j].match(/^(\d{4})$/)) break;
        const rateMatchLine = tableLines[j].match(/([0-9.]+)%/);
        if (rateMatchLine && !rate) {
          rate = rateMatchLine[1];
        }
        const deltaMatchLine = tableLines[j].match(/\(([+\-0-9.]+)pt\)/);
        if (deltaMatchLine && !delta) {
          delta = deltaMatchLine[1];
        } else if (tableLines[j].includes("(-pt)") && !delta) {
          delta = "-";
        }
        const countMatchLine = tableLines[j].match(/([0-9,]+)\s*\/\s*([0-9,]+)/);
        if (countMatchLine && !emptyUnits && !rentalUnits) {
          emptyUnits = countMatchLine[1];
          rentalUnits = countMatchLine[2];
        }
      }
      if (rate || emptyUnits || rentalUnits) {
        yearlyRows.push({
          year,
          rate,
          delta,
          emptyUnits,
          rentalUnits,
        });
      }
    }
    return {
      rate: rateMatch ? rateMatch[1] : null,
      delta: deltaMatch ? deltaMatch[1] : null,
      emptyUnits: countMatch ? countMatch[1] : null,
      rentalUnits: countMatch ? countMatch[2] : null,
      yearlyRows,
    };
  }, [extraInfo.vacancyText]);

  const landPriceSummary = useMemo(() => {
    const text = extraInfo.landPriceText.trim();
    if (!text) return null;
    const lines = text
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const addressLine =
      lines.find((line) => /県|都|府|道/.test(line)) ?? lines[0] ?? null;

    const parseSection = (heading: string) => {
      const start = text.indexOf(heading);
      if (start === -1) return null;
      const rest = text.slice(start + heading.length);
      const end = rest.search(/\n\s*(公示地価|基準地価|実績データ)\s*\n/);
      const section = end >= 0 ? rest.slice(0, end) : rest;
      const priceMatch = section.match(/価格\s*([0-9万,.]+円\/㎡)\s*\(([+\-0-9.%]+)\)/);
      const areaMatch = section.match(/地積\s*([0-9,]+)㎡/);
      const ratioMatch = section.match(/建ぺい率\s*\/\s*容積率\s*([0-9%\s/]+%)/);
      const zoneMatch = section.match(/用途地域\s*([^\n]+)/);
      const planningMatch = section.match(/都市計画区分\s*([^\n]+)/);
      return {
        price: priceMatch ? priceMatch[1] : null,
        delta: priceMatch ? priceMatch[2] : null,
        area: areaMatch ? areaMatch[1] : null,
        ratio: ratioMatch ? ratioMatch[1].replace(/\s+/g, " ") : null,
        zone: zoneMatch ? zoneMatch[1].trim() : null,
        planning: planningMatch ? planningMatch[1].trim() : null,
      };
    };

    const parseYearlyRows = () => {
      const tableBlockMatch = text.match(/実績データ([\s\S]*?)(出典データ|$)/);
      const tableBlock = tableBlockMatch ? tableBlockMatch[1] : text;
      const tableLines = tableBlock
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const hasOfficialInTable = tableBlock.includes("公示地価");
      const hasBenchmarkInTable = tableBlock.includes("基準地価");
      const rows: {
        year: string;
        official: string | null;
        officialDelta: string | null;
        benchmark: string | null;
        benchmarkDelta: string | null;
      }[] = [];
      for (let i = 0; i < tableLines.length; i += 1) {
        const yearMatch = tableLines[i].match(/^(\d{4})$/);
        if (!yearMatch) continue;
        const year = yearMatch[1];
        let official: string | null = null;
        let officialDelta: string | null = null;
        let benchmark: string | null = null;
        let benchmarkDelta: string | null = null;
        for (let j = i + 1; j < Math.min(tableLines.length, i + 10); j += 1) {
          if (tableLines[j].match(/^(\d{4})$/)) break;
          const priceMatch = tableLines[j].match(/([0-9万,.]+円\/㎡)/);
          if (!priceMatch) continue;
          const deltaMatch = tableLines[j].match(/\(([+\-0-9.%±]+)\)/);
          if (!official) {
            official = priceMatch[1];
            officialDelta = deltaMatch ? deltaMatch[1] : null;
          } else if (!benchmark) {
            benchmark = priceMatch[1];
            benchmarkDelta = deltaMatch ? deltaMatch[1] : null;
            break;
          }
        }
        if (hasOfficialInTable && !hasBenchmarkInTable) {
          benchmark = null;
          benchmarkDelta = null;
        } else if (!hasOfficialInTable && hasBenchmarkInTable) {
          benchmark = official;
          benchmarkDelta = officialDelta;
          official = null;
          officialDelta = null;
        }
        if (official || benchmark) {
          rows.push({
            year,
            official,
            officialDelta,
            benchmark,
            benchmarkDelta,
          });
        }
      }
      return rows;
    };

    const official = parseSection("公示地価");
    const benchmark = parseSection("基準地価");
    const yearlyRows = parseYearlyRows();

    return {
      address: addressLine,
      official,
      benchmark,
      yearlyRows,
    };
  }, [extraInfo.landPriceText]);

  const additionalInfoScore = useMemo(() => {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const targetYield =
      inputData.price > 0 && inputData.monthlyRent > 0
        ? (inputData.monthlyRent * 12 * 100) / inputData.price
        : null;
    const marketYield =
      parsePercentNumber(comparableSummary?.avgYield) ?? parsePercentNumber(comparableSummary?.yield);

    const comparableItem = (() => {
      if (targetYield === null || marketYield === null) {
        return {
          label: "近似売り物件利回り",
          max: 30,
          score: null as number | null,
          reason: "対象利回りまたは周辺利回りが不足しているため未評価です。",
          warning: false,
        };
      }
      const gap = targetYield - marketYield;
      // この項目は「利回り差が大きいほど加点」方針で採点する。
      let score = 0;
      if (gap <= 0) score = 0;
      else if (gap <= 0.33) score = 7;
      else if (gap <= 0.66) score = 15;
      else if (gap <= 1.0) score = 21;
      else if (gap <= 1.3) score = 25;
      else if (gap <= 2.0) score = 29;
      else score = 30;
      return {
        label: "近似売り物件利回り",
        max: 30,
        score,
        reason: `対象 ${targetYield.toFixed(2)}% / 周辺 ${marketYield.toFixed(
          2
        )}%（差 ${gap >= 0 ? "+" : ""}${gap.toFixed(2)}pt）`,
        warning: false,
      };
    })();

    const rentMarketItem = (() => {
      const floors = (Object.keys(PORTY_FLOOR_LABELS) as PortyFloorKey[]).map((key) => ({
        key,
        label: PORTY_FLOOR_LABELS[key],
        ...extraInfo.portyRentByFloor[key],
      }));
      const isValidRent = (value: number | null) =>
        typeof value === "number" && Number.isFinite(value) && value > 0;
      const filledValueCount = floors.reduce((sum, floor) => {
        const values = [floor.minus1Sigma, floor.baseSigma, floor.plus1Sigma];
        return sum + values.filter((value) => isValidRent(value)).length;
      }, 0);
      if (filledValueCount === 0) {
        return {
          label: "周辺家賃相場",
          max: 15,
          score: null as number | null,
          reason: "ポルティ査定の家賃データが未入力のため未評価です。",
          warning: false,
        };
      }

      const completeRows = floors.filter(
        (floor) =>
          isValidRent(floor.minus1Sigma) &&
          isValidRent(floor.baseSigma) &&
          isValidRent(floor.plus1Sigma)
      ) as Array<{
        key: PortyFloorKey;
        label: string;
        minus1Sigma: number;
        baseSigma: number;
        plus1Sigma: number;
      }>;
      const orderedRows = completeRows.filter(
        (floor) => floor.minus1Sigma <= floor.baseSigma && floor.baseSigma <= floor.plus1Sigma
      );
      const completenessScore = clamp(Math.round((filledValueCount / 9) * 6), 0, 6);
      const spreadScore = clamp(orderedRows.length, 0, 3);

      const floorOrder: PortyFloorKey[] = ["floor1", "floor2", "floor3"];
      const floorTrendPairs: Array<[number, number]> = [];
      for (let i = 0; i < floorOrder.length - 1; i += 1) {
        const current = completeRows.find((row) => row.key === floorOrder[i]);
        const next = completeRows.find((row) => row.key === floorOrder[i + 1]);
        if (!current || !next) continue;
        floorTrendPairs.push([current.baseSigma, next.baseSigma]);
      }
      const floorTrendScore =
        floorTrendPairs.length === 0
          ? 1
          : (() => {
              const upCount = floorTrendPairs.filter(([lower, upper]) => upper >= lower).length;
              if (upCount === floorTrendPairs.length) return 2;
              if (upCount >= floorTrendPairs.length - 1) return 1;
              return 0;
            })();

      const marketBaseAvg =
        completeRows.length > 0
          ? completeRows.reduce((sum, row) => sum + row.baseSigma, 0) / completeRows.length
          : null;
      const targetUnitRent =
        inputData.monthlyRent > 0 && inputData.unitCount > 0
          ? inputData.monthlyRent / inputData.unitCount
          : null;
      let fitScore = 2;
      let gapPercent: number | null = null;
      if (targetUnitRent !== null && marketBaseAvg !== null && marketBaseAvg > 0) {
        gapPercent = ((targetUnitRent - marketBaseAvg) / marketBaseAvg) * 100;
        const absGap = Math.abs(gapPercent);
        if (absGap <= 5) fitScore = 4;
        else if (absGap <= 10) fitScore = 3;
        else if (absGap <= 15) fitScore = 2;
        else if (absGap <= 20) fitScore = 1;
        else fitScore = 0;
      }

      const score = clamp(completenessScore + spreadScore + floorTrendScore + fitScore, 0, 15);
      const reasonParts = [
        `入力 ${filledValueCount}/9`,
        `階内整合 ${orderedRows.length}/${completeRows.length}`,
      ];
      if (marketBaseAvg !== null) {
        reasonParts.push(`基準平均 ${Math.round(marketBaseAvg).toLocaleString()}円`);
      }
      if (targetUnitRent !== null && gapPercent !== null) {
        reasonParts.push(
          `自社想定/戸 ${Math.round(targetUnitRent).toLocaleString()}円（差 ${
            gapPercent >= 0 ? "+" : ""
          }${gapPercent.toFixed(1)}%）`
        );
      } else {
        reasonParts.push("自社想定/戸は戸数入力後に比較");
      }
      return {
        label: "周辺家賃相場",
        max: 15,
        score,
        reason: reasonParts.join(" / "),
        warning: score <= 7 || (gapPercent !== null && gapPercent > 15),
      };
    })();

    const populationItem = (() => {
      const rows = (populationSummary?.actualRows ?? [])
        .map((row) => ({
          year: Number(row.year),
          population: parsePlainNumber(row.population),
          households: parsePlainNumber(row.households),
          populationDelta: parsePercentNumber(row.populationDelta),
          householdsDelta: parsePercentNumber(row.householdsDelta),
        }))
        .filter((row) => Number.isFinite(row.year)) as Array<{
        year: number;
        population: number | null;
        households: number | null;
        populationDelta: number | null;
        householdsDelta: number | null;
      }>;
      if (rows.length === 0) {
        return {
          label: "人口推移",
          max: 20,
          score: null as number | null,
          reason: "人口・世帯のトレンドデータが不足しているため未評価です。",
          warning: false,
        };
      }

      const sorted = [...rows].sort((a, b) => b.year - a.year);
      const latest = sorted[0];
      const base = sorted[sorted.length - 1];

      const actualPopulationCagr =
        latest.population !== null &&
        base.population !== null &&
        latest.population > 0 &&
        base.population > 0 &&
        latest.year > base.year
          ? (Math.pow(latest.population / base.population, 1 / (latest.year - base.year)) - 1) * 100
          : null;

      const forecast = (populationSummary?.forecastRows ?? [])
        .map((row) => ({
          year: Number(row.year),
          population: parsePlainNumber(row.population),
        }))
        .filter((row) => Number.isFinite(row.year) && row.population !== null) as Array<{
        year: number;
        population: number;
      }>;
      const forecastSorted = [...forecast].sort((a, b) => b.year - a.year);
      const futureCagr =
        forecastSorted.length >= 2
          ? (() => {
              const fLatest = forecastSorted[0];
              const fBase = forecastSorted[forecastSorted.length - 1];
              if (fLatest.population <= 0 || fBase.population <= 0 || fLatest.year <= fBase.year) {
                return null;
              }
              return (
                (Math.pow(fLatest.population / fBase.population, 1 / (fLatest.year - fBase.year)) - 1) *
                100
              );
            })()
          : null;

      const popDelta = latest.populationDelta;
      const householdDelta = latest.householdsDelta;
      let score = 10;
      if (popDelta !== null) {
        if (popDelta >= 2) score += 4;
        else if (popDelta >= 0) score += 2;
        else if (popDelta <= -1.5) score -= 4;
        else score -= 2;
      }
      if (householdDelta !== null) {
        if (householdDelta >= 2) score += 4;
        else if (householdDelta >= 0) score += 2;
        else if (householdDelta <= -1.5) score -= 4;
        else score -= 2;
      }
      if (actualPopulationCagr !== null) {
        if (actualPopulationCagr >= 0.5) score += 2;
        else if (actualPopulationCagr < -0.3) score -= 2;
      }
      score = clamp(score, 0, 20);

      return {
        label: "人口推移",
        max: 20,
        score,
        reason: `実績 人口${popDelta === null ? "-" : `${popDelta >= 0 ? "+" : ""}${popDelta.toFixed(
          1
        )}%`} / 世帯${householdDelta === null ? "-" : `${householdDelta >= 0 ? "+" : ""}${householdDelta.toFixed(
          1
        )}%`}, 将来CAGR ${futureCagr === null ? "-" : `${futureCagr >= 0 ? "+" : ""}${futureCagr.toFixed(2)}%`}`,
        warning: (popDelta ?? 0) < 0 && (householdDelta ?? 0) < 0,
      };
    })();

    const ridershipItem = (() => {
      const rows = (ridershipSummary?.yearlyRows ?? [])
        .map((row) => ({
          year: Number(row.year),
          ridership: parsePlainNumber(row.ridership),
          delta: parsePercentNumber(row.delta),
        }))
        .filter((row) => Number.isFinite(row.year) && row.ridership !== null) as {
        year: number;
        ridership: number;
        delta: number | null;
      }[];
      if (rows.length === 0) {
        return {
          label: "乗降客数",
          max: 15,
          score: null as number | null,
          reason: "乗降客数データが不足しているため未評価です。",
          warning: false,
        };
      }
      const sorted = [...rows].sort((a, b) => b.year - a.year);
      const latest = sorted[0];
      const base =
        sorted.find((row) => latest.year - row.year >= 3) ??
        sorted[Math.min(3, sorted.length - 1)];
      const span = Math.max(1, latest.year - base.year);
      const cagr = (Math.pow(latest.ridership / base.ridership, 1 / span) - 1) * 100;
      const latestDelta = latest.delta;
      let score = 9;
      if (cagr >= 2 && (latestDelta === null || latestDelta >= 0)) score = 15;
      else if (cagr >= 0.5) score = 12;
      else if (cagr >= -0.5) score = 9;
      else score = 5;
      if (latestDelta !== null && latestDelta < 0) {
        score = Math.max(0, score - 2);
      }
      return {
        label: "乗降客数",
        max: 15,
        score,
        reason: `3年CAGR ${cagr >= 0 ? "+" : ""}${cagr.toFixed(2)}% / 最新前年差 ${
          latestDelta === null ? "-" : `${latestDelta >= 0 ? "+" : ""}${latestDelta.toFixed(1)}%`
        }`,
        warning: score <= 7,
      };
    })();

    const vacancyItem = (() => {
      const latestRate =
        parsePercentNumber(vacancySummary?.rate) ??
        parsePercentNumber(vacancySummary?.yearlyRows?.[0]?.rate) ??
        null;
      const latestDelta =
        parsePercentNumber(vacancySummary?.delta) ??
        parsePercentNumber(vacancySummary?.yearlyRows?.[0]?.delta) ??
        null;
      if (latestRate === null) {
        return {
          label: "空室率",
          max: 20,
          score: null as number | null,
          reason: "空室率データが不足しているため未評価です。",
          warning: false,
        };
      }
      const levelScore =
        latestRate < 8 ? 14 : latestRate < 10 ? 11 : latestRate < 12 ? 8 : latestRate < 15 ? 4 : 1;
      const trendScore =
        latestDelta === null ? 3 : latestDelta <= -1 ? 6 : latestDelta < 1 ? 3 : 0;
      const score = clamp(levelScore + trendScore, 0, 20);
      return {
        label: "空室率",
        max: 20,
        score,
        reason: `最新空室率 ${latestRate.toFixed(1)}% / 前期差 ${
          latestDelta === null ? "-" : `${latestDelta >= 0 ? "+" : ""}${latestDelta.toFixed(1)}pt`
        }`,
        warning: latestRate >= 12 || (latestDelta !== null && latestDelta >= 1),
      };
    })();

    const landPriceItem = (() => {
      const rows = (landPriceSummary?.yearlyRows ?? [])
        .map((row) => {
          const official = parsePercentNumber(row.officialDelta);
          const benchmark = parsePercentNumber(row.benchmarkDelta);
          const deltas = [official, benchmark].filter((value): value is number => value !== null);
          const meanDelta =
            deltas.length > 0 ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null;
          return { year: Number(row.year), meanDelta };
        })
        .filter((row) => Number.isFinite(row.year) && row.meanDelta !== null) as {
        year: number;
        meanDelta: number;
      }[];
      const sorted = [...rows].sort((a, b) => b.year - a.year);
      const latestDelta =
        sorted[0]?.meanDelta ??
        parsePercentNumber(landPriceSummary?.official?.delta) ??
        parsePercentNumber(landPriceSummary?.benchmark?.delta) ??
        null;
      const avg5 =
        sorted.length > 0
          ? sorted
              .slice(0, 5)
              .reduce((sum, row) => sum + row.meanDelta, 0) /
            Math.min(5, sorted.length)
          : latestDelta;

      if (latestDelta === null) {
        return {
          label: "基準地価",
          max: 15,
          score: null as number | null,
          reason: "地価トレンドデータが不足しているため未評価です。",
          warning: false,
        };
      }

      let score = 9;
      if (latestDelta >= 3 && (avg5 ?? 0) >= 2) score = 15;
      else if (latestDelta >= 1) score = 12;
      else if (latestDelta >= 0) score = 9;
      else if (latestDelta >= -1) score = 5;
      else score = 2;

      return {
        label: "基準地価",
        max: 15,
        score,
        reason: `最新 ${latestDelta >= 0 ? "+" : ""}${latestDelta.toFixed(1)}% / 5年平均 ${
          avg5 === null ? "-" : `${avg5 >= 0 ? "+" : ""}${avg5.toFixed(1)}%`
        }`,
        warning: latestDelta < -1,
      };
    })();

    const hazardItem = (() => {
      const floodPenaltyMap = new Map<string, number>(
        FLOOD_SEVERITY_OPTIONS.map((option) => [option.value, option.penalty])
      );
      const sedimentPenaltyMap = new Map<string, number>(
        SEDIMENT_SEVERITY_OPTIONS.map((option) => [option.value, option.penalty])
      );
      const selected: Array<{ label: string; severity: string }> = [];
      let totalPenalty = 0;

      const addPenalty = (key: HazardTypeKey, selection: HazardSelection, isFlood: boolean) => {
        if (!selection.enabled) return;
        const penalty = isFlood
          ? floodPenaltyMap.get(selection.severity) ?? 0
          : sedimentPenaltyMap.get(selection.severity) ?? 0;
        totalPenalty += penalty;
        const severityLabel = isFlood
          ? FLOOD_SEVERITY_OPTIONS.find((option) => option.value === selection.severity)?.label ?? "未設定"
          : SEDIMENT_SEVERITY_OPTIONS.find((option) => option.value === selection.severity)?.label ?? "未設定";
        selected.push({ label: HAZARD_TYPE_LABELS[key], severity: severityLabel });
      };

      addPenalty("flood", extraInfo.hazard.flood, true);
      addPenalty("collapse", extraInfo.hazard.collapse, false);
      addPenalty("debrisFlow", extraInfo.hazard.debrisFlow, false);
      addPenalty("landslide", extraInfo.hazard.landslide, false);

      const max = 15;
      const score = clamp(max - totalPenalty, 0, max);
      const reason =
        selected.length === 0
          ? "該当なし"
          : selected.map((item) => `${item.label}:${item.severity}`).join(" / ");

      return {
        label: "ハザードマップ",
        max,
        score,
        reason,
        warning: score <= 8,
      };
    })();

    const locationItem = (() => {
      const auto = extraInfo.locationChecklist.auto;
      const manual = extraInfo.locationChecklist.manual;
      const manualLevels = Object.values(manual);
      const hasManualInput = manualLevels.some((level) => level !== "UNKNOWN");
      const hasAutoInput = !!auto;
      if (!hasAutoInput && !hasManualInput) {
        return {
          label: "周辺環境チェック",
          max: 20,
          score: null as number | null,
          reason: "住所からの自動取得または手動チェック入力で評価されます。",
          warning: false,
        };
      }

      let score = 10;
      const stationMinutes = auto?.station?.durationMinutes ?? null;
      if (stationMinutes !== null) {
        if (stationMinutes <= 10) score += 4;
        else if (stationMinutes <= 15) score += 2;
        else if (stationMinutes > 20) score -= 2;
      }
      const convenienceMinutes = auto?.convenienceStore?.durationMinutes ?? null;
      if (convenienceMinutes !== null) {
        if (convenienceMinutes <= 7) score += 2;
        else if (convenienceMinutes <= 12) score += 1;
        else score -= 1;
      }
      const supermarketMinutes = auto?.supermarket?.durationMinutes ?? null;
      if (supermarketMinutes !== null) {
        if (supermarketMinutes <= 10) score += 2;
        else if (supermarketMinutes <= 15) score += 1;
        else score -= 1;
      }
      const busMinutes = auto?.busStop?.durationMinutes ?? null;
      if (busMinutes !== null) {
        if (busMinutes <= 8) score += 1;
        else if (busMinutes > 15) score -= 1;
      }
      if ((auto?.cemeteryCount1500m ?? 0) > 0) score -= 2;
      if ((auto?.wasteFacilityCount1500m ?? 0) > 0) score -= 2;
      if ((auto?.factoryCount1500m ?? 0) > 0) score -= 2;
      const railDistance = auto?.station?.distanceMeters ?? null;
      if (railDistance !== null) {
        if (railDistance <= 200) score -= 2;
        else if (railDistance <= 400) score -= 1;
      }
      if ((auto?.schoolCount800m ?? 0) >= 1) score += 1;
      if ((auto?.parkCount800m ?? 0) >= 1) score += 1;

      const manualWeights: Record<keyof LocationManualChecks, number> = {
        slopeAndSidewalk: 1,
        nightLightingSafety: 2,
        smellVibration: 2,
        litterGraffiti: 1,
        dangerousRoads: 2,
      };
      (Object.keys(manualWeights) as Array<keyof LocationManualChecks>).forEach((key) => {
        const level = manual[key];
        if (level === "GOOD") score += manualWeights[key];
        if (level === "BAD") score -= manualWeights[key];
      });

      const safeScore = clamp(score, 0, 20);
      const manualBadCount = manualLevels.filter((level) => level === "BAD").length;
      const reason = `駅${stationMinutes === null ? "—" : `${stationMinutes}分`} / コンビニ${
        convenienceMinutes === null ? "—" : `${convenienceMinutes}分`
      } / スーパー${supermarketMinutes === null ? "—" : `${supermarketMinutes}分`} / 手動懸念${manualBadCount}件`;
      return {
        label: "周辺環境チェック",
        max: 20,
        score: safeScore,
        reason,
        warning: safeScore <= 8 || manualBadCount >= 2,
      };
    })();

    const breakdown = [
      comparableItem,
      rentMarketItem,
      populationItem,
      ridershipItem,
      vacancyItem,
      landPriceItem,
      hazardItem,
      locationItem,
    ];
    const availableMax = breakdown.reduce((sum, item) => sum + (item.score === null ? 0 : item.max), 0);
    const totalMax = breakdown.reduce((sum, item) => sum + item.max, 0);
    const rawScore = breakdown.reduce((sum, item) => sum + (item.score ?? 0), 0);
    const totalScore = availableMax > 0 ? Math.round((rawScore / availableMax) * 100) : 0;
    const confidence = totalMax > 0 ? Math.round((availableMax / totalMax) * 100) : 0;

    const grade =
      totalScore >= 85
        ? "A"
        : totalScore >= 75
          ? "B+"
          : totalScore >= 65
            ? "B"
            : totalScore >= 55
              ? "C"
              : "D";
    const decision = totalScore >= 80 ? "Go" : totalScore >= 65 ? "Hold" : "Recalculate";

    const memoRiskFlags = ["騒音", "臭気", "治安", "管理不良", "空室多い", "事故物件"]
      .filter((keyword) => extraInfo.memo.includes(keyword));

    return {
      totalScore,
      confidence,
      grade,
      decision,
      breakdown,
      memoRiskFlags,
    };
  }, [
    comparableSummary?.avgYield,
    comparableSummary?.yield,
    extraInfo.memo,
    extraInfo.portyRentByFloor,
    extraInfo.locationChecklist,
    inputData.monthlyRent,
    inputData.unitCount,
    inputData.price,
    landPriceSummary,
    populationSummary,
    ridershipSummary,
    extraInfo.hazard,
    vacancySummary,
  ]);

  const additionalBreakdownByLabel = useMemo(() => {
    const lookup = new Map(additionalInfoScore.breakdown.map((item) => [item.label, item]));
    return {
      comparable: lookup.get("近似売り物件利回り") ?? null,
      rentMarket: lookup.get("周辺家賃相場") ?? null,
      population: lookup.get("人口推移") ?? null,
      ridership: lookup.get("乗降客数") ?? null,
      vacancy: lookup.get("空室率") ?? null,
      landPrice: lookup.get("基準地価") ?? null,
      hazard: lookup.get("ハザードマップ") ?? null,
      location: lookup.get("周辺環境チェック") ?? null,
    };
  }, [additionalInfoScore.breakdown]);

  const additionalScoreToneClass =
    additionalInfoScore.decision === "Go"
      ? "score-go"
      : additionalInfoScore.decision === "Hold"
        ? "score-hold"
        : "score-recalculate";

  const purchaseChecklistTotalCount = useMemo(
    () =>
      PURCHASE_CHECKLIST_SECTIONS.reduce(
        (sum, section) => sum + section.items.length,
        0
      ),
    []
  );

  const purchaseChecklistDoneCount = useMemo(() => {
    const checked = extraInfo.purchaseChecklist;
    return PURCHASE_CHECKLIST_SECTIONS.reduce((sum, section) => {
      return (
        sum + section.items.filter((item) => checked[item.id]).length
      );
    }, 0);
  }, [extraInfo.purchaseChecklist]);

  const rakumachiLandPriceUrl = useMemo(() => {
    const lat = extraInfo.locationChecklist.auto?.originLat;
    const lng = extraInfo.locationChecklist.auto?.originLng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    const url = new URL("https://www.rakumachi.jp/property/land_price/map");
    url.searchParams.set("lat", lat.toFixed(8));
    url.searchParams.set("lng", lng.toFixed(8));
    return url.toString();
  }, [extraInfo.locationChecklist.auto?.originLat, extraInfo.locationChecklist.auto?.originLng]);

  const getAdditionalItemScoreToneClass = (
    item:
      | {
          score: number | null;
          max: number;
          warning?: boolean;
        }
      | null
      | undefined
  ) => {
    if (!item || item.score === null || item.max <= 0) return "is-neutral";
    const ratio = item.score / item.max;
    if (ratio >= 0.8) return "is-good";
    if (ratio >= 0.6) return "is-mid";
    return "is-bad";
  };

  const setHazardEnabled = (key: HazardTypeKey, enabled: boolean) => {
    setExtraInfo((prev) => ({
      ...prev,
      hazard: {
        ...prev.hazard,
        [key]: {
          ...prev.hazard[key],
          enabled,
        },
      },
    }));
  };

  const setHazardSeverity = (key: HazardTypeKey, severity: string) => {
    setExtraInfo((prev) => ({
      ...prev,
      hazard: {
        ...prev.hazard,
        [key]: {
          ...prev.hazard[key],
          severity,
        },
      },
    }));
  };

  const updateLocationManual = (key: keyof LocationManualChecks, value: LocationManualLevel) => {
    setExtraInfo((prev) => ({
      ...prev,
      locationChecklist: {
        ...prev.locationChecklist,
        manual: {
          ...prev.locationChecklist.manual,
          [key]: value,
        },
      },
    }));
  };

  const updatePortyRentByFloor = (
    floor: PortyFloorKey,
    sigma: PortySigmaKey,
    value: string
  ) => {
    const parsed =
      value.trim().length === 0 ? null : Number(value.replace(/,/g, ""));
    const safeValue = parsed === null || Number.isFinite(parsed) ? parsed : null;
    setExtraInfo((prev) => ({
      ...prev,
      portyRentByFloor: {
        ...prev.portyRentByFloor,
        [floor]: {
          ...prev.portyRentByFloor[floor],
          [sigma]: safeValue,
        },
      },
    }));
  };

  const updatePurchaseChecklist = (itemId: string, checked: boolean) => {
    setExtraInfo((prev) => ({
      ...prev,
      purchaseChecklist: {
        ...prev.purchaseChecklist,
        [itemId]: checked,
      },
    }));
  };

  const fetchLocationChecklistByAddress = async (addressInput: string) => {
    const candidateAddress = addressInput.trim();
    if (!candidateAddress) return false;
    setLocationLookupLoading(true);
    setLocationLookupError(null);
    try {
      const response = await fetch("/api/location-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: candidateAddress }),
      });
      const raw = await response.text();
      const payload = ((): {
        error?: string;
        data?: LocationChecklistAuto;
      } => {
        try {
          return JSON.parse(raw) as { error?: string; data?: LocationChecklistAuto };
        } catch {
          return {};
        }
      })();
      if (!response.ok || !payload?.data) {
        throw new Error(
          payload?.error ??
            (raw ? `周辺環境データの取得に失敗しました。(${response.status})` : "周辺環境データの取得に失敗しました。")
        );
      }
      setExtraInfo((prev) => ({
        ...prev,
        locationChecklist: {
          ...prev.locationChecklist,
          address: candidateAddress,
          auto: payload.data ?? null,
        },
      }));
      const stationName = payload.data?.station?.name?.trim() || null;
      void fetchAreaStatsByAddress(candidateAddress, stationName);
      return true;
    } catch (error) {
      setLocationLookupError(
        error instanceof Error ? error.message : "周辺環境データの取得に失敗しました。"
      );
      return false;
    } finally {
      setLocationLookupLoading(false);
    }
  };

  const handleFetchLocationChecklist = async () => {
    const candidateAddress =
      extraInfo.locationChecklist.address.trim() ||
      selectedImport?.listing?.address?.trim() ||
      comparableSummary?.address?.trim() ||
      "";
    if (!candidateAddress) {
      setLocationLookupError("住所が未入力です。URL解析か手入力で住所を設定してください。");
      return;
    }
    await fetchLocationChecklistByAddress(candidateAddress);
  };

  const fetchAreaStatsByAddress = async (
    addressInput: string,
    stationName: string | null,
    options?: { force?: boolean }
  ) => {
    const candidateAddress = addressInput.trim();
    if (!candidateAddress) return false;
    const candidateStation = stationName?.trim() || null;
    const lookupKey = `${candidateAddress}::${candidateStation ?? ""}`;
    if (!options?.force && ridershipLookupKeyRef.current === lookupKey) {
      return true;
    }
    setAreaStatsLookupLoading(true);
    setAreaStatsLookupError(null);
    setAreaStatsLookupNotice(null);
    try {
      const response = await fetch("/api/area-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: candidateAddress,
          stationName: candidateStation,
        }),
      });
      const raw = await response.text();
      const payload = ((): {
        error?: string;
        warnings?: string[];
        data?: {
          ridershipText?: string | null;
        };
      } => {
        try {
          return JSON.parse(raw) as {
            error?: string;
            warnings?: string[];
            data?: { ridershipText?: string | null };
          };
        } catch {
          return {};
        }
      })();
      if (!response.ok) {
        throw new Error(
          payload?.error ??
            (raw
              ? `乗降客数データの取得に失敗しました。(${response.status})`
              : "乗降客数データの取得に失敗しました。")
        );
      }

      const nextRidershipText = payload?.data?.ridershipText?.trim() ?? "";
      if (!nextRidershipText) {
        setAreaStatsLookupError("乗降客数データを取得できませんでした。");
      } else {
        setExtraInfo((prev) => ({ ...prev, ridershipText: nextRidershipText }));
        ridershipLookupKeyRef.current = lookupKey;
      }
      const warnings =
        Array.isArray(payload?.warnings) && payload.warnings.length
          ? payload.warnings.filter((item) => !!item).join(" / ")
          : null;
      setAreaStatsLookupNotice(warnings);
      return !!nextRidershipText;
    } catch (error) {
      setAreaStatsLookupError(
        error instanceof Error ? error.message : "乗降客数データの取得に失敗しました。"
      );
      return false;
    } finally {
      setAreaStatsLookupLoading(false);
    }
  };

  const handleReorder = (
    event: DragEndEvent,
    setOrder: Dispatch<SetStateAction<string[]>>
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((items) => {
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const pushAuthDebug = (message: string) => {
    setAuthDebug((prev) => {
      const next = [`${new Date().toLocaleTimeString()} ${message}`, ...prev];
      return next.slice(0, 20);
    });
  };

  useEffect(() => {
    pushAuthDebug(
      `init origin=${typeof window === "undefined" ? "server" : window.location.origin}`
    );
    pushAuthDebug(
      `authDomain=${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "unknown"}`
    );
    pushAuthDebug(`authDomain(config)=${auth.app.options.authDomain ?? "unknown"}`);
    if (typeof navigator !== "undefined") {
      pushAuthDebug(`ua=${navigator.userAgent}`);
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      pushAuthDebug(`auth state user=${nextUser?.uid ?? "null"}`);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    pushAuthDebug("redirect result check");
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          pushAuthDebug(`redirect success user=${result.user.uid}`);
        } else {
          pushAuthDebug("redirect result empty");
        }
      })
      .catch((error) => {
        const code =
          error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
        pushAuthDebug(`redirect error code=${code}`);
        setAuthError(formatFirebaseError(error, "ログインに失敗しました。"));
      });
  }, [authReady]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accountOpen && accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountOpen(false);
      }
      if (saveOpen && saveMenuRef.current && !saveMenuRef.current.contains(target)) {
        setSaveOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [accountOpen, saveOpen]);

  useEffect(() => {
    if (!user) {
      setSavedItems([]);
      return;
    }
    const q = query(
      collection(db, "simulations"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextItems: SavedSimulation[] = snapshot.docs.map((doc) => {
          const data = doc.data() as {
            name?: string;
            input?: PropertyInput;
            listing?: ImportHistoryItem["listing"];
            listingUrl?: string;
            extraInfo?: ExtraInfoInput;
            aiMessages?: { role: "user" | "assistant"; content: string }[];
            createdAt?: { toDate?: () => Date };
          };
          const safeMessages = Array.isArray(data.aiMessages)
            ? data.aiMessages.filter(
                (msg) =>
                  msg &&
                  typeof msg === "object" &&
                  typeof msg.role === "string" &&
                  typeof msg.content === "string"
              )
            : [];
          return {
            id: doc.id,
            name: data.name ?? "無題",
            input: { ...DEFAULT_INPUT, ...(data.input ?? {}) },
            listing: data.listing ?? null,
            listingUrl: typeof data.listingUrl === "string" ? data.listingUrl : null,
            extraInfo: normalizeExtraInfo(data.extraInfo),
            aiMessages: safeMessages as { role: "user" | "assistant"; content: string }[],
            createdAt: data.createdAt?.toDate?.() ?? null,
          };
        });
        setSavedItems(nextItems);
      },
      (error) =>
        setAuthError(formatFirebaseError(error, "保存済みデータの取得に失敗しました。"))
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAnalysisRuns([]);
      setHistoryError(null);
      return;
    }
    const q = query(
      collection(db, "analysisRuns"),
      where("userId", "==", user.uid),
      orderBy("updatedAt", "desc"),
      limit(50)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const runs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as {
            url?: string;
            listing?: ImportHistoryItem["listing"];
            input?: PropertyInput;
            extraInfo?: ExtraInfoInput;
            aiMessages?: { role: "user" | "assistant"; content: string }[];
            createdAt?: { toDate?: () => Date };
            updatedAt?: { toDate?: () => Date };
          };
          const safeMessages = Array.isArray(data.aiMessages)
            ? data.aiMessages.filter(
                (msg) =>
                  msg &&
                  typeof msg === "object" &&
                  typeof msg.role === "string" &&
                  typeof msg.content === "string"
              )
            : [];
          return {
            id: docSnap.id,
            url: data.url ?? "",
            listing: data.listing ?? null,
            input: { ...DEFAULT_INPUT, ...(data.input ?? {}) },
            extraInfo: normalizeExtraInfo(data.extraInfo),
            aiMessages: safeMessages as { role: "user" | "assistant"; content: string }[],
            createdAt: data.createdAt?.toDate?.() ?? null,
            updatedAt: data.updatedAt?.toDate?.() ?? null,
          };
        });
        setAnalysisRuns(runs);
        setHistoryError(null);
      },
      (error) => {
        console.warn("analysis runs read failed", error);
        setHistoryError(formatFirebaseError(error, "履歴の取得に失敗しました。"));
      }
    );
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      pushAuthDebug("login start popup");
      await signInWithPopup(auth, googleProvider);
      pushAuthDebug("popup success");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      pushAuthDebug(`popup error code=${code}`);
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        try {
          pushAuthDebug("fallback redirect start");
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          const redirectCode =
            redirectError && typeof redirectError === "object" && "code" in redirectError
              ? String(redirectError.code)
              : "unknown";
          pushAuthDebug(`redirect error code=${redirectCode}`);
          setAuthError(formatFirebaseError(redirectError, "ログインに失敗しました。"));
          return;
        }
      }
      setAuthError(formatFirebaseError(error, "ログインに失敗しました。"));
    }
  };

  const handleLogout = async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (error) {
      setAuthError(formatFirebaseError(error, "ログアウトに失敗しました。"));
    }
  };

  const handleSave = async () => {
    if (!user) {
      setAuthError("保存にはログインが必要です。");
      return;
    }
    const name = saveName.trim() || "シミュレーション";
    setIsSaving(true);
    try {
      await addDoc(collection(db, "simulations"), {
        userId: user.uid,
        name,
        input: inputData,
        listing: selectedImport?.listing ?? null,
        listingUrl: selectedImport?.url ?? null,
        extraInfo,
        aiMessages,
        createdAt: serverTimestamp(),
      });
      setSaveName("");
    } catch (error) {
      setAuthError(formatFirebaseError(error, "保存に失敗しました。"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (item: SavedSimulation) => {
    setInputData({ ...DEFAULT_INPUT, ...item.input });
    setExtraInfo(normalizeExtraInfo(item.extraInfo));
    setAiMessages(item.aiMessages ?? []);
    setAiCacheHit(false);
    setAiError(null);
    setAutoFilledKeys([]);
    const hasListing = !!item.listing;
    const rawUrl = item.listingUrl ? normalizeUrl(item.listingUrl) : "";
    if (hasListing || rawUrl) {
      const id = rawUrl || `saved:${item.id}`;
      setImportHistory((prev) => {
        const nextItem: ImportHistoryItem = {
          id,
          url: rawUrl,
          listing: item.listing ?? null,
          input: { ...DEFAULT_INPUT, ...item.input },
          autoFilled: [],
          createdAt: item.createdAt?.getTime?.() ?? Date.now(),
        };
        const existingIndex = prev.findIndex((entry) => entry.id === id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next.splice(existingIndex, 1, nextItem);
          return next;
        }
        return [nextItem, ...prev].slice(0, 5);
      });
      setSelectedImportId(id);
    } else {
      setSelectedImportId(null);
    }
    setHasViewedResults(false);
    setHasCompletedSteps(false);
    setSelectedYear(1);
    setFormVersion((prev) => prev + 1);
  };

  const handleImportApply = (payload: {
    patch: Partial<PropertyInput>;
    listing: ImportHistoryItem["listing"];
    url: string;
  }) => {
    const merged = { ...inputData, ...payload.patch };
    const { data, autoFilled } = applyEstimatedDefaultsWithMeta(merged);
    setInputData(data);
    setAutoFilledKeys(autoFilled);
    const url = payload.url ? normalizeUrl(payload.url) : "";
    setAiCacheHit(false);

    if (url) {
      const id = url;
      setImportHistory((prev) => {
        const nextItem: ImportHistoryItem = {
          id,
          url,
          listing: payload.listing ?? null,
          input: data,
          autoFilled,
          createdAt: Date.now(),
        };
        const existingIndex = prev.findIndex((item) => item.id === id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next.splice(existingIndex, 1, nextItem);
          return next;
        }
        return [nextItem, ...prev].slice(0, 5);
      });
      setSelectedImportId(id);
    }
    void (async () => {
      let cachedMessages: { role: "user" | "assistant"; content: string }[] = [];
      let cachedExtraInfo = createDefaultExtraInfo();
      if (url && user) {
        const cached = await loadAnalysisCache(url);
        const cachedRaw = cached?.aiMessages;
        cachedExtraInfo = normalizeExtraInfo(cached?.extraInfo);
        if (Array.isArray(cachedRaw)) {
          cachedMessages = cachedRaw.filter(
            (msg) =>
              msg &&
              typeof msg === "object" &&
              typeof msg.role === "string" &&
              typeof msg.content === "string"
          ) as { role: "user" | "assistant"; content: string }[];
        }
      }
      setExtraInfo(cachedExtraInfo);

      if (cachedMessages.length > 0) {
        setAiMessages(cachedMessages);
        setAiError(null);
        setPendingAiPromptId(null);
        setAiCacheHit(true);
      } else if (payload.listing) {
        setPendingAiPromptId(url);
      }

      if (url && user) {
        analysisRunUrlRef.current = url;
        analysisRunIdRef.current = await saveAnalysisRun({
          url,
          input: data,
          listing: payload.listing ?? null,
          aiMessages: cachedMessages,
          extraInfo: cachedExtraInfo,
        });
        void saveAnalysisCache({
          url,
          input: data,
          listing: payload.listing ?? null,
          aiMessages: cachedMessages,
          extraInfo: cachedExtraInfo,
        });
      }
    })();
    setHasViewedResults(false);
    setHasCompletedSteps(false);
    setSelectedYear(1);
    setFormVersion((prev) => prev + 1);
  };

  const handleImportSelect = (id: string) => {
    const item = importHistory.find((entry) => entry.id === id);
    if (!item) return;
    setInputData({ ...DEFAULT_INPUT, ...item.input });
    setAutoFilledKeys(item.autoFilled);
    setSelectedImportId(id);
    analysisRunUrlRef.current = item.url ?? null;
    analysisRunIdRef.current = null;
    setHasViewedResults(false);
    setHasCompletedSteps(false);
    setSelectedYear(1);
    setAiError(null);
    setAiCacheHit(false);
    void (async () => {
      if (!user || !item.url) {
        setAiMessages([]);
        setExtraInfo(createDefaultExtraInfo());
        return;
      }
      const cached = await loadAnalysisCache(item.url);
      setExtraInfo(normalizeExtraInfo(cached?.extraInfo));
      const cachedRaw = cached?.aiMessages;
      if (Array.isArray(cachedRaw)) {
        const cachedMessages = cachedRaw.filter(
          (msg) =>
            msg &&
            typeof msg === "object" &&
            typeof msg.role === "string" &&
            typeof msg.content === "string"
        ) as { role: "user" | "assistant"; content: string }[];
        if (cachedMessages.length > 0) {
          setAiMessages(cachedMessages);
          setAiCacheHit(true);
          return;
        }
      }
      setAiMessages([]);
    })();
    setFormVersion((prev) => prev + 1);
  };

  const handleAnalysisRunSelect = (run: AnalysisRunItem) => {
    const nextInput = { ...DEFAULT_INPUT, ...(run.input ?? {}) };
    setInputData(nextInput);
    setExtraInfo(normalizeExtraInfo(run.extraInfo));
    setAutoFilledKeys([]);
    if (run.url) {
      const id = run.url;
      setImportHistory((prev) => {
        const nextItem: ImportHistoryItem = {
          id,
          url: run.url,
          listing: run.listing ?? null,
          input: nextInput,
          autoFilled: [],
          createdAt: run.updatedAt?.getTime?.() ?? Date.now(),
        };
        const existingIndex = prev.findIndex((item) => item.id === id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next.splice(existingIndex, 1, nextItem);
          return next;
        }
        return [nextItem, ...prev].slice(0, 5);
      });
      setSelectedImportId(id);
    } else {
      setSelectedImportId(null);
    }
    setHasImportResult(true);
    setHasViewedResults(false);
    setHasCompletedSteps(false);
    setSelectedYear(1);
    setAiError(null);
    setAiMessages(run.aiMessages ?? []);
    setAiCacheHit((run.aiMessages ?? []).length > 0);
    setPendingAiPromptId(null);
    analysisRunIdRef.current = run.id;
    analysisRunUrlRef.current = run.url ?? null;
    setFormVersion((prev) => prev + 1);
    setHistoryOpen(false);
  };

  const handleImportClear = () => {
    setImportHistory([]);
    setSelectedImportId(null);
    setHasViewedResults(false);
    setHasCompletedSteps(false);
  };

  const handleImportStart = () => {
    setInputData(DEFAULT_INPUT);
    setExtraInfo(createDefaultExtraInfo());
    setAutoFilledKeys([]);
    setSelectedImportId(null);
    setHasImportResult(false);
    setHasViewedResults(false);
    setHasCompletedSteps(false);
    setSelectedYear(1);
    setAiMessages([]);
    setAiError(null);
    setAiCacheHit(false);
    analysisRunIdRef.current = null;
    analysisRunUrlRef.current = null;
    setFormVersion((prev) => prev + 1);
  };

  const filteredHistory = useMemo(() => {
    const queryText = historyQuery.trim().toLowerCase();
    if (!queryText) return analysisRuns;
    return analysisRuns.filter((run) => {
      const candidates = [
        run.listing?.title,
        run.listing?.propertyName,
        run.listing?.propertyType,
        run.listing?.address,
        run.url,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return candidates.some((value) => value.includes(queryText));
    });
  }, [analysisRuns, historyQuery]);

  const displayHistory = useMemo(() => {
    if (historyView === "all") return filteredHistory;
    const seen = new Set<string>();
    const deduped: AnalysisRunItem[] = [];
    filteredHistory.forEach((run) => {
      const key = run.url ? normalizeUrl(run.url) : run.id;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(run);
    });
    return deduped;
  }, [filteredHistory, historyView]);

  const getCacheDocRef = (url: string) => {
    if (!user) return null;
    const id = `${user.uid}_${hashUrl(normalizeUrl(url))}`;
    return doc(db, "analysisCache", id);
  };

  const loadAnalysisCache = async (url: string) => {
    const ref = getCacheDocRef(url);
    if (!ref) return null;
    try {
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    } catch (error) {
      console.warn("analysis cache read failed", error);
      return null;
    }
  };

  const handleImportCacheLookup = async (url: string) => {
    if (!user) return null;
    const cached = await loadAnalysisCache(url);
    if (!cached || typeof cached !== "object") return null;
    const input = cached.input && typeof cached.input === "object"
      ? { ...DEFAULT_INPUT, ...(cached.input as Partial<PropertyInput>) }
      : null;
    if (!input) return null;
    const listing =
      cached.listing && typeof cached.listing === "object"
        ? (cached.listing as ImportHistoryItem["listing"])
        : null;
    return { input, listing };
  };

  const saveAnalysisCache = async (params: {
    url: string;
    input?: PropertyInput;
    listing?: ImportHistoryItem["listing"];
    aiMessages?: { role: "user" | "assistant"; content: string }[];
    extraInfo?: ExtraInfoInput;
  }) => {
    const ref = getCacheDocRef(params.url);
    if (!ref || !user) return;
    try {
      const payload: Record<string, unknown> = {
        userId: user.uid,
        url: normalizeUrl(params.url),
        updatedAt: serverTimestamp(),
      };
      if (params.input) payload.input = params.input;
      if ("listing" in params) payload.listing = params.listing ?? null;
      if (params.aiMessages) payload.aiMessages = params.aiMessages;
      if (params.extraInfo) payload.extraInfo = params.extraInfo;
      await setDoc(
        ref,
        payload,
        { merge: true }
      );
    } catch (error) {
      console.warn("analysis cache write failed", error);
    }
  };

  const saveAnalysisRun = async (params: {
    url: string;
    input: PropertyInput;
    listing: ImportHistoryItem["listing"];
    aiMessages: { role: "user" | "assistant"; content: string }[];
    extraInfo: ExtraInfoInput;
  }) => {
    if (!user) return null;
    try {
      const ref = await addDoc(collection(db, "analysisRuns"), {
        userId: user.uid,
        url: normalizeUrl(params.url),
        input: params.input,
        listing: params.listing ?? null,
        aiMessages: params.aiMessages,
        extraInfo: params.extraInfo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.warn("analysis run write failed", error);
      return null;
    }
  };

  const handleImportResultChange = (hasResult: boolean) => {
    setHasImportResult(hasResult);
    if (!hasResult) {
      setHasViewedResults(false);
      setHasCompletedSteps(false);
    }
  };

  const selectedImport = useMemo(
    () => (selectedImportId ? importHistory.find((item) => item.id === selectedImportId) ?? null : null),
    [importHistory, selectedImportId]
  );

  useEffect(() => {
    const listingAddress = selectedImport?.listing?.address?.trim() ?? "";
    if (!listingAddress) return;
    setExtraInfo((prev) => {
      const currentAddress = prev.locationChecklist.address.trim();
      if (currentAddress === listingAddress) return prev;
      return {
        ...prev,
        locationChecklist: {
          ...prev.locationChecklist,
          address: listingAddress,
        },
      };
    });
    void fetchLocationChecklistByAddress(listingAddress);
  }, [selectedImport?.id, selectedImport?.listing?.address]);

  const handleFieldTouch = (key: keyof PropertyInput) => {
    setAutoFilledKeys((prev) => prev.filter((item) => item !== key));
  };

  const currentStep = useMemo(() => {
    if (!hasImportResult) return 1;
    if (!hasViewedResults) return 2;
    return 3;
  }, [hasImportResult, hasViewedResults]);

  useEffect(() => {
    if (currentStep === 3) {
      setHasCompletedSteps(true);
    }
  }, [currentStep]);

  useEffect(() => {
    const element = resultsRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasViewedResults(true);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (aiCollapsed) return;
    const container = aiMessagesRef.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [aiMessages, aiLoading, aiCollapsed]);

  const askAi = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || aiLoading) return;
    setAiCacheHit(false);
    const nextMessages: { role: "user" | "assistant"; content: string }[] = [
      ...aiMessages,
      { role: "user", content: trimmed },
    ];
    const limitedMessages = nextMessages.slice(-10);
    setAiMessages(limitedMessages);
    setAiInput("");
    setAiError(null);
    setAiLoading(true);
    try {
      const response = await fetch("/api/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: aiSummary, messages: limitedMessages }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "AIの回答取得に失敗しました。");
      }
      const message = typeof payload?.message === "string" ? payload.message : "";
      if (message) {
        const updatedMessages: { role: "user" | "assistant"; content: string }[] = [
          ...limitedMessages,
          { role: "assistant", content: message },
        ];
        const finalMessages = updatedMessages.slice(-10);
        setAiMessages(finalMessages);
        const cacheUrl = selectedImport?.url;
        if (cacheUrl && user) {
          void saveAnalysisCache({
            url: cacheUrl,
            input: inputData,
            listing: selectedImport?.listing ?? null,
            aiMessages: finalMessages,
            extraInfo,
          });
          if (analysisRunIdRef.current && analysisRunUrlRef.current === cacheUrl) {
            void updateDoc(doc(db, "analysisRuns", analysisRunIdRef.current), {
              aiMessages: finalMessages,
              extraInfo,
              updatedAt: serverTimestamp(),
            }).catch((error) => {
              console.warn("analysis run update failed", error);
            });
          }
        }
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AIの回答取得に失敗しました。");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskAi = (event: FormEvent) => {
    event.preventDefault();
    void askAi(aiInput);
  };

  useEffect(() => {
    if (!user) return;
    const cacheUrl = selectedImport?.url;
    if (!cacheUrl) return;
    if (analysisRunUrlRef.current !== cacheUrl) return;
    const timer = window.setTimeout(() => {
      void saveAnalysisCache({
        url: cacheUrl,
        extraInfo,
      });
      if (analysisRunIdRef.current && analysisRunUrlRef.current === cacheUrl) {
        void updateDoc(doc(db, "analysisRuns", analysisRunIdRef.current), {
          extraInfo,
          updatedAt: serverTimestamp(),
        }).catch((error) => {
          console.warn("analysis run extra info update failed", error);
        });
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [extraInfo, selectedImport?.url, user]);

  useEffect(() => {
    if (!pendingAiPromptId) return;
    if (aiLoading) return;
    if (selectedImport?.id !== pendingAiPromptId) return;
    setPendingAiPromptId(null);
    void askAi(
      "この物件の全体的な評価をお願いします。また、立地や土地の価値（推定金額と土地の比率）、積算価値、部屋のサイズや構成によるターゲット層、周辺相場と比べた家賃想定や表面利回りの妥当性も教えてください。良い買い物とするための交渉や交渉を教えてください。"
    );
  }, [pendingAiPromptId, selectedImport, aiLoading, askAi]);

  const scenarioConfig: ScenarioConfig = {
    interestRateShockEnabled: inputData.scenarioEnabled,
    interestRateShockYear: inputData.scenarioInterestShockYear,
    interestRateShockDelta: inputData.scenarioInterestShockDelta,
    rentCurveEnabled: inputData.scenarioRentCurveEnabled,
    rentDeclineEarlyRate: inputData.scenarioRentDeclineEarlyRate,
    rentDeclineLateRate: inputData.scenarioRentDeclineLateRate,
    rentDeclineSwitchYear: inputData.scenarioRentDeclineSwitchYear,
    occupancyDeclineEnabled: inputData.scenarioOccupancyDeclineEnabled,
    occupancyDeclineStartYear: inputData.scenarioOccupancyDeclineStartYear,
    occupancyDeclineDelta: inputData.scenarioOccupancyDeclineDelta,
  };

  const results = useMemo(() => calculateSimulation(inputData), [inputData]);
  const stressResults = useMemo(
    () => (inputData.scenarioEnabled ? calculateSimulation(inputData, scenarioConfig) : null),
    [inputData]
  );
  const interestStressResults = useMemo(() => {
    const baseRate = Number.isFinite(inputData.interestRate) ? inputData.interestRate : 0;
    const nextRate = Math.max(0, baseRate + 1);
    return calculateSimulation({ ...inputData, interestRate: nextRate });
  }, [inputData]);
  const visibleResults = results.slice(0, 35);
  const selectedResult = results.find((result) => result.year === selectedYear);
  const loanResults = results.filter((result) => result.year <= inputData.loanDuration);
  const visibleLoanResults = results.slice(0, 35);
  const basePrice = inputData.price;
  const buildingPrice = Math.round(basePrice * (inputData.buildingRatio / 100));
  const landPrice = Math.max(0, basePrice - buildingPrice);
  const equipmentPrice = inputData.enableEquipmentSplit
    ? Math.round(buildingPrice * (inputData.equipmentRatio / 100))
    : 0;
  const bodyPrice = Math.max(0, buildingPrice - equipmentPrice);
  const miscCost = Math.round(basePrice * (inputData.miscCostRate / 100));
  const waterContribution = Math.round(basePrice * (inputData.waterContributionRate / 100));
  const fireInsurance = Math.round(buildingPrice * (inputData.fireInsuranceRate / 100));
  const loanFee = Math.round(inputData.loanAmount * (inputData.loanFeeRate / 100));
  const registrationCost = Math.round(basePrice * (inputData.registrationCostRate / 100));
  const totalInitialCosts =
    miscCost + waterContribution + fireInsurance + loanFee + registrationCost;
  const totalPrice = basePrice + totalInitialCosts;
  const landEvaluation = Math.round(landPrice * (inputData.landEvaluationRate / 100));
  const buildingEvaluation = Math.round(buildingPrice * (inputData.buildingEvaluationRate / 100));
  const propertyTaxBase =
    landEvaluation * (inputData.landTaxReductionRate / 100) + buildingEvaluation;
  const fixedAssetTaxEstimate = Math.round(propertyTaxBase * 0.014);
  const cityPlanningTaxEstimate = Math.round(propertyTaxBase * 0.003);
  const propertyTaxEstimate = Math.round(
    propertyTaxBase * (inputData.propertyTaxRate / 100)
  );
  const acquisitionTaxEstimate = Math.round(
    (landEvaluation * (inputData.acquisitionLandReductionRate / 100) + buildingEvaluation) *
      (inputData.acquisitionTaxRate / 100)
  );
  const depreciationYears = Math.max(1, calculateUsefulLife(inputData.structure, inputData.buildingAge));
  const equipmentLife = inputData.enableEquipmentSplit
    ? Math.max(1, Math.round(inputData.equipmentUsefulLife || 15))
    : 0;
  const bodyDepreciation = Math.round(bodyPrice / depreciationYears);
  const equipmentDepreciation = inputData.enableEquipmentSplit
    ? Math.round(equipmentPrice / equipmentLife)
    : 0;
  const totalDepreciation = bodyDepreciation + equipmentDepreciation;
  const monthlyPayment =
    inputData.loanAmount > 0 && inputData.loanDuration > 0
      ? calculatePMT(inputData.interestRate, inputData.loanDuration, inputData.loanAmount)
      : 0;
  const annualPayment = Math.round(monthlyPayment * 12);
  const totalRepayment = loanResults.reduce((sum, result) => sum + result.loanPaymentTotal, 0);
  const equity = totalPrice - inputData.loanAmount;
  const exitYear = Math.min(Math.max(1, Math.round(inputData.exitYear)), results.length || 35);
  const exitResult = results.find((result) => result.year === exitYear);
  const accumulatedBodyDep = results
    .slice(0, exitYear)
    .reduce((sum, result) => sum + result.depreciationBody, 0);
  const accumulatedEquipmentDep = results
    .slice(0, exitYear)
    .reduce((sum, result) => sum + result.depreciationEquipment, 0);
  const remainingBasis =
    landPrice +
    Math.max(0, bodyPrice - accumulatedBodyDep) +
    Math.max(0, equipmentPrice - accumulatedEquipmentDep) +
    totalInitialCosts +
    acquisitionTaxEstimate;
  const exitCapRate = inputData.exitCapRate / 100;
  const exitNoi = exitResult
    ? exitResult.income - exitResult.expense - exitResult.propertyTax
    : 0;
  const exitSalePrice = exitCapRate > 0 ? Math.round(exitNoi / exitCapRate) : 0;
  const exitBrokerage = Math.round(
    exitSalePrice * (inputData.exitBrokerageRate / 100) + inputData.exitBrokerageFixed
  );
  const exitOtherCosts = Math.round(exitSalePrice * (inputData.exitOtherCostRate / 100));
  const taxableGain = exitSalePrice - exitBrokerage - exitOtherCosts - remainingBasis;
  const exitTaxRate =
    exitYear <= 5 ? inputData.exitShortTermTaxRate : inputData.exitLongTermTaxRate;
  const exitTax = taxableGain > 0 ? Math.round(taxableGain * (exitTaxRate / 100)) : 0;
  const exitLoanBalance = exitResult ? exitResult.loanBalance : 0;
  const exitNetProceeds = inputData.exitEnabled
    ? Math.round(exitSalePrice - exitBrokerage - exitOtherCosts - exitTax - exitLoanBalance)
    : 0;
  const exitCashFlows = inputData.exitEnabled
    ? [
        -equity,
        ...results.slice(0, exitYear).map((result) => result.cashFlowPostTax),
      ]
    : [];
  if (inputData.exitEnabled && exitCashFlows.length > exitYear) {
    exitCashFlows[exitYear] += exitNetProceeds;
  }
  const exitIrr = inputData.exitEnabled ? calculateIRR(exitCashFlows) : null;
  const exitNpv = inputData.exitEnabled
    ? calculateNPV(inputData.exitDiscountRate / 100, exitCashFlows)
    : null;
  const baseEquityMultiple = inputData.exitEnabled && equity > 0
    ? exitCashFlows.slice(1).reduce((sum, cashFlow) => sum + cashFlow, 0) / equity
    : null;

  const aiSummary = useMemo(() => {
    const windowResults = results.slice(0, Math.min(results.length, 10));
    const avgCashFlow =
      windowResults.length > 0
        ? Math.round(
            windowResults.reduce((sum, result) => sum + result.cashFlowPostTax, 0) /
              windowResults.length
          )
        : 0;
    const minCashFlow =
      results.length > 0
        ? Math.min(...results.map((result) => result.cashFlowPostTax))
        : 0;
    const deadCrossYears = results.filter((result) => result.isDeadCross).map((result) => result.year);
    const everyFiveYears = results
      .filter((result) => result.year === 1 || (result.year % 5 === 0 && result.year <= 30))
      .map((result) => ({
        year: result.year,
        income: result.income,
        expense: result.expense,
        propertyTax: result.propertyTax,
        repairCost: result.repairCost,
        loanPaymentTotal: result.loanPaymentTotal,
        loanInterest: result.loanInterest,
        loanPrincipal: result.loanPrincipal,
        loanBalance: result.loanBalance,
        depreciationBody: result.depreciationBody,
        depreciationEquipment: result.depreciationEquipment,
        depreciationTotal: result.depreciationTotal,
        taxableIncome: result.taxableIncome,
        taxAmount: result.taxAmount,
        cashFlowPreTax: result.cashFlowPreTax,
        cashFlowPostTax: result.cashFlowPostTax,
        acquisitionTax: result.acquisitionTax,
        isDeadCross: result.isDeadCross,
      }));
    const cashflowEveryFiveYears = everyFiveYears.map((result) => ({
      year: result.year,
      income: result.income,
      expense: result.expense,
      propertyTax: result.propertyTax,
      repairCost: result.repairCost,
      loanPaymentTotal: result.loanPaymentTotal,
      loanInterest: result.loanInterest,
      loanPrincipal: result.loanPrincipal,
      taxAmount: result.taxAmount,
      cashFlowPreTax: result.cashFlowPreTax,
      cashFlowPostTax: result.cashFlowPostTax,
      acquisitionTax: result.acquisitionTax,
      loanBalance: result.loanBalance,
      isDeadCross: result.isDeadCross,
    }));
    return {
      input: {
        price: inputData.price,
        loanAmount: inputData.loanAmount,
        interestRate: inputData.interestRate,
        loanDuration: inputData.loanDuration,
        monthlyRent: inputData.monthlyRent,
        occupancyRate: inputData.occupancyRate,
        rentDeclineRate: inputData.rentDeclineRate,
        operatingExpenseRate: inputData.operatingExpenseRate,
        structure: inputData.structure,
        buildingAge: inputData.buildingAge,
      },
      listing: selectedImport?.listing ?? null,
      listingUrl: selectedImport?.url ?? null,
      performance: {
        avgCashFlow,
        minCashFlow,
        deadCrossYears,
      },
      cashflowEveryFiveYears,
      simulationEveryFiveYears: everyFiveYears,
      exit: inputData.exitEnabled
        ? {
            exitYear,
            exitCapRate: inputData.exitCapRate,
            netProceeds: exitNetProceeds,
            irr: exitIrr,
            npv: exitNpv,
            equityMultiple: baseEquityMultiple,
          }
        : null,
    };
  }, [
    results,
    inputData,
    selectedImport,
    exitYear,
    exitNetProceeds,
    exitIrr,
    exitNpv,
    baseEquityMultiple,
  ]);

  const stressExit =
    inputData.exitEnabled && stressResults
      ? (() => {
          const stressExitResult = stressResults.find((result) => result.year === exitYear);
          const stressNoi = stressExitResult
            ? stressExitResult.income -
              stressExitResult.expense -
              stressExitResult.propertyTax
            : 0;
          const stressSalePrice = exitCapRate > 0 ? Math.round(stressNoi / exitCapRate) : 0;
          const stressBrokerage = Math.round(
            stressSalePrice * (inputData.exitBrokerageRate / 100) + inputData.exitBrokerageFixed
          );
          const stressOtherCosts = Math.round(
            stressSalePrice * (inputData.exitOtherCostRate / 100)
          );
          const stressTaxableGain = stressSalePrice - stressBrokerage - stressOtherCosts - remainingBasis;
          const stressTax = stressTaxableGain > 0 ? Math.round(stressTaxableGain * (exitTaxRate / 100)) : 0;
          const stressLoanBalance = stressExitResult ? stressExitResult.loanBalance : 0;
          const stressNetProceeds = Math.round(
            stressSalePrice - stressBrokerage - stressOtherCosts - stressTax - stressLoanBalance
          );
          const stressCashFlows = [
            -equity,
            ...stressResults.slice(0, exitYear).map((result) => result.cashFlowPostTax),
          ];
          if (stressCashFlows.length > exitYear) {
            stressCashFlows[exitYear] += stressNetProceeds;
          }
          return {
            salePrice: stressSalePrice,
            netProceeds: stressNetProceeds,
            irr: calculateIRR(stressCashFlows),
            npv: calculateNPV(inputData.exitDiscountRate / 100, stressCashFlows),
            equityMultiple:
              equity > 0
                ? stressCashFlows.slice(1).reduce((sum, cashFlow) => sum + cashFlow, 0) / equity
                : null,
          };
        })()
      : null;
  const deadCrossYears = results.filter((result) => result.isDeadCross).map((result) => result.year);
  const firstDeadCrossYear = deadCrossYears.length > 0 ? deadCrossYears[0] : null;
  const summarizeScenario = (scenarioResults: YearlyResult[]) => {
    const totalCashFlow = scenarioResults.reduce(
      (sum, result) => sum + result.cashFlowPostTax,
      0
    );
    let minCashFlow = Number.POSITIVE_INFINITY;
    let minCashFlowYear = 1;
    let minDscr = Number.POSITIVE_INFINITY;
    scenarioResults.forEach((result) => {
      if (result.cashFlowPostTax < minCashFlow) {
        minCashFlow = result.cashFlowPostTax;
        minCashFlowYear = result.year;
      }
      if (result.loanPaymentTotal > 0) {
        const noi = result.income - result.expense - result.propertyTax - result.repairCost;
        const dscr = noi / result.loanPaymentTotal;
        if (dscr < minDscr) minDscr = dscr;
      }
    });
    return {
      totalCashFlow,
      minCashFlow,
      minCashFlowYear,
      minDscr: Number.isFinite(minDscr) ? minDscr : NaN,
    };
  };
  const baseSummary = summarizeScenario(results);
  const stressSummary = stressResults ? summarizeScenario(stressResults) : null;
  const kpiResult = selectedResult ?? results[0];
  const kpiYear = kpiResult?.year ?? 1;
  const kpiStressResult = interestStressResults.find((result) => result.year === kpiYear);
  const calcNoi = (result?: YearlyResult) =>
    result
      ? result.income - result.expense - result.propertyTax - result.repairCost
      : Number.NaN;
  const calcOpex = (result?: YearlyResult) =>
    result ? result.expense + result.propertyTax + result.repairCost : Number.NaN;
  const kpiNoi = calcNoi(kpiResult);
  const kpiOpex = calcOpex(kpiResult);
  const kpiGpi = kpiResult?.grossPotentialRent ?? Number.NaN;
  const kpiAds = kpiResult?.loanPaymentTotal ?? Number.NaN;
  const kpiDscr = kpiAds > 0 ? kpiNoi / kpiAds : Number.NaN;
  const kpiDscrStress =
    kpiStressResult && kpiStressResult.loanPaymentTotal > 0
      ? calcNoi(kpiStressResult) / kpiStressResult.loanPaymentTotal
      : Number.NaN;
  const kpiRepaymentRatio = kpiGpi > 0 ? (kpiAds / kpiGpi) * 100 : Number.NaN;
  const kpiBer = kpiGpi > 0 ? ((kpiOpex + kpiAds) / kpiGpi) * 100 : Number.NaN;
  const kpiNoiYield = totalPrice > 0 ? (kpiNoi / totalPrice) * 100 : Number.NaN;
  const kpiYieldGap = Number.isFinite(kpiNoiYield)
    ? kpiNoiYield - inputData.interestRate
    : Number.NaN;
  const kpiCcrPreTax = equity > 0 ? (kpiResult.cashFlowPreTax / equity) * 100 : Number.NaN;
  const kpiCcrPostTax = equity > 0 ? (kpiResult.cashFlowPostTax / equity) * 100 : Number.NaN;
  const kpiAtcf = kpiResult.cashFlowPostTax;
  const tenYearCashFlowCumulative = results
    .slice(0, Math.min(10, results.length))
    .reduce((sum, result) => sum + result.cashFlowPostTax, 0);
  const kpiCashFlow10yWithExit = inputData.exitEnabled
    ? tenYearCashFlowCumulative + exitNetProceeds
    : Number.NaN;
  const kpiDeadCrossLabel = firstDeadCrossYear ? `${firstDeadCrossYear}年目` : "なし";
  const getRiskByThreshold = (
    value: number,
    goodThreshold: number,
    warnThreshold: number,
    inverse = false
  ): KpiRisk => {
    if (!Number.isFinite(value)) return "neutral";
    if (!inverse) {
      if (value >= goodThreshold) return "good";
      if (value >= warnThreshold) return "warn";
      return "bad";
    }
    if (value <= goodThreshold) return "good";
    if (value <= warnThreshold) return "warn";
    return "bad";
  };
  const getRiskByZero = (value: number): KpiRisk => {
    if (!Number.isFinite(value)) return "neutral";
    return value >= 0 ? "good" : "bad";
  };
  const kpiItems: {
    id: KpiInfoKey;
    label: string;
    value: number | string;
    format: "yen" | "percent" | "ratio" | "text";
    note?: string;
    risk: KpiRisk;
  }[] = [
    {
      id: "dscr",
      label: "DSCR",
      value: kpiDscr,
      format: "ratio",
      note: "目安: 1.20+",
      risk: getRiskByThreshold(kpiDscr, 1.3, 1.2),
    },
    {
      id: "dscrStress",
      label: "DSCR（+1%）",
      value: kpiDscrStress,
      format: "ratio",
      note: "金利+1%",
      risk: getRiskByThreshold(kpiDscrStress, 1.2, 1.0),
    },
    {
      id: "repaymentRatio",
      label: "返済比率",
      value: kpiRepaymentRatio,
      format: "percent",
      note: "目安: 50%以下",
      risk: getRiskByThreshold(kpiRepaymentRatio, 45, 55, true),
    },
    {
      id: "ber",
      label: "損益分岐点入居率",
      value: kpiBer,
      format: "percent",
      note: "目安: 80%以下",
      risk: getRiskByThreshold(kpiBer, 80, 85, true),
    },
    {
      id: "noiYield",
      label: "実質利回り（NOI）",
      value: kpiNoiYield,
      format: "percent",
      risk: getRiskByThreshold(kpiNoiYield, 5, 3.5),
    },
    {
      id: "yieldGap",
      label: "イールドギャップ",
      value: kpiYieldGap,
      format: "percent",
      note: "目安: +1.5%",
      risk: getRiskByThreshold(kpiYieldGap, 2, 1),
    },
    {
      id: "ccrPreTax",
      label: "CCR（税引前）",
      value: kpiCcrPreTax,
      format: "percent",
      risk: getRiskByThreshold(kpiCcrPreTax, 10, 5),
    },
    {
      id: "ccrPostTax",
      label: "CCR（税引後）",
      value: kpiCcrPostTax,
      format: "percent",
      risk: getRiskByThreshold(kpiCcrPostTax, 8, 4),
    },
    {
      id: "atcf",
      label: "税引後CF（ATCF）",
      value: kpiAtcf,
      format: "yen",
      risk: getRiskByZero(kpiAtcf),
    },
    {
      id: "cashFlow10yWithExit",
      label: "10年CF累計+売却手残り",
      value: kpiCashFlow10yWithExit,
      format: "yen",
      note: inputData.exitEnabled
        ? `1〜10年CF + 売却手残り（${exitYear}年目）`
        : "出口戦略を有効化すると表示",
      risk: getRiskByZero(kpiCashFlow10yWithExit),
    },
    {
      id: "deadCross",
      label: "デッドクロス",
      value: kpiDeadCrossLabel,
      format: "text",
      risk: firstDeadCrossYear ? "warn" : "good",
    },
  ];
  const riskScoreMap: Record<KpiRisk, number> = {
    good: 100,
    warn: 60,
    bad: 20,
    neutral: 50,
  };
  const handleKpiInfoToggle = (id: KpiInfoKey) => {
    setActiveKpiInfo((prev) => (prev === id ? null : id));
  };
  const handleTableInfoToggle = (id: string) => {
    setActiveTableInfo((prev) => (prev === id ? null : id));
  };
  const renderTableRowTitle = (label: string, infoKey?: string) => {
    const key = infoKey ?? label;
    const info = TABLE_ROW_INFO[key];
    if (!info) return label;
    return (
      <span className="row-title-content">
        <span>{label}</span>
        <span className="input-info">
          <button
            type="button"
            className="input-info-btn"
            onClick={(event) => {
              event.stopPropagation();
              handleTableInfoToggle(key);
            }}
            aria-label={`${label}の説明`}
            aria-expanded={activeTableInfo === key}
          >
            i
          </button>
          {activeTableInfo === key ? (
            <div className="input-info-popover">
              <div className="input-info-title">{info.title}</div>
              <p className="input-info-text">{info.body}</p>
              {info.note ? <div className="input-info-note">{info.note}</div> : null}
            </div>
          ) : null}
        </span>
      </span>
    );
  };
  const kpiRiskById = new Map(kpiItems.map((item) => [item.id, item.risk]));
  const scoreCandidates: KpiRisk[] = [
    kpiRiskById.get("dscr"),
    kpiRiskById.get("dscrStress"),
    kpiRiskById.get("repaymentRatio"),
    kpiRiskById.get("ber"),
    kpiRiskById.get("yieldGap"),
    kpiRiskById.get("ccrPostTax"),
    kpiRiskById.get("atcf"),
    kpiRiskById.get("deadCross"),
  ].filter((risk): risk is KpiRisk => typeof risk === "string");
  const safetyScore =
    scoreCandidates.length > 0
      ? Math.round(
          scoreCandidates.reduce((sum, risk) => sum + riskScoreMap[risk], 0) /
            scoreCandidates.length
        )
      : 0;
  const safetyTone: KpiRisk =
    safetyScore >= 80 ? "good" : safetyScore >= 60 ? "warn" : "bad";
  const renderKpiValue = (item: (typeof kpiItems)[number]) => {
    if (item.format === "text") {
      return item.value as string;
    }
    if (!Number.isFinite(item.value as number)) {
      return "-";
    }
    const numeric = item.value as number;
    if (item.format === "yen") return formatYen(numeric);
    if (item.format === "ratio") return formatRatio(numeric);
    return formatPercent(numeric);
  };

  const investmentScore = useMemo(() => {
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const toNumber = (value: number | "") => (value === "" ? null : Number(value));

    const walkMinutes = toNumber(investmentInput.walkMinutes);
    const rentGapPercent = toNumber(investmentInput.rentGapPercent);

    const demandTrendScore =
      investmentInput.demandTrend === "UP"
        ? 10
        : investmentInput.demandTrend === "FLAT"
          ? 6
          : investmentInput.demandTrend === "DOWN"
            ? 2
            : 6;
    const targetFitScore =
      investmentInput.targetFit === "HIGH"
        ? 10
        : investmentInput.targetFit === "MID"
          ? 6
          : investmentInput.targetFit === "LOW"
            ? 2
            : 6;
    const demandScore = clamp(demandTrendScore + targetFitScore, 0, 20);

    const walkScore =
      walkMinutes === null
        ? 6
        : walkMinutes <= 7
          ? 12
          : walkMinutes <= 10
            ? 9
            : walkMinutes <= 12
              ? 6
              : walkMinutes <= 15
                ? 3
                : 0;
    const convenienceScore =
      investmentInput.convenience === "HIGH"
        ? 8
        : investmentInput.convenience === "MID"
          ? 5
          : investmentInput.convenience === "LOW"
            ? 2
            : 5;
    const locationScore = clamp(walkScore + convenienceScore, 0, 20);

    const hazardScore =
      investmentInput.hazardRisk === "NONE"
        ? 10
        : investmentInput.hazardRisk === "LOW"
          ? 7
          : investmentInput.hazardRisk === "HIGH"
            ? 0
            : 5;

    const rentGapScore =
      rentGapPercent === null
        ? 10
        : rentGapPercent <= 0
          ? 14
          : rentGapPercent <= 3
            ? 12
            : rentGapPercent <= 5
              ? 10
              : rentGapPercent <= 8
                ? 7
                : rentGapPercent <= 10
                  ? 5
                  : rentGapPercent <= 15
                    ? 3
                    : 0;
    const competitionScore =
      investmentInput.competitionLevel === "LOW"
        ? 6
        : investmentInput.competitionLevel === "MID"
          ? 4
          : investmentInput.competitionLevel === "HIGH"
            ? 1
            : 4;
    const rentScore = clamp(rentGapScore + competitionScore, 0, 20);

    const base70 = clamp(demandScore + locationScore + hazardScore + rentScore, 0, 70);
    const base80 = Math.round((base70 / 70) * 80);
    const fieldAdjustment = clamp(investmentInput.fieldAdjustment, -20, 20);
    const totalScore = clamp(base80 + fieldAdjustment, 0, 100);

    const filledCount = [
      investmentInput.demandTrend !== "UNKNOWN",
      investmentInput.targetFit !== "UNKNOWN",
      walkMinutes !== null,
      investmentInput.convenience !== "UNKNOWN",
      investmentInput.hazardRisk !== "UNKNOWN",
      rentGapPercent !== null,
      investmentInput.competitionLevel !== "UNKNOWN",
    ].filter(Boolean).length;
    const confidence = Math.round((filledCount / 7) * 100);

    const grade =
      totalScore >= 85
        ? "A"
        : totalScore >= 75
          ? "B+"
          : totalScore >= 65
            ? "B"
            : totalScore >= 55
              ? "C"
              : "D";
    const decision =
      totalScore >= 80 && (rentGapPercent === null || rentGapPercent <= 5)
        ? "Go"
        : totalScore >= 65
          ? "Hold"
          : "Recalculate";

    const demandReason =
      investmentInput.demandTrend === "UNKNOWN" || investmentInput.targetFit === "UNKNOWN"
        ? "世帯/ターゲットの情報が未入力のため中立評価です。"
        : investmentInput.demandTrend === "DOWN" || investmentInput.targetFit === "LOW"
          ? "単身需要かターゲット適合が弱く、需要面で注意が必要です。"
          : "単身需要とターゲット適合は良好と判断しました。";

    const locationReason =
      walkMinutes === null
        ? "実歩行分数が未入力のため中立評価です。"
        : walkMinutes > 12
          ? "駅距離が長めで、客付けに不利な可能性があります。"
          : walkMinutes <= 10
            ? "駅徒歩10分以内で利便性は良好です。"
            : "駅距離は許容範囲ですが、注意ラインです。";

    const hazardReason =
      investmentInput.hazardRisk === "UNKNOWN"
        ? "ハザード情報が未確認のため中立評価です。"
        : investmentInput.hazardRisk === "HIGH"
          ? "ハザード該当のためリスクが高いです。"
          : investmentInput.hazardRisk === "LOW"
            ? "軽度のハザード該当があり、注意が必要です。"
            : "大きなハザード該当は見当たりません。";

    const rentReason =
      rentGapPercent === null
        ? "想定家賃と相場のギャップが未入力のため中立評価です。"
        : rentGapPercent > 10
          ? "想定家賃が相場より高く、調整が必要です。"
          : rentGapPercent > 5
            ? "想定家賃がやや強気な設定です。"
            : rentGapPercent <= 0
              ? "想定家賃は相場内で堅実です。"
              : "想定家賃は許容範囲内です。";

    return {
      base80,
      totalScore,
      fieldAdjustment,
      confidence,
      grade,
      decision,
      breakdown: [
        {
          label: "需要・ターゲット適合",
          score: demandScore,
          max: 20,
          reason: demandReason,
        },
        {
          label: "立地・利便性",
          score: locationScore,
          max: 20,
          reason: locationReason,
        },
        {
          label: "災害リスク",
          score: hazardScore,
          max: 10,
          reason: hazardReason,
          warning: investmentInput.hazardRisk === "HIGH",
        },
        {
          label: "家賃妥当性・競合",
          score: rentScore,
          max: 20,
          reason: rentReason,
        },
      ],
    };
  }, [investmentInput]);

  const isCorporateTax = inputData.taxType === "CORPORATE";
  const corporateMinimumTax = Math.max(0, inputData.corporateMinimumTax || 0);
  const getCorporateTax = (result: YearlyResult) =>
    Math.max(0, result.taxAmount - corporateMinimumTax);
  const taxRows: TableRow[] = isCorporateTax
    ? [
        {
          label: "法人税(15/23%)",
          value: (r: YearlyResult) => getCorporateTax(r),
          outflow: true,
          tone: "negative",
        },
        {
          label: "法人均等割",
          value: () => corporateMinimumTax,
          outflow: true,
          tone: "negative",
        },
      ]
    : [
        {
          label: "所得税概算",
          value: (r: YearlyResult) => r.taxAmount,
          outflow: true,
          tone: "negative",
        },
      ];

  const tableSections: TableSection[] = [
    {
      title: "収入・支出",
      rows: [
        { label: "家賃収入", value: (r: YearlyResult) => r.income },
        { label: "減価償却費", value: (r: YearlyResult) => r.depreciationTotal },
        {
          label: "固定資産税・都市計画税",
          value: (r: YearlyResult) => r.propertyTax,
          outflow: true,
          tone: "negative",
        },
        { label: "修繕費", value: (r: YearlyResult) => r.repairCost, outflow: true, tone: "negative" },
        { label: "管理費等経費", value: (r: YearlyResult) => r.expense, outflow: true, tone: "negative" },
        { label: "返済利息", value: (r: YearlyResult) => r.loanInterest, outflow: true, tone: "subtle" },
        {
          label: "経費計",
          value: (r: YearlyResult) =>
            r.depreciationTotal + r.propertyTax + r.repairCost + r.expense + r.loanInterest,
          outflow: true,
          tone: "highlight",
        },
        { label: "所得概算", value: (r: YearlyResult) => r.taxableIncome, tone: "highlight" },
        ...taxRows,
      ],
    },
    {
      title: "返済計画",
      rows: [
        { label: "借入残高", value: (r) => r.loanBalance },
        { label: "年間返済元金", value: (r) => r.loanPrincipal, outflow: true, tone: "subtle" },
        { label: "年間返済利息", value: (r) => r.loanInterest, outflow: true, tone: "subtle" },
        { label: "年間返済計", value: (r) => r.loanPaymentTotal, outflow: true, tone: "highlight" },
      ],
    },
    {
      title: "指標",
      rows: [
        {
          label: "返済比率",
          value: (r) => (r.income > 0 ? (r.loanPaymentTotal / r.income) * 100 : NaN),
          format: "percent",
        },
        {
          label: "DSCR",
          value: (r) =>
            r.loanPaymentTotal > 0
              ? ((r.income - r.expense - r.propertyTax - r.repairCost) / r.loanPaymentTotal)
              : NaN,
          format: "ratio",
        },
        {
          label: "純利回り",
          value: (r) =>
            totalPrice > 0 ? ((r.income - r.expense - r.propertyTax) / totalPrice) * 100 : NaN,
          format: "percent",
        },
        {
          label: "CCR",
          value: (r) => (equity > 0 ? (r.cashFlowPostTax / equity) * 100 : NaN),
          format: "percent",
        },
      ],
    },
  ];

  useEffect(() => {
    if (!results.length) return;
    if (selectedYear > results.length) {
      setSelectedYear(results.length);
    }
  }, [results, selectedYear]);

  const leftPanels: Record<string, ReactNode> = {
    tip: (
      <div className="tip-card">
        <Calculator size={18} />
        <span>
          数値を変更するとリアルタイムで更新されます。
          <br />
          「高度な設定」で設備分離・税務条件も切り替え可能です。
        </span>
      </div>
    ),
    breakdownPrice: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">物件価格 内訳</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownPrice")}
              aria-expanded={openSections.breakdownPrice}
            >
              {openSections.breakdownPrice ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownPrice ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">物件価格 (本体)</td>
                  <td className="value calc total">{formatYen(basePrice)}</td>
                </tr>
                <tr>
                  <td className="label">建物価格 (概算)</td>
                  <td className="value input">{formatYen(buildingPrice)}</td>
                </tr>
                <tr>
                  <td className="label">土地価格 (概算)</td>
                  <td className="value input">{formatYen(landPrice)}</td>
                </tr>
                <tr>
                  <td className="label">初期費用合計</td>
                  <td className="value calc">{formatYen(totalInitialCosts)}</td>
                </tr>
                <tr>
                  <td className="label">購入総額 (本体+初期費用)</td>
                  <td className="value calc total">{formatYen(totalPrice)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">※建物比率と初期費用設定から自動算出</div>
          </>
        ) : null}
      </div>
    ),
    breakdownInitial: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">初期費用 内訳</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownInitial")}
              aria-expanded={openSections.breakdownInitial}
            >
              {openSections.breakdownInitial ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownInitial ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">水道分担金 ({inputData.waterContributionRate}%)</td>
                  <td className="value calc">{formatYen(waterContribution)}</td>
                </tr>
                <tr>
                  <td className="label">火災保険 (5年一括)</td>
                  <td className="value calc">{formatYen(fireInsurance)}</td>
                </tr>
                <tr>
                  <td className="label">融資手数料 ({inputData.loanFeeRate}%)</td>
                  <td className="value calc">{formatYen(loanFee)}</td>
                </tr>
                <tr>
                  <td className="label">登記費用 ({inputData.registrationCostRate}%)</td>
                  <td className="value calc">{formatYen(registrationCost)}</td>
                </tr>
                <tr>
                  <td className="label">その他諸費用 ({inputData.miscCostRate}%)</td>
                  <td className="value calc">{formatYen(miscCost)}</td>
                </tr>
                <tr>
                  <td className="label">初期費用合計</td>
                  <td className="value calc total">{formatYen(totalInitialCosts)}</td>
                </tr>
                <tr>
                  <td className="label">不動産取得税 (翌年)</td>
                  <td className="value calc">{formatYen(acquisitionTaxEstimate)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">※不動産取得税は購入翌年に支払い</div>
          </>
        ) : null}
      </div>
    ),
    breakdownTax: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">固定資産税・都市計画税計算用</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算値</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownTax")}
              aria-expanded={openSections.breakdownTax}
            >
              {openSections.breakdownTax ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownTax ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">土地の評価額 (土地×{inputData.landEvaluationRate}%)</td>
                  <td className="value calc">{formatYen(landEvaluation)}</td>
                </tr>
                <tr>
                  <td className="label">建物評価額 (建物×{inputData.buildingEvaluationRate}%)</td>
                  <td className="value calc">{formatYen(buildingEvaluation)}</td>
                </tr>
                <tr>
                  <td className="label">固定資産税・都市計画税概算額</td>
                  <td className="value calc total">{formatYen(propertyTaxEstimate)}</td>
                </tr>
                <tr>
                  <td className="label">固定資産税 (1.4%)</td>
                  <td className="value calc">{formatYen(fixedAssetTaxEstimate)}</td>
                </tr>
                <tr>
                  <td className="label">都市計画税 (0.3%)</td>
                  <td className="value calc">{formatYen(cityPlanningTaxEstimate)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">
              ※住宅用地特例({inputData.landTaxReductionRate}%適用)・税率
              {inputData.propertyTaxRate}%で概算
            </div>
          </>
        ) : null}
      </div>
    ),
    breakdownDep: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">減価償却計算用</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算値</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownDep")}
              aria-expanded={openSections.breakdownDep}
            >
              {openSections.breakdownDep ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownDep ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">躯体減価償却費 (年間)</td>
                  <td className="value calc">{formatYen(bodyDepreciation)}</td>
                </tr>
                {inputData.enableEquipmentSplit ? (
                  <tr>
                    <td className="label">設備減価償却費 (年間)</td>
                    <td className="value calc">{formatYen(equipmentDepreciation)}</td>
                  </tr>
                ) : null}
                {inputData.enableEquipmentSplit ? (
                  <tr>
                    <td className="label">設備耐用年数</td>
                    <td className="value calc">{equipmentLife}年</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="label">残存償却年数</td>
                  <td className="value calc total">{depreciationYears}年</td>
                </tr>
                {inputData.enableEquipmentSplit ? (
                  <tr>
                    <td className="label">減価償却費 合計</td>
                    <td className="value calc total">{formatYen(totalDepreciation)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="breakdown-foot">※簡便法での耐用年数を使用</div>
          </>
        ) : null}
      </div>
    ),
    breakdownLoan: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">借入・返済試算用</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算値</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownLoan")}
              aria-expanded={openSections.breakdownLoan}
            >
              {openSections.breakdownLoan ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownLoan ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">自己資金</td>
                  <td className="value calc">{formatYen(equity)}</td>
                </tr>
                <tr>
                  <td className="label">借入額</td>
                  <td className="value input">{formatYen(inputData.loanAmount)}</td>
                </tr>
                <tr>
                  <td className="label">融資対象</td>
                  <td className="value input">
                    {inputData.loanCoverageMode === "PRICE_AND_INITIAL"
                      ? "物件価格+初期費用"
                      : "物件価格のみ"}
                  </td>
                </tr>
                <tr>
                  <td className="label">金利</td>
                  <td className="value input">{formatPercent(inputData.interestRate)}</td>
                </tr>
                <tr>
                  <td className="label">返済期間 (年)</td>
                  <td className="value input">{inputData.loanDuration}年</td>
                </tr>
                <tr>
                  <td className="label">月次返済額</td>
                  <td className="value calc">{formatYen(monthlyPayment)}</td>
                </tr>
                <tr>
                  <td className="label">年間返済額</td>
                  <td className="value calc total">{formatYen(annualPayment)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">※元利均等返済で概算</div>
          </>
        ) : null}
      </div>
    ),
  };

  const rightPanels: Record<string, ReactNode> = {
    kpi: (
      <div className="sheet-card kpi-card">
        <div className="table-head">
          <h2 className="table-title">投資KPIダッシュボード</h2>
          <div className="table-actions">
            <div className="table-controls">
              <span className={`kpi-score kpi-score-${safetyTone}`}>
                安全スコア {safetyScore}
              </span>
              <label className="kpi-select">
                <span>対象年</span>
                <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                  {results.map((result) => (
                    <option key={`kpi-year-${result.year}`} value={result.year}>
                      {result.year}年目
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("kpi")}
              aria-expanded={openSections.kpi}
            >
              {openSections.kpi ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.kpi ? (
          <div className="kpi-grid">
            {kpiItems.map((item) => {
              const info = KPI_INFO[item.id];
              return (
                <div key={item.label} className={`kpi-item kpi-risk-${item.risk}`}>
                  <div className="kpi-label-row">
                    <span className="kpi-label">{item.label}</span>
                    <button
                      type="button"
                      className="kpi-info-btn"
                      onClick={() => handleKpiInfoToggle(item.id)}
                      aria-expanded={activeKpiInfo === item.id}
                      aria-label={`${item.label}の説明`}
                    >
                      i
                    </button>
                  </div>
                  <span className={`kpi-value kpi-value-${item.risk}`}>
                    {renderKpiValue(item)}
                  </span>
                  {item.note ? <span className="kpi-note">{item.note}</span> : null}
                  {activeKpiInfo === item.id ? (
                    <div className="kpi-popover">
                      <div className="kpi-popover-title">{info.title}</div>
                      <p className="kpi-popover-text">{info.summary}</p>
                      {info.formula ? (
                        <div className="kpi-popover-note">式: {info.formula}</div>
                      ) : null}
                      {info.threshold ? (
                        <div className="kpi-popover-note">目安: {info.threshold}</div>
                      ) : null}
                      <p className="kpi-popover-detail">{info.detail}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    ),
    investmentScore: (
      <div className="sheet-card investment-card">
        <div className="table-head">
          <h2 className="table-title">投資妙味スコア（暫定）</h2>
          <div className="table-actions">
            <div className="table-controls">
              <span className="investment-badge">ベース80 / 補正±20</span>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setInvestmentEditOpen((prev) => !prev)}
              >
                {investmentEditOpen ? "入力を閉じる" : "入力を編集"}
              </button>
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("investmentScore")}
              aria-expanded={openSections.investmentScore}
            >
              {openSections.investmentScore ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.investmentScore ? (
          <div className="investment-body">
            <div className="investment-summary">
              <div className="investment-total">
                <div className="investment-score">{investmentScore.totalScore}</div>
                <div className="investment-grade">Grade {investmentScore.grade}</div>
                <div className={`investment-decision decision-${investmentScore.decision.toLowerCase()}`}>
                  {investmentScore.decision}
                </div>
              </div>
              <div className="investment-metrics">
                <div className="investment-metric">
                  <span>ベース</span>
                  <strong>{investmentScore.base80}</strong>
                </div>
                <div className="investment-metric">
                  <span>現地補正</span>
                  <strong>{investmentScore.fieldAdjustment >= 0 ? "+" : ""}{investmentScore.fieldAdjustment}</strong>
                </div>
                <div className="investment-metric">
                  <span>信頼度</span>
                  <strong>{investmentScore.confidence}%</strong>
                </div>
              </div>
            </div>

            <div className="investment-breakdown">
              {investmentScore.breakdown.map((item) => (
                <div key={item.label} className="investment-row">
                  <div className="investment-row-head">
                    <span className="investment-row-title">{item.label}</span>
                    <span className={`investment-row-score${item.warning ? " is-warn" : ""}`}>
                      {item.score}/{item.max}
                    </span>
                  </div>
                  <p className="investment-row-note">{item.reason}</p>
                </div>
              ))}
            </div>

            {investmentEditOpen ? (
              <div className="investment-inputs form-card">
                <div className="investment-input-grid">
                  <label>
                    単身世帯トレンド
                    <select
                      value={investmentInput.demandTrend}
                      onChange={(e) =>
                        updateInvestmentInput(
                          "demandTrend",
                          e.target.value as InvestmentDemandTrend
                        )
                      }
                    >
                      <option value="UNKNOWN">未入力</option>
                      <option value="UP">増加</option>
                      <option value="FLAT">横ばい</option>
                      <option value="DOWN">減少</option>
                    </select>
                  </label>
                  <label>
                    ターゲット適合
                    <select
                      value={investmentInput.targetFit}
                      onChange={(e) =>
                        updateInvestmentInput(
                          "targetFit",
                          e.target.value as InvestmentTargetFit
                        )
                      }
                    >
                      <option value="UNKNOWN">未入力</option>
                      <option value="HIGH">高い</option>
                      <option value="MID">普通</option>
                      <option value="LOW">低い</option>
                    </select>
                  </label>
                  <label>
                    実歩行（分）
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={investmentInput.walkMinutes}
                      onChange={(e) =>
                        updateInvestmentInput(
                          "walkMinutes",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </label>
                  <label>
                    生活利便性
                    <select
                      value={investmentInput.convenience}
                      onChange={(e) =>
                        updateInvestmentInput(
                          "convenience",
                          e.target.value as InvestmentConvenience
                        )
                      }
                    >
                      <option value="UNKNOWN">未入力</option>
                      <option value="HIGH">高い</option>
                      <option value="MID">普通</option>
                      <option value="LOW">低い</option>
                    </select>
                  </label>
                  <label>
                    ハザード該当
                    <select
                      value={investmentInput.hazardRisk}
                      onChange={(e) =>
                        updateInvestmentInput(
                          "hazardRisk",
                          e.target.value as InvestmentHazardRisk
                        )
                      }
                    >
                      <option value="UNKNOWN">未確認</option>
                      <option value="NONE">該当なし</option>
                      <option value="LOW">注意</option>
                      <option value="HIGH">高リスク</option>
                    </select>
                  </label>
                  <label>
                    家賃ギャップ（%）
                    <input
                      type="number"
                      inputMode="decimal"
                      value={investmentInput.rentGapPercent}
                      onChange={(e) =>
                        updateInvestmentInput(
                          "rentGapPercent",
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                    />
                  </label>
                  <label>
                    募集過多レベル
                    <select
                      value={investmentInput.competitionLevel}
                      onChange={(e) =>
                        updateInvestmentInput(
                          "competitionLevel",
                          e.target.value as InvestmentCompetition
                        )
                      }
                    >
                      <option value="UNKNOWN">未入力</option>
                      <option value="LOW">少ない</option>
                      <option value="MID">普通</option>
                      <option value="HIGH">多い</option>
                    </select>
                  </label>
                  <label>
                    現地補正（±20）
                    <input
                      type="number"
                      inputMode="numeric"
                      min={-20}
                      max={20}
                      value={investmentInput.fieldAdjustment}
                      onChange={(e) =>
                        updateInvestmentInput("fieldAdjustment", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <div className="form-note">
                  ※無料範囲では手入力で補完します。Google系の自動取得は後付け想定。
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    ),
    cashflow: (
      <div className="sheet-card table-card">
        <div className="table-head">
          <h2 className="table-title">キャッシュフロー</h2>
          <div className="table-actions">
            <div className="table-controls">家賃収入と支払の年間収支</div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("cashflow")}
              aria-expanded={openSections.cashflow}
            >
              {openSections.cashflow ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.cashflow ? (
          <div className="table-scroll">
            {visibleResults.length === 0 ? (
              <div className="empty-state">入力を更新するとキャッシュフローが表示されます。</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="row-title">項目</th>
                    {visibleResults.map((result) => (
                      <th key={`cf-year-${result.year}`} className="year-cell">
                        {result.year}年
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="section-row">
                    <td colSpan={visibleResults.length + 1}>キャッシュフロー</td>
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("家賃収入")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-income-${result.year}`} className="cell highlight">
                        {formatCell(result.income)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("元本返済")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("借入利息")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">
                      {renderTableRowTitle("固定資産税・都市計画税")}
                    </td>
                    {visibleResults.map((result) => (
                      <td key={`cf-tax-${result.year}`} className="cell">
                        {formatCell(result.propertyTax, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("修繕費")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-repair-${result.year}`} className="cell">
                        {formatCell(result.repairCost, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("不動産取得税")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-acq-tax-${result.year}`} className="cell">
                        {formatCell(result.acquisitionTax, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("管理費等経費")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-expense-${result.year}`} className="cell">
                        {formatCell(result.expense, true)}
                      </td>
                    ))}
                  </tr>
                  {isCorporateTax ? (
                    <>
                      <tr>
                        <td className="row-title">{renderTableRowTitle("法人税(15/23%)")}</td>
                        {visibleResults.map((result) => (
                          <td key={`cf-corp-tax-${result.year}`} className="cell">
                            {formatCell(getCorporateTax(result), true)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-title">{renderTableRowTitle("法人均等割")}</td>
                        {visibleResults.map((result) => (
                          <td key={`cf-corp-min-${result.year}`} className="cell">
                            {formatCell(corporateMinimumTax, true)}
                          </td>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td className="row-title">{renderTableRowTitle("所得税")}</td>
                      {visibleResults.map((result) => (
                        <td key={`cf-income-tax-${result.year}`} className="cell">
                          {formatCell(result.taxAmount, true)}
                        </td>
                      ))}
                    </tr>
                  )}
                  {inputData.exitEnabled ? (
                    <tr>
                      <td className="row-title">{renderTableRowTitle("売却手残り")}</td>
                      {visibleResults.map((result) => (
                        <td key={`cf-exit-${result.year}`} className="cell highlight">
                          {formatCell(result.year === exitYear ? exitNetProceeds : 0)}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                  <tr className="row-highlight">
                    <td className="row-title">{renderTableRowTitle("支払計")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-total-${result.year}`} className="cell highlight">
                        {formatCell(
                          result.loanPrincipal +
                            result.loanInterest +
                            result.propertyTax +
                            result.repairCost +
                            result.acquisitionTax +
                            result.expense +
                            result.taxAmount,
                          true
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="row-highlight">
                    <td className="row-title">{renderTableRowTitle("年度収支")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-net-${result.year}`} className="cell highlight-strong">
                        {formatCell(result.cashFlowPostTax)}
                      </td>
                    ))}
                  </tr>
                  {inputData.exitEnabled ? (
                    <tr className="row-highlight">
                      <td className="row-title">
                        {renderTableRowTitle("売却込み年度収支")}
                      </td>
                      {visibleResults.map((result) => (
                        <td key={`cf-net-exit-${result.year}`} className="cell highlight-strong">
                          {formatCell(
                            result.cashFlowPostTax +
                              (result.year === exitYear ? exitNetProceeds : 0)
                          )}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>
    ),
    exit: (
      <div className="sheet-card exit-card">
        <div className="table-head">
          <h2 className="table-title">出口戦略（売却）</h2>
          <div className="table-actions">
            <div className="table-controls">
              {inputData.exitEnabled ? `売却想定: ${exitYear}年目` : "売却シミュレーションは無効"}
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("exit")}
              aria-expanded={openSections.exit}
            >
              {openSections.exit ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.exit ? (
          inputData.exitEnabled ? (
            <div className="exit-body">
              <div className="detail-grid exit-grid">
                <div className="detail-item">
                  <span className="detail-label">想定売却価格</span>
                  <span className="detail-value">{formatYen(exitSalePrice)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">売却手残り (ATCF)</span>
                  <span className="detail-value">{formatYen(exitNetProceeds)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">10年CF累計+売却手残り</span>
                  <span className="detail-value">{formatYen(kpiCashFlow10yWithExit)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">IRR</span>
                  <span className="detail-value">
                    {exitIrr !== null ? formatPercent(exitIrr * 100) : "-"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Equity Multiple</span>
                  <span className="detail-value">
                    {baseEquityMultiple !== null ? formatMultiple(baseEquityMultiple) : "-"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">NPV</span>
                  <span className="detail-value">
                    {exitNpv !== null ? formatYen(exitNpv) : "-"}
                  </span>
                </div>
              </div>
              <table className="breakdown-table exit-table">
                <tbody>
                  <tr>
                    <td className="label">売却年</td>
                    <td className="value calc">{exitYear}年目</td>
                  </tr>
                  <tr>
                    <td className="label">売却年NOI</td>
                    <td className="value calc">{formatYen(exitNoi)}</td>
                  </tr>
                  <tr>
                    <td className="label">キャップレート</td>
                    <td className="value calc">{formatPercent(inputData.exitCapRate)}</td>
                  </tr>
                  <tr>
                    <td className="label">仲介手数料</td>
                    <td className="value calc">{formatYen(exitBrokerage)}</td>
                  </tr>
                  <tr>
                    <td className="label">その他売却費用</td>
                    <td className="value calc">{formatYen(exitOtherCosts)}</td>
                  </tr>
                  <tr>
                    <td className="label">譲渡税</td>
                    <td className="value calc">{formatYen(exitTax)}</td>
                  </tr>
                  <tr>
                    <td className="label">ローン残債</td>
                    <td className="value calc">{formatYen(exitLoanBalance)}</td>
                  </tr>
                  <tr>
                    <td className="label">残存簿価</td>
                    <td className="value calc">{formatYen(remainingBasis)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="breakdown-foot">
                ※売却年のNOIをキャップレートで割り戻して価格を算出しています。
              </div>
            </div>
          ) : (
            <div className="empty-state">売却シミュレーションは無効です。</div>
          )
        ) : null}
      </div>
    ),
    scenario: (
      <div className="sheet-card scenario-card">
        <div className="table-head">
          <h2 className="table-title">リスクシナリオ比較</h2>
          <div className="table-actions">
            <div className="table-controls">
              {inputData.scenarioEnabled ? "ベース vs ストレス" : "シナリオ比較は無効"}
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("scenario")}
              aria-expanded={openSections.scenario}
            >
              {openSections.scenario ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.scenario ? (
          inputData.scenarioEnabled && stressSummary ? (
            <div className="scenario-body">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th className="label">指標</th>
                    <th className="value">ベース</th>
                    <th className="value">ストレス</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="label">最低キャッシュフロー</td>
                    <td className="value calc">
                      {formatYen(baseSummary.minCashFlow)}（{baseSummary.minCashFlowYear}年目）
                    </td>
                    <td className="value calc">
                      {formatYen(stressSummary.minCashFlow)}（{stressSummary.minCashFlowYear}年目）
                    </td>
                  </tr>
                  <tr>
                    <td className="label">最低DSCR</td>
                    <td className="value calc">
                      {Number.isFinite(baseSummary.minDscr) ? baseSummary.minDscr.toFixed(2) : "-"}
                    </td>
                    <td className="value calc">
                      {Number.isFinite(stressSummary.minDscr) ? stressSummary.minDscr.toFixed(2) : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">35年累計CF</td>
                    <td className="value calc">{formatYen(baseSummary.totalCashFlow)}</td>
                    <td className="value calc">{formatYen(stressSummary.totalCashFlow)}</td>
                  </tr>
                  {inputData.exitEnabled ? (
                    <tr>
                      <td className="label">IRR（売却込み）</td>
                      <td className="value calc">
                        {exitIrr !== null ? formatPercent(exitIrr * 100) : "-"}
                      </td>
                      <td className="value calc">
                        {stressExit && stressExit.irr !== null
                          ? formatPercent(stressExit.irr * 100)
                          : "-"}
                      </td>
                    </tr>
                  ) : null}
                  {inputData.exitEnabled ? (
                    <tr>
                      <td className="label">Equity Multiple</td>
                      <td className="value calc">
                        {baseEquityMultiple !== null ? formatMultiple(baseEquityMultiple) : "-"}
                      </td>
                      <td className="value calc">
                        {stressExit && stressExit.equityMultiple !== null
                          ? formatMultiple(stressExit.equityMultiple)
                          : "-"}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <div className="breakdown-foot">
                金利上昇: {inputData.scenarioInterestShockYear}年目 +
                {inputData.scenarioInterestShockDelta}% / 家賃下落:{" "}
                {inputData.scenarioRentDeclineEarlyRate}%→{inputData.scenarioRentDeclineLateRate}%
                （{inputData.scenarioRentDeclineSwitchYear}年目切替） / 入居率低下:{" "}
                {inputData.scenarioOccupancyDeclineStartYear}年目 -
                {inputData.scenarioOccupancyDeclineDelta}%
              </div>
            </div>
          ) : (
            <div className="empty-state">シナリオ比較を有効にしてください。</div>
          )
        ) : null}
      </div>
    ),
    simulation: (
      <div className="sheet-card table-card">
        <div className="table-head">
          <h2 className="table-title">年度別シミュレーション表 (1〜35年)</h2>
          <div className="table-actions">
            <div className="table-controls">クリックで年次を選択</div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("simulation")}
              aria-expanded={openSections.simulation}
            >
              {openSections.simulation ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.simulation ? (
          <div className="table-scroll">
            {visibleResults.length === 0 ? (
              <div className="empty-state">入力を更新すると表が生成されます。</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="row-title">項目</th>
                    {visibleResults.map((result) => (
                      <th
                        key={result.year}
                        className="year-cell"
                        data-selected={selectedYear === result.year}
                      >
                        <button
                          type="button"
                          className="year-button"
                          onClick={() => setSelectedYear(result.year)}
                        >
                          {result.year}年
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                {tableSections.map((section) => (
                  <tbody key={section.title}>
                    <tr className="section-row">
                      <td colSpan={visibleResults.length + 1}>{section.title}</td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.label} className={row.rowHighlight ? "row-highlight" : undefined}>
                        <td className="row-title">{renderTableRowTitle(row.label)}</td>
                        {visibleResults.map((result) => {
                          const value = row.value(result);
                          const classes = ["cell"];
                          if (row.tone) classes.push(row.tone);
                          if (row.outflow || value < 0) classes.push("negative");
                          return (
                            <td key={`${row.label}-${result.year}`} className={classes.join(" ")}>
                              {formatCell(value, row.outflow, row.format)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </div>
        ) : null}
      </div>
    ),
    repayment: (
      <div className="sheet-card table-card">
        <div className="table-head">
          <h2 className="table-title">元利均等返済方式による返済明細</h2>
          <div className="table-actions">
            <div className="table-meta">
              <span className="table-chip">借入額: {formatYen(inputData.loanAmount)}</span>
              <span className="table-chip">金利: {formatPercent(inputData.interestRate)}</span>
              <span className="table-chip">返済期間: {inputData.loanDuration}年</span>
              <span className="table-chip">総返済額: {formatYen(totalRepayment)}</span>
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("repayment")}
              aria-expanded={openSections.repayment}
            >
              {openSections.repayment ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.repayment ? (
          <div className="table-scroll">
            {visibleLoanResults.length === 0 ? (
              <div className="empty-state">借入条件を入力すると返済明細が表示されます。</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="row-title">年目</th>
                    {visibleLoanResults.map((result) => (
                      <th key={`loan-${result.year}`} className="year-cell">
                        {result.year}年
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="section-row">
                    <td colSpan={visibleLoanResults.length + 1}>月度</td>
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("元金")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("利息")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("月額返済計")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-total-${result.year}`} className="cell highlight">
                        {formatCell(result.loanPaymentTotal / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr className="section-row">
                    <td colSpan={visibleLoanResults.length + 1}>年度</td>
                  </tr>
                  <tr>
                    <td className="row-title">
                      {renderTableRowTitle("借入残高 (年末)")}
                    </td>
                    {visibleLoanResults.map((result) => (
                      <td key={`balance-${result.year}`} className="cell">
                        {formatCell(result.loanBalance)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("年間返済額")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-payment-${result.year}`} className="cell highlight">
                        {formatCell(result.loanPaymentTotal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("うち元金")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("うち利息")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest, true)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>
    ),
    charts: (
      <div className="chart-grid">
        <SimulationChart
          results={results}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          isOpen={openSections.chart}
          onToggle={() => toggleSection("chart")}
          deadCrossYear={firstDeadCrossYear}
          comparisonResults={stressResults ?? undefined}
        />

        <div className="detail-card">
          <div className="detail-header">
            <h3 className="detail-title">選択年のキャッシュフロー</h3>
            <div className="header-actions">
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {results.map((result) => (
                  <option key={result.year} value={result.year}>
                    {result.year}年目
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="section-toggle"
                onClick={() => toggleSection("detail")}
                aria-expanded={openSections.detail}
              >
                {openSections.detail ? "▼ 閉じる" : "▶ 開く"}
              </button>
            </div>
          </div>

          {openSections.detail ? (
            selectedResult ? (
              <>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">家賃収入</span>
                    <span className="detail-value">{formatYen(selectedResult.income)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">支出合計</span>
                    <span className="detail-value">
                      {formatYen(
                        selectedResult.expense +
                          selectedResult.loanPaymentTotal +
                          selectedResult.propertyTax +
                          selectedResult.repairCost +
                          selectedResult.acquisitionTax
                      )}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">固定資産税・都市計画税</span>
                    <span className="detail-value">{formatYen(selectedResult.propertyTax)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">修繕費</span>
                    <span className="detail-value">{formatYen(selectedResult.repairCost)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">不動産取得税</span>
                    <span className="detail-value">
                      {formatYen(selectedResult.acquisitionTax)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">減価償却</span>
                    <span className="detail-value">
                      {formatYen(selectedResult.depreciationTotal)}
                    </span>
                  </div>
                  {isCorporateTax ? (
                    <>
                      <div className="detail-item">
                        <span className="detail-label">法人税</span>
                        <span className="detail-value">
                          {formatYen(getCorporateTax(selectedResult))}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">法人均等割</span>
                        <span className="detail-value">
                          {formatYen(corporateMinimumTax)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="detail-item">
                      <span className="detail-label">税額</span>
                      <span className="detail-value">{formatYen(selectedResult.taxAmount)}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <span className="detail-label">税引後CF</span>
                    <span className="detail-value">{formatYen(selectedResult.cashFlowPostTax)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">借入残高</span>
                    <span className="detail-value">{formatYen(selectedResult.loanBalance)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">DSCR</span>
                    <span className="detail-value">
                      {selectedResult.loanPaymentTotal > 0
                        ? (
                            (selectedResult.income -
                              selectedResult.expense -
                              selectedResult.propertyTax -
                              selectedResult.repairCost) /
                            selectedResult.loanPaymentTotal
                          ).toFixed(2)
                        : "-"}
                    </span>
                  </div>
                </div>
                <div className="detail-footer">
                  {selectedResult.isDeadCross ? (
                    <span className="detail-flag">デッドクロス発生</span>
                  ) : (
                    <span className="detail-flag ok">デッドクロスなし</span>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">年次を選択してください。</div>
            )
          ) : null}
        </div>
      </div>
    ),
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <div className="title-icon">
            <Building2 size={22} />
          </div>
          <div>
            Pro Estate Simulator <span>ledger</span>
          </div>
        </div>
        <div className="header-right">
          <div className="app-note">減価償却・デッドクロス解析エンジン搭載</div>
          <div className="header-actions">
            <button
              type="button"
              className="history-button"
              onClick={() => setHistoryOpen((prev) => !prev)}
              aria-expanded={historyOpen}
              aria-controls="history-drawer"
              title="履歴"
            >
              <History size={20} aria-hidden />
            </button>
            <div className="save-menu" ref={saveMenuRef}>
              <button
                type="button"
                className="save-button"
                onClick={() => setSaveOpen((prev) => !prev)}
                aria-expanded={saveOpen}
                aria-controls="save-popover"
              >
                <Save size={20} aria-hidden />
              </button>
              {saveOpen ? (
                <div className="save-popover" id="save-popover">
                  <div className="account-popover-head">
                    <span className="account-popover-title">シミュレーション保存</span>
                    <span className="breakdown-pill">マイデータ</span>
                  </div>
                  <div className="save-body">
                    {user ? (
                      <>
                        <div className="save-row">
                          <input
                            type="text"
                            placeholder="保存名を入力"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                          />
                          <button
                            type="button"
                            className="section-toggle"
                            onClick={handleSave}
                            disabled={isSaving}
                          >
                            {isSaving ? "保存中..." : "保存"}
                          </button>
                        </div>
                        {savedItems.length === 0 ? (
                          <div className="form-note">保存済みデータはまだありません。</div>
                        ) : (
                          <div className="saved-list">
                            {savedItems.map((item) => (
                              <div key={item.id} className="saved-item">
                                <div>
                                  <div className="saved-name">{item.name}</div>
                                  <div className="saved-meta">
                                    {item.createdAt ? item.createdAt.toLocaleDateString() : ""}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="section-toggle"
                                  onClick={() => handleLoad(item)}
                                >
                                  読み込み
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="form-note">ログインすると保存と読み込みが使えます。</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="account-menu" ref={accountMenuRef}>
              <button
                type="button"
                className="account-button"
                onClick={() => setAccountOpen((prev) => !prev)}
                aria-expanded={accountOpen}
                aria-controls="account-popover"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="ユーザーアイコン" />
                ) : (
                  <UserCircle size={22} aria-hidden />
                )}
              </button>
              {accountOpen ? (
                <div className="account-popover" id="account-popover">
                  <div className="account-popover-head">
                    <span className="account-popover-title">アカウント</span>
                    <span className="breakdown-pill">Firebase</span>
                  </div>
                  <div className="account-body">
                    {user ? (
                      <div className="account-row">
                        <div>
                          <div className="account-name">{user.displayName ?? "ログイン中"}</div>
                          <div className="account-meta">{user.email ?? ""}</div>
                        </div>
                        <button type="button" className="section-toggle" onClick={handleLogout}>
                          ログアウト
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="section-toggle"
                          onClick={handleLogin}
                          disabled={!authReady}
                        >
                          Googleでログイン
                        </button>
                        <div className="form-note">
                          ログインすると保存と読み込みが使えます。
                        </div>
                      </>
                    )}
                    {authError ? <div className="auth-error">{authError}</div> : null}
                    <details className="auth-debug">
                      <summary>認証ログ</summary>
                      <pre>{authDebug.join("\n")}</pre>
                    </details>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <div className="app-main">
          <div className="step-bar">
            {[
              { id: 1, label: "URL入力" },
              { id: 2, label: "入力調整" },
              { id: 3, label: "結果を見る" },
            ].map((step) => (
              <div
                key={step.id}
                className={`step-item${currentStep === step.id ? " active" : ""}${
                  currentStep === step.id && (step.id === 3 || hasCompletedSteps)
                    ? " no-pulse"
                    : ""
                }`}
              >
                <span className="step-index">Step {step.id}</span>
                <span className="step-text">{step.label}</span>
              </div>
            ))}
          </div>

          <div className="step-head">
            <span className="step-pill">Step 1</span>
            <span className="step-title">URL入力</span>
          </div>
          <div
            className={`top-import step-zone${
              !hasCompletedSteps && currentStep === 1 ? " active" : ""
            }`}
          >
            <RakumachiImporter
              currentInput={inputData}
              onApply={handleImportApply}
              history={importHistory}
              selectedHistoryId={selectedImportId}
              onSelectHistory={handleImportSelect}
              onClearHistory={handleImportClear}
              onResultChange={handleImportResultChange}
              onStartAnalyze={handleImportStart}
              onCacheLookup={handleImportCacheLookup}
            />
          </div>

          {selectedImport?.listing ? (
            <>
              <div className="step-head">
                <span className="step-pill">Step 1.5</span>
                <span className="step-title">取得した物件情報</span>
              </div>
              <div className="listing-section step-zone">
                <ListingSummary
                  listing={selectedImport.listing}
                  listingUrl={
                    selectedImport.url && /^https?:/i.test(selectedImport.url)
                      ? selectedImport.url
                      : null
                  }
                />
              </div>
            </>
          ) : null}

          <div
            className={`input-section step-zone${
              !hasCompletedSteps && currentStep === 2 ? " active" : ""
            }`}
          >
            <div className="input-section-head">
              <span className="step-pill">Step 2</span>
              <span className="input-section-badge">ユーザー入力</span>
            </div>
            <div className="sheet-top">
              <SimulationForm
                key={formVersion}
                initialData={inputData}
                onCalculate={(data) => setInputData(data)}
                autoFilledKeys={autoFilledKeys}
                onFieldTouch={handleFieldTouch}
                listing={selectedImport?.listing ?? null}
              />
            </div>
          </div>

          <div className="input-section-head output-section-head">
            <span className="step-pill">Step 3</span>
            <span className="input-section-badge">シミュレーション結果</span>
          </div>
          <section className="sheet" ref={resultsRef}>
            <div className="sheet-grid">
              <div className="sheet-sidebar">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleReorder(event, setLeftOrder)}
                >
                  <SortableContext items={leftOrder} strategy={verticalListSortingStrategy}>
                    {leftOrder.map((id) => (
                      <SortableCard key={id} id={id}>
                        {leftPanels[id]}
                      </SortableCard>
                    ))}
                  </SortableContext>
                </DndContext>
              </div>

              <div className="sheet-main">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleReorder(event, setRightOrder)}
                >
                  <SortableContext items={rightOrder} strategy={verticalListSortingStrategy}>
                    {rightOrder.map((id) => (
                      <SortableCard key={id} id={id}>
                        {rightPanels[id]}
                      </SortableCard>
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          </section>

          <section className="sheet extra-info-section">
            <div className="sheet-card extra-info-card">
              <div className="table-head">
                <h2 className="table-title">物件の追加情報</h2>
                {rakumachiLandPriceUrl ? (
                  <a
                    className="extra-info-rakumachi-link"
                    href={rakumachiLandPriceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    楽待へのリンク
                  </a>
                ) : (
                  <span className="extra-info-rakumachi-link is-disabled">楽待へのリンク</span>
                )}
              </div>
              <div className="extra-info-grid">
                <div className="extra-info-top-row">
                  <div className="extra-info-score extra-info-score-side">
                    <div className="extra-info-score-main">
                      <div className={`extra-info-score-value ${additionalScoreToneClass}`}>
                        {additionalInfoScore.totalScore}
                      </div>
                      <div className="extra-info-score-meta">
                        <div className={`extra-info-score-grade ${additionalScoreToneClass}`}>
                          追加情報スコア / Grade {additionalInfoScore.grade}
                        </div>
                        <div className="extra-info-confidence">信頼度 {additionalInfoScore.confidence}%</div>
                      </div>
                      <div
                        className={`extra-info-decision decision-${additionalInfoScore.decision.toLowerCase()}`}
                      >
                        {additionalInfoScore.decision}
                      </div>
                    </div>
                    {additionalInfoScore.memoRiskFlags.length > 0 ? (
                      <div className="extra-info-risk-flags">
                        {additionalInfoScore.memoRiskFlags.map((flag) => (
                          <span key={flag}>{flag}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="extra-info-block extra-info-block-memo">
                    <div className="extra-info-title-row">
                      <div className="extra-info-title">メモ</div>
                    </div>
                    <textarea
                      className="extra-info-textarea"
                      placeholder="物件の所感や現地メモを入力"
                      value={extraInfo.memo}
                      onChange={(e) =>
                        setExtraInfo((prev) => ({ ...prev, memo: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="extra-info-scroll-note">
                  横にスクロールすると「失敗防止チェックリスト」「周辺家賃相場」「人口推移」「乗降客数」「周辺環境チェック」「空室率」「ハザードマップ」「基準地価」まで表示されます。
                </div>
                <div className="extra-info-scroll">
                  <div className="extra-info-row">
                <div className="extra-info-block extra-info-block-checklist">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">
                      <a
                        className="extra-info-title-link"
                        href="https://koharamasanori.com/real-estate-investment-failure-rate/#index_id13"
                        target="_blank"
                        rel="noreferrer"
                      >
                        失敗防止チェックリスト
                      </a>
                    </div>
                    <button
                      type="button"
                      className="chip-button"
                      onClick={() => setShowCompletedChecklist((prev) => !prev)}
                    >
                      {showCompletedChecklist ? "完了を隠す" : "完了を表示"}
                    </button>
                  </div>
                  <div className="extra-info-title-note">
                    確認済みをチェックすると、通常表示では項目が消えます。
                  </div>
                  <div className="extra-info-checklist-progress">
                    完了 {purchaseChecklistDoneCount} / {purchaseChecklistTotalCount}
                  </div>
                  <div className="extra-info-checklist">
                    {PURCHASE_CHECKLIST_SECTIONS.map((section) => {
                      const visibleItems = section.items.filter(
                        (item) => showCompletedChecklist || !extraInfo.purchaseChecklist[item.id]
                      );
                      if (visibleItems.length === 0) return null;
                      return (
                        <div key={section.id} className="extra-info-checklist-section">
                          <div className="extra-info-checklist-section-title">{section.title}</div>
                          <div className="extra-info-checklist-items">
                            {visibleItems.map((item) => {
                              const checked = !!extraInfo.purchaseChecklist[item.id];
                              return (
                                <label
                                  key={item.id}
                                  className={`extra-info-checklist-item${
                                    checked ? " is-done" : ""
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      updatePurchaseChecklist(item.id, event.target.checked)
                                    }
                                  />
                                  <span>{renderPurchaseChecklistLabel(item.label)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {!showCompletedChecklist &&
                    purchaseChecklistDoneCount >= purchaseChecklistTotalCount ? (
                      <div className="extra-info-checklist-empty">
                        すべて確認済みです。必要なら「完了を表示」で再確認できます。
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">楽街の近似売り物件の利回り</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.comparable?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.comparable)}`}
                    >
                      {additionalBreakdownByLabel.comparable?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.comparable?.score}/${additionalBreakdownByLabel.comparable?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.comparable?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.comparable.reason}</div>
                  ) : null}
                  <textarea
                    className="extra-info-textarea"
                    placeholder="ここにコピペしてください"
                    value={extraInfo.comparableText}
                    onChange={(e) =>
                      setExtraInfo((prev) => ({ ...prev, comparableText: e.target.value }))
                    }
                  />
                  {comparableSummary ? (
                    <div className="extra-info-summary">
                      <div><span>販売価格</span><strong>{comparableSummary.salePrice ?? "—"}</strong></div>
                      <div><span>表面利回り</span><strong>{comparableSummary.yield ?? "—"}</strong></div>
                      <div><span>想定年間収入</span><strong>{comparableSummary.annualIncome ?? "—"}</strong></div>
                      <div><span>所在地</span><strong>{comparableSummary.address ?? "—"}</strong></div>
                      <div><span>交通</span><strong>{comparableSummary.access ?? "—"}</strong></div>
                      <div><span>建物構造</span><strong>{comparableSummary.structure ?? "—"}</strong></div>
                      <div><span>築年月</span><strong>{comparableSummary.builtYear ?? "—"}</strong></div>
                      <div><span>土地権利</span><strong>{comparableSummary.landRight ?? "—"}</strong></div>
                      <div><span>建物面積</span><strong>{comparableSummary.buildingArea ?? "—"}</strong></div>
                      <div><span>土地面積</span><strong>{comparableSummary.landArea ?? "—"}</strong></div>
                      <div><span>取引態様</span><strong>{comparableSummary.transactionType ?? "—"}</strong></div>
                    </div>
                  ) : null}
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">人口推移</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.population?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.population)}`}
                    >
                      {additionalBreakdownByLabel.population?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.population?.score}/${additionalBreakdownByLabel.population?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.population?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.population.reason}</div>
                  ) : null}
                  <textarea
                    className="extra-info-textarea"
                    placeholder="人口推移データをコピペ"
                    value={extraInfo.populationText}
                    onChange={(e) =>
                      setExtraInfo((prev) => ({ ...prev, populationText: e.target.value }))
                    }
                  />
                  {populationSummary ? (
                    <div className="extra-info-summary">
                      <div>
                        <span>エリア</span>
                        <strong>{populationSummary.area ?? "—"}</strong>
                      </div>
                      <div>
                        <span>人口</span>
                        <strong>
                          {populationSummary.population ?? "—"}
                          {populationSummary.populationDelta ? (
                            <>
                              {" "}
                              {renderDelta(populationSummary.populationDelta, "%")}
                            </>
                          ) : null}
                        </strong>
                      </div>
                      <div>
                        <span>世帯数</span>
                        <strong>
                          {populationSummary.households ?? "—"}
                          {populationSummary.householdsDelta ? (
                            <>
                              {" "}
                              {renderDelta(populationSummary.householdsDelta, "%")}
                            </>
                          ) : null}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                  {populationSummary?.yearlyRows?.length ? (
                    <div className="extra-info-table">
                      <div className="extra-info-table-head">
                        <span>西暦</span>
                        <span>人口</span>
                        <span>世帯数</span>
                      </div>
                      {populationSummary.yearlyRows.map((row) => (
                        <div key={row.year} className="extra-info-table-row">
                          <span>{row.year}</span>
                          <span>
                            {row.population ?? "—"}
                            {row.populationDelta ? (
                              <>
                                {" "}
                                {renderDelta(row.populationDelta, "%")}
                              </>
                            ) : null}
                          </span>
                          <span>
                            {row.households ?? "—"}
                            {row.householdsDelta ? (
                              <>
                                {" "}
                                {renderDelta(row.householdsDelta, "%")}
                              </>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">周辺家賃相場（ポルティ査定）</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.rentMarket?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.rentMarket)}`}
                    >
                      {additionalBreakdownByLabel.rentMarket?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.rentMarket?.score}/${additionalBreakdownByLabel.rentMarket?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.rentMarket?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.rentMarket.reason}</div>
                  ) : null}
                  <div className="extra-info-title-note">
                    各階の査定値を入力してください（単位: 円/月）。
                  </div>
                  <div className="extra-info-rent-table">
                    <div className="extra-info-rent-head">
                      <span>階</span>
                      {PORTY_SIGMA_COLUMNS.map((column) => (
                        <span key={`rent-head-${column.key}`}>{column.label}</span>
                      ))}
                    </div>
                    {(Object.keys(PORTY_FLOOR_LABELS) as PortyFloorKey[]).map((floor) => (
                      <div key={`rent-row-${floor}`} className="extra-info-rent-row">
                        <span className="extra-info-rent-floor">{PORTY_FLOOR_LABELS[floor]}</span>
                        {PORTY_SIGMA_COLUMNS.map((column) => (
                          <input
                            key={`rent-input-${floor}-${column.key}`}
                            type="number"
                            inputMode="decimal"
                            className="field-input extra-info-rent-input"
                            value={extraInfo.portyRentByFloor[floor][column.key] ?? ""}
                            onChange={(event) =>
                              updatePortyRentByFloor(floor, column.key, event.target.value)
                            }
                            placeholder="例: 87000"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">乗降客数</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.ridership?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.ridership)}`}
                    >
                      {additionalBreakdownByLabel.ridership?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.ridership?.score}/${additionalBreakdownByLabel.ridership?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.ridership?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.ridership.reason}</div>
                  ) : null}
                  {areaStatsLookupError ? (
                    <div className="extra-info-location-error">{areaStatsLookupError}</div>
                  ) : null}
                  {areaStatsLookupNotice ? (
                    <div className="extra-info-location-note">{areaStatsLookupNotice}</div>
                  ) : null}
                  <textarea
                    className="extra-info-textarea"
                    placeholder={areaStatsLookupLoading ? "自動取得中..." : "最寄駅の乗降客数データを自動取得"}
                    value={extraInfo.ridershipText}
                    onChange={(e) =>
                      setExtraInfo((prev) => ({ ...prev, ridershipText: e.target.value }))
                    }
                  />
                  {ridershipSummary ? (
                    <div className="extra-info-summary">
                      <div>
                        <span>駅名</span>
                        <strong>{ridershipSummary.station ?? "—"}</strong>
                      </div>
                      <div>
                        <span>乗降客数</span>
                        <strong>
                          {ridershipSummary.ridership ?? "—"}
                          {ridershipSummary.delta ? (
                            <>
                              {" "}
                              {renderDelta(ridershipSummary.delta, "%")}
                            </>
                          ) : null}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                  {ridershipSummary?.yearlyRows?.length ? (
                    <div className="extra-info-table">
                      <div className="extra-info-table-head">
                        <span>西暦</span>
                        <span>乗降客数</span>
                      </div>
                      {ridershipSummary.yearlyRows.map((row) => (
                        <div key={row.year} className="extra-info-table-row">
                          <span>{row.year}</span>
                          <span>
                            {row.ridership ?? "—"}
                            {row.delta ? (
                              <>
                                {" "}
                                {renderDelta(row.delta, "%")}
                              </>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">周辺環境チェック</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.location?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.location)}`}
                    >
                      {additionalBreakdownByLabel.location?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.location?.score}/${additionalBreakdownByLabel.location?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.location?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.location.reason}</div>
                  ) : null}
                  <div className="extra-info-location-actions">
                    <input
                      type="text"
                      className="field-input extra-info-location-address"
                      placeholder="住所を入力（未入力なら解析済み住所を利用）"
                      value={extraInfo.locationChecklist.address}
                      onChange={(e) => {
                        const value = e.target.value;
                        setExtraInfo((prev) => ({
                          ...prev,
                          locationChecklist: {
                            ...prev.locationChecklist,
                            address: value,
                          },
                        }));
                      }}
                    />
                    <button
                      type="button"
                      className="chip-button"
                      onClick={handleFetchLocationChecklist}
                      disabled={locationLookupLoading}
                    >
                      {locationLookupLoading ? "取得中..." : "住所から自動取得"}
                    </button>
                  </div>
                  {locationLookupError ? (
                    <div className="extra-info-location-error">{locationLookupError}</div>
                  ) : null}
                  {extraInfo.locationChecklist.auto ? (
                    <div className="extra-info-summary">
                      <div>
                        <span>住所</span>
                        <strong>{extraInfo.locationChecklist.auto.normalizedAddress ?? "—"}</strong>
                      </div>
                      <details className="extra-info-summary-details">
                        <summary>
                          <span>最寄り駅</span>
                          <strong>
                            {extraInfo.locationChecklist.auto.station?.name ?? "—"}
                            {extraInfo.locationChecklist.auto.station?.line
                              ? ` (${formatStationLine(extraInfo.locationChecklist.auto.station?.line)})`
                              : ""}
                            {" / "}
                            {formatMinutes(extraInfo.locationChecklist.auto.station?.durationMinutes)} /{" "}
                            {formatDistance(extraInfo.locationChecklist.auto.station?.distanceMeters)}
                          </strong>
                        </summary>
                        <div className="extra-info-summary-detail-body">
                          {renderLocationOptionList(
                            "駅候補",
                            extraInfo.locationChecklist.auto.stationOptions,
                            true
                          )}
                        </div>
                      </details>
                      <details className="extra-info-summary-details">
                        <summary>
                          <span>最寄りバス停</span>
                          <strong>
                            {extraInfo.locationChecklist.auto.busStop?.name ?? "—"} /{" "}
                            {formatMinutes(extraInfo.locationChecklist.auto.busStop?.durationMinutes)} /{" "}
                            {formatDistance(extraInfo.locationChecklist.auto.busStop?.distanceMeters)}
                          </strong>
                        </summary>
                        <div className="extra-info-summary-detail-body">
                          {renderLocationOptionList(
                            "バス停候補",
                            extraInfo.locationChecklist.auto.busStopOptions
                          )}
                        </div>
                      </details>
                      <details className="extra-info-summary-details">
                        <summary>
                          <span>生活利便（徒歩）</span>
                          <strong>
                            コンビニ{" "}
                            {formatMinutes(extraInfo.locationChecklist.auto.convenienceStore?.durationMinutes)}
                            {" / "}
                            スーパー{" "}
                            {formatMinutes(extraInfo.locationChecklist.auto.supermarket?.durationMinutes)}
                          </strong>
                        </summary>
                        <div className="extra-info-summary-detail-body">
                          <div className="extra-info-summary-detail-item">
                            <span>最寄りコンビニ</span>
                            <strong>
                              {extraInfo.locationChecklist.auto.convenienceStore?.name ?? "—"} /{" "}
                              {formatMinutes(
                                extraInfo.locationChecklist.auto.convenienceStore?.durationMinutes
                              )}{" "}
                              /{" "}
                              {formatDistance(
                                extraInfo.locationChecklist.auto.convenienceStore?.distanceMeters
                              )}
                            </strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>最寄りスーパー</span>
                            <strong>
                              {extraInfo.locationChecklist.auto.supermarket?.name ?? "—"} /{" "}
                              {formatMinutes(
                                extraInfo.locationChecklist.auto.supermarket?.durationMinutes
                              )}{" "}
                              /{" "}
                              {formatDistance(
                                extraInfo.locationChecklist.auto.supermarket?.distanceMeters
                              )}
                            </strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>最寄り病院</span>
                            <strong>
                              {extraInfo.locationChecklist.auto.hospital?.name ?? "—"} /{" "}
                              {formatMinutes(extraInfo.locationChecklist.auto.hospital?.durationMinutes)} /{" "}
                              {formatDistance(extraInfo.locationChecklist.auto.hospital?.distanceMeters)}
                            </strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>最寄り薬局</span>
                            <strong>
                              {extraInfo.locationChecklist.auto.pharmacy?.name ?? "—"} /{" "}
                              {formatMinutes(extraInfo.locationChecklist.auto.pharmacy?.durationMinutes)} /{" "}
                              {formatDistance(extraInfo.locationChecklist.auto.pharmacy?.distanceMeters)}
                            </strong>
                          </div>
                          {renderLocationOptionList(
                            "コンビニ候補",
                            extraInfo.locationChecklist.auto.convenienceOptions
                          )}
                          {renderLocationOptionList(
                            "スーパー候補",
                            extraInfo.locationChecklist.auto.supermarketOptions
                          )}
                        </div>
                      </details>
                      <details className="extra-info-summary-details">
                        <summary>
                          <span>施設数(800m)</span>
                          <strong>
                            コンビニ {extraInfo.locationChecklist.auto.convenienceCount800m ?? "—"} / スーパー{" "}
                            {extraInfo.locationChecklist.auto.supermarketCount800m ?? "—"} / 病院{" "}
                            {extraInfo.locationChecklist.auto.hospitalCount800m ?? "—"} / 薬局{" "}
                            {extraInfo.locationChecklist.auto.pharmacyCount800m ?? "—"} / 学校{" "}
                            {extraInfo.locationChecklist.auto.schoolCount800m ?? "—"} / 公園{" "}
                            {extraInfo.locationChecklist.auto.parkCount800m ?? "—"}
                          </strong>
                        </summary>
                        <div className="extra-info-summary-detail-body">
                          <div className="extra-info-summary-detail-item">
                            <span>コンビニ</span>
                            <strong>{extraInfo.locationChecklist.auto.convenienceCount800m ?? "—"}件</strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>スーパー</span>
                            <strong>{extraInfo.locationChecklist.auto.supermarketCount800m ?? "—"}件</strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>病院</span>
                            <strong>{extraInfo.locationChecklist.auto.hospitalCount800m ?? "—"}件</strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>薬局</span>
                            <strong>{extraInfo.locationChecklist.auto.pharmacyCount800m ?? "—"}件</strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>学校</span>
                            <strong>{extraInfo.locationChecklist.auto.schoolCount800m ?? "—"}件</strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>公園</span>
                            <strong>{extraInfo.locationChecklist.auto.parkCount800m ?? "—"}件</strong>
                          </div>
                        </div>
                      </details>
                      <details className="extra-info-summary-details">
                        <summary>
                          <span>嫌悪施設(1500m)</span>
                          <strong>
                            墓地 {extraInfo.locationChecklist.auto.cemeteryCount1500m ?? "—"} / ゴミ処理{" "}
                            {extraInfo.locationChecklist.auto.wasteFacilityCount1500m ?? "—"} / 工場{" "}
                            {extraInfo.locationChecklist.auto.factoryCount1500m ?? "—"}
                          </strong>
                        </summary>
                        <div className="extra-info-summary-detail-body">
                          <div className="extra-info-summary-detail-item">
                            <span>墓地</span>
                            <strong>{extraInfo.locationChecklist.auto.cemeteryCount1500m ?? "—"}件</strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>ゴミ処理施設</span>
                            <strong>{extraInfo.locationChecklist.auto.wasteFacilityCount1500m ?? "—"}件</strong>
                          </div>
                          <div className="extra-info-summary-detail-item">
                            <span>工場</span>
                            <strong>{extraInfo.locationChecklist.auto.factoryCount1500m ?? "—"}件</strong>
                          </div>
                        </div>
                      </details>
                    </div>
                  ) : null}
                  <div className="extra-info-location-manual-list">
                    {(Object.keys(LOCATION_MANUAL_LABELS) as Array<keyof LocationManualChecks>).map((key) => (
                      <div key={key} className="extra-info-location-manual-item">
                        <span>{LOCATION_MANUAL_LABELS[key]}</span>
                        <select
                          className={`field-select extra-info-location-select ${getManualLevelToneClass(
                            extraInfo.locationChecklist.manual[key]
                          )}`}
                          value={extraInfo.locationChecklist.manual[key]}
                          onChange={(event) =>
                            updateLocationManual(key, event.target.value as LocationManualLevel)
                          }
                        >
                          {LOCATION_MANUAL_LEVEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">空室率</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.vacancy?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.vacancy)}`}
                    >
                      {additionalBreakdownByLabel.vacancy?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.vacancy?.score}/${additionalBreakdownByLabel.vacancy?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.vacancy?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.vacancy.reason}</div>
                  ) : null}
                  <textarea
                    className="extra-info-textarea"
                    placeholder="空室率データをコピペ"
                    value={extraInfo.vacancyText}
                    onChange={(e) =>
                      setExtraInfo((prev) => ({ ...prev, vacancyText: e.target.value }))
                    }
                  />
                  {vacancySummary ? (
                    <div className="extra-info-summary">
                      <div>
                        <span>空室率</span>
                        <strong>
                          {vacancySummary.rate ? `${vacancySummary.rate}%` : "—"}
                          {vacancySummary.delta ? (
                            <>
                              {" "}
                              {renderDelta(vacancySummary.delta, "pt")}
                            </>
                          ) : null}
                        </strong>
                      </div>
                      <div>
                        <span>空家/借家</span>
                        <strong>
                          {vacancySummary.emptyUnits ?? "—"} / {vacancySummary.rentalUnits ?? "—"}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                  {vacancySummary?.yearlyRows?.length ? (
                    <div className="extra-info-table">
                      <div className="extra-info-table-head">
                        <span>西暦</span>
                        <span>空室率</span>
                        <span>空家/借家</span>
                      </div>
                      {vacancySummary.yearlyRows.map((row) => (
                        <div key={row.year} className="extra-info-table-row">
                          <span>{row.year}</span>
                          <span>
                            {row.rate ? `${row.rate}%` : "—"}
                            {row.delta ? (
                              <>
                                {" "}
                                {renderDelta(row.delta, "pt")}
                              </>
                            ) : null}
                          </span>
                          <span>
                            {row.emptyUnits ?? "—"} / {row.rentalUnits ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">ハザードマップ</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.hazard?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.hazard)}`}
                    >
                      {additionalBreakdownByLabel.hazard?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.hazard?.score}/${additionalBreakdownByLabel.hazard?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.hazard?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.hazard.reason}</div>
                  ) : null}
                  <div className="extra-info-hazard-list">
                    {(["flood", "collapse", "debrisFlow", "landslide"] as HazardTypeKey[]).map((key) => {
                      const selection = extraInfo.hazard[key];
                      const options = key === "flood" ? FLOOD_SEVERITY_OPTIONS : SEDIMENT_SEVERITY_OPTIONS;
                      return (
                        <div key={key} className="extra-info-hazard-item">
                          <label className="extra-info-hazard-check">
                            <input
                              type="checkbox"
                              checked={selection.enabled}
                              onChange={(event) => setHazardEnabled(key, event.target.checked)}
                            />
                            <span>{HAZARD_TYPE_LABELS[key]}</span>
                          </label>
                          <select
                            className="field-select extra-info-hazard-select"
                            value={selection.severity}
                            onChange={(event) => setHazardSeverity(key, event.target.value)}
                            disabled={!selection.enabled}
                          >
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="extra-info-block">
                  <div className="extra-info-title-row">
                    <div className="extra-info-title">基準地価</div>
                    <span
                      className={`extra-info-title-score${
                        additionalBreakdownByLabel.landPrice?.warning ? " is-warn" : ""
                      } ${getAdditionalItemScoreToneClass(additionalBreakdownByLabel.landPrice)}`}
                    >
                      {additionalBreakdownByLabel.landPrice?.score === null
                        ? "N/A"
                        : `${additionalBreakdownByLabel.landPrice?.score}/${additionalBreakdownByLabel.landPrice?.max}`}
                    </span>
                  </div>
                  {additionalBreakdownByLabel.landPrice?.reason ? (
                    <div className="extra-info-title-note">{additionalBreakdownByLabel.landPrice.reason}</div>
                  ) : null}
                  <textarea
                    className="extra-info-textarea"
                    placeholder="基準地価データをコピペ"
                    value={extraInfo.landPriceText}
                    onChange={(e) =>
                      setExtraInfo((prev) => ({ ...prev, landPriceText: e.target.value }))
                    }
                  />
                  {landPriceSummary ? (
                    <div className="extra-info-summary">
                      <div><span>所在地</span><strong>{landPriceSummary.address ?? "—"}</strong></div>
                      <div>
                        <span>公示地価</span>
                        <strong>
                          {landPriceSummary.official?.price ?? "—"}
                          {landPriceSummary.official?.delta ? (
                            <>
                              {" "}
                              {renderDelta(landPriceSummary.official.delta, "%")}
                            </>
                          ) : null}
                        </strong>
                      </div>
                      <div>
                        <span>基準地価</span>
                        <strong>
                          {landPriceSummary.benchmark?.price ?? "—"}
                          {landPriceSummary.benchmark?.delta ? (
                            <>
                              {" "}
                              {renderDelta(landPriceSummary.benchmark.delta, "%")}
                            </>
                          ) : null}
                        </strong>
                      </div>
                      <div>
                        <span>地積</span>
                        <strong>{landPriceSummary.official?.area ?? landPriceSummary.benchmark?.area ?? "—"}</strong>
                      </div>
                      <div>
                        <span>建ぺい/容積</span>
                        <strong>
                          {landPriceSummary.official?.ratio ?? landPriceSummary.benchmark?.ratio ?? "—"}
                        </strong>
                      </div>
                      <div>
                        <span>用途地域</span>
                        <strong>
                          {landPriceSummary.official?.zone ?? landPriceSummary.benchmark?.zone ?? "—"}
                        </strong>
                      </div>
                      <div>
                        <span>都市計画区分</span>
                        <strong>
                          {landPriceSummary.official?.planning ??
                            landPriceSummary.benchmark?.planning ??
                            "—"}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                  {landPriceSummary?.yearlyRows?.length ? (
                    <div className="extra-info-table">
                      <div className="extra-info-table-head">
                        <span>西暦</span>
                        <span>公示地価</span>
                        <span>基準地価</span>
                      </div>
                      {landPriceSummary.yearlyRows.map((row) => (
                        <div key={row.year} className="extra-info-table-row">
                          <span>{row.year}</span>
                          <span>
                            {row.official ?? "—"}
                            {row.officialDelta ? (
                              <>
                                {" "}
                                {renderDelta(row.officialDelta, "%")}
                              </>
                            ) : null}
                          </span>
                          <span>
                            {row.benchmark ?? "—"}
                            {row.benchmarkDelta ? (
                              <>
                                {" "}
                                {renderDelta(row.benchmarkDelta, "%")}
                              </>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="app-aside" aria-label="AIチャット">
          <div className={`ai-panel${aiCollapsed ? " is-collapsed" : ""}`}>
            <div className="ai-head">
              <h3 className="table-title">AIチャット</h3>
              <div className="ai-head-actions">
                {aiCacheHit ? <span className="ai-cache-hit">キャッシュ</span> : null}
                {aiLoading ? <span className="ai-status">生成中...</span> : null}
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => setAiCollapsed((prev) => !prev)}
                  aria-expanded={!aiCollapsed}
                >
                  {aiCollapsed ? "▶ 開く" : "▼ 閉じる"}
                </button>
              </div>
            </div>
            {!aiCollapsed ? (
              <>
                <div className="ai-messages" ref={aiMessagesRef}>
                  {aiMessages.length === 0 && !aiLoading ? (
                    <div className="form-note">
                      質問を入力してください。Step4到達後の結果を含めて回答します。
                    </div>
                  ) : null}
                  {aiMessages.map((message, index) =>
                    message.role === "user" ? (
                      <div key={`user-${index}`} className="ai-message user">
                        {message.content}
                      </div>
                    ) : (
                      <div key={`assistant-${index}`} className="ai-response">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )
                  )}
                  {aiLoading ? (
                    <div className="ai-typing" role="status" aria-live="polite">
                      <span>AIが考えています</span>
                      <span className="ai-typing-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  ) : null}
                </div>
                {aiError ? <div className="auth-error">{aiError}</div> : null}
                <form className="ai-input-row" onSubmit={handleAskAi}>
                  <input
                    type="text"
                    placeholder="AIに質問する"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    disabled={aiLoading}
                  />
                  <button type="submit" className="section-toggle" disabled={aiLoading}>
                    送信
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </aside>

        {historyOpen ? (
          <button
            type="button"
            className="history-backdrop"
            onClick={() => setHistoryOpen(false)}
            aria-label="履歴を閉じる"
          />
        ) : null}
        <aside
          id="history-drawer"
          className={`history-drawer${historyOpen ? " is-open" : ""}`}
          aria-hidden={!historyOpen}
        >
          <div className="history-drawer-head">
            <div>
              <div className="history-title">検索履歴</div>
              <div className="history-subtitle">ログイン中の解析結果</div>
            </div>
            <button type="button" className="section-toggle" onClick={() => setHistoryOpen(false)}>
              ▼ 閉じる
            </button>
          </div>
          {user ? (
            <>
              <div className="history-search">
                <input
                  type="search"
                  placeholder="物件名・URLで検索"
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                />
                <span className="history-count">{displayHistory.length}件</span>
              </div>
              <div className="history-toggle">
                <button
                  type="button"
                  className={`history-toggle-btn${historyView === "latest" ? " active" : ""}`}
                  onClick={() => setHistoryView("latest")}
                >
                  最新のみ
                </button>
                <button
                  type="button"
                  className={`history-toggle-btn${historyView === "all" ? " active" : ""}`}
                  onClick={() => setHistoryView("all")}
                >
                  すべて
                </button>
              </div>
              {historyError ? <div className="auth-error">{historyError}</div> : null}
              {displayHistory.length === 0 ? (
                <div className="form-note">履歴がまだありません。</div>
              ) : (
                <div className="history-list">
                  {displayHistory.map((run) => {
                    const label =
                      run.listing?.title ??
                      run.listing?.propertyName ??
                      run.listing?.propertyType ??
                      "物件";
                    const isImage = run.url.startsWith("image:");
                    const dateLabel = run.updatedAt ?? run.createdAt;
                    return (
                      <button
                        key={run.id}
                        type="button"
                        className="history-item"
                        onClick={() => handleAnalysisRunSelect(run)}
                      >
                        <div className="history-item-head">
                          <span className={`history-tag${isImage ? " image" : ""}`}>
                            {isImage ? "画像" : "URL"}
                          </span>
                          <span className="history-item-title">{label}</span>
                        </div>
                        {run.listing?.address ? (
                          <div className="history-item-meta">{run.listing.address}</div>
                        ) : (
                          <div className="history-item-meta">
                            {isImage ? "画像解析" : run.url}
                          </div>
                        )}
                        <div className="history-item-foot">
                          {dateLabel ? dateLabel.toLocaleDateString() : "日付不明"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="form-note">ログインすると履歴が表示されます。</div>
          )}
        </aside>
      </div>
    </main>
  );
}
