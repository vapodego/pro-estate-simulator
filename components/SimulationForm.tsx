"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  PropertyInput,
  StructureType,
  LEGAL_USEFUL_LIFE,
  OerRateItem,
  OerFixedItem,
  OerEventItem,
} from "../utils/types";
import { getSuggestedBuildingRatio } from "../utils/estimates";

// 構造の選択肢定義
const STRUCTURE_OPTIONS: { label: string; value: StructureType }[] = [
  { label: "RC (鉄筋コンクリート)", value: "RC" },
  { label: "SRC (鉄骨鉄筋コンクリート)", value: "SRC" },
  { label: "重量鉄骨 (厚)", value: "S_HEAVY" },
  { label: "軽量鉄骨 (薄)", value: "S_LIGHT" },
  { label: "木造", value: "WOOD" },
];

type OerPropertyType = "UNIT" | "WOOD_APARTMENT" | "STEEL_APARTMENT" | "RC_APARTMENT";
type OerAgeBand = "NEW" | "MID" | "OLD";

const OER_PROPERTY_OPTIONS: { label: string; value: OerPropertyType }[] = [
  { label: "区分マンション", value: "UNIT" },
  { label: "一棟アパート(木造)", value: "WOOD_APARTMENT" },
  { label: "一棟アパート(鉄骨)", value: "STEEL_APARTMENT" },
  { label: "一棟マンション(RC)", value: "RC_APARTMENT" },
];

const OER_AGE_BANDS: { label: string; value: OerAgeBand; maxAge: number }[] = [
  { label: "築浅(〜10年)", value: "NEW", maxAge: 10 },
  { label: "築10〜20年", value: "MID", maxAge: 20 },
  { label: "築20年以上", value: "OLD", maxAge: Number.POSITIVE_INFINITY },
];

const OER_TEMPLATES: Record<OerPropertyType, Record<OerAgeBand, { exclTax: number; inclTax: number }>> = {
  UNIT: {
    NEW: { exclTax: 16, inclTax: 24 },
    MID: { exclTax: 18, inclTax: 28 },
    OLD: { exclTax: 22, inclTax: 32 },
  },
  WOOD_APARTMENT: {
    NEW: { exclTax: 11, inclTax: 15 },
    MID: { exclTax: 16, inclTax: 21 },
    OLD: { exclTax: 24, inclTax: 29 },
  },
  STEEL_APARTMENT: {
    NEW: { exclTax: 14, inclTax: 19 },
    MID: { exclTax: 20, inclTax: 26 },
    OLD: { exclTax: 26, inclTax: 32 },
  },
  RC_APARTMENT: {
    NEW: { exclTax: 15, inclTax: 20 },
    MID: { exclTax: 21, inclTax: 26 },
    OLD: { exclTax: 29, inclTax: 34 },
  },
};

const OER_AD_BONUS = 5;
const OER_REPAIR_BONUS = 5;
const OER_BUFFER_BONUS = 5;
const OER_REPAIR_RATE: Record<OerAgeBand, number> = {
  NEW: 2,
  MID: 4,
  OLD: 6,
};
const OER_UNIT_MGMT_RATE: Record<OerAgeBand, number> = {
  NEW: 12,
  MID: 14,
  OLD: 18,
};
const OER_INSURANCE_RATE: Record<OerPropertyType, number> = {
  UNIT: 1.0,
  WOOD_APARTMENT: 1.5,
  STEEL_APARTMENT: 1.2,
  RC_APARTMENT: 1.0,
};
const OER_LEASING_DEFAULTS: Record<OerAgeBand, { months: number; tenancyYears: number }> = {
  NEW: { months: 1.0, tenancyYears: 3 },
  MID: { months: 1.5, tenancyYears: 2.5 },
  OLD: { months: 2.0, tenancyYears: 2 },
};

type InputHelp = {
  title: string;
  body: string;
  note?: string;
};

const DEFAULT_INPUT_HELP = "シミュレーションに使う入力項目です。";

const INPUT_HELP: Record<string, InputHelp> = {
  price: {
    title: "物件価格（建物＋土地／万円）",
    body:
      "説明：購入価格の合計（建物＋土地）です。\n結果への影響：借入額・返済額・購入時諸費用・税金（評価）の基準になります。\nコツ：税込/税抜や付帯工事費の扱いは、売買契約書の記載に合わせてください。",
  },
  buildingRatio: {
    title: "建物比率（%）",
    body:
      "説明：物件価格のうち「建物部分」の割合です。\n結果への影響：減価償却（節税効果）や固定資産税評価の分解に影響します。\nコツ：不明な場合は売買契約書の内訳、または固定資産評価証明の比率を参考に。",
  },
  structure: {
    title: "構造",
    body:
      "説明：木造・鉄骨・RCなどの構造種別です。\n結果への影響：融資期間の出やすさ、修繕費の傾向、耐用年数（償却）に影響します。\nコツ：登記簿（建物）や重要事項説明書に記載の構造で入力します。",
  },
  buildingAge: {
    title: "築年数（年）",
    body:
      "説明：建築からの経過年数です。\n結果への影響：融資期間、修繕費、空室リスク、家賃下落の前提に影響します。\nコツ：新築は0年、築浅でも大規模修繕履歴があれば別途「修繕イベント」で反映できます。",
  },
  loanAmount: {
    title: "借入金額（万円）",
    body:
      "説明：ローンで借りる金額（元本）です。\n結果への影響：返済額とキャッシュフロー（CF）に直結します。\nコツ：「物件価格−頭金」だけでなく、諸費用を借りる場合はその分も加えます。",
  },
  equityRatio: {
    title: "自己資金（%）",
    body:
      "説明：購入時に自己資金で負担する割合です。\n結果への影響：借入額と返済額、自己資金効率（CCR）に影響します。\nコツ：金融機関の条件に合わせて入力し、不明な場合は5〜10%で試算すると安全です。",
  },
  interestRate: {
    title: "金利（%）",
    body:
      "説明：ローンの年利です。\n結果への影響：返済額が増減し、CFとDSCR（返済余裕）が大きく変わります。\nコツ：変動/固定の想定に合わせ、保守的に少し高めで試算するのがおすすめです。",
  },
  loanDuration: {
    title: "期間（年）",
    body:
      "説明：ローン返済期間です。\n結果への影響：期間が長いほど月返済が軽くなり、CFが出やすくなります。\nコツ：築古は短くなることが多いので、金融機関の提示条件で入力してください。",
  },
  monthlyRent: {
    title: "月額賃料（満室想定／万円）",
    body:
      "説明：満室のときの月間家賃収入（共益費を含めるかは運用に合わせて）です。\n結果への影響：収入の基礎となり、NOI・CFが比例して変動します。\nコツ：レントロール（賃貸条件一覧）をベースに。保守的に見たい場合は満室賃料を少し下げます。",
  },
  rentDeclineRate: {
    title: "家賃下落率（2年ごと／%）",
    body:
      "説明：時間経過で家賃が下がる前提（2年ごとに何%下がるか）です。\n結果への影響：将来の収入が低下し、長期のCFや出口（売却想定）に影響します。\nコツ：築浅は小さめ、競合供給が多いエリアはやや大きめに置くと安全です。",
  },
  occupancyRate: {
    title: "入居率（%）",
    body:
      "説明：満室賃料に掛ける稼働率です（例：95%）。\n結果への影響：賃料収入が比例して変動し、CFに直結します。\nコツ：新築でも常に100%ではない前提で、95〜98%などで試算すると現実的です。",
  },
  unitCount: {
    title: "戸数",
    body:
      "説明：住戸（部屋）の数です。\n結果への影響：清掃・修繕・募集費などの発生頻度の推定に影響します。\nコツ：戸数が多いほど費用が一定程度増える想定になります。",
  },
  cleaningVisitsPerMonth: {
    title: "清掃回数／月",
    body:
      "説明：共用部清掃の頻度です。\n結果への影響：清掃費が増減し、NOI・CFに影響します。\nコツ：管理仕様（週1・隔週など）に合わせて設定してください。",
  },
  operatingExpenseRate: {
    title: "運営経費率（%）",
    body:
      "説明：家賃収入に対する運営費の割合です。\n結果への影響：NOI＝収入−運営費なので、CFに直結します。\nコツ：管理費・税・保険・清掃・修繕を含む前提で入力します。",
  },
  oerMode: {
    title: "入力方式（簡易／内訳）",
    body:
      "説明：運営費を「合計率で入力」するか「項目ごとに入力」するかを選びます。\n結果への影響：内訳入力の方が精度が上がり、費用の偏り（修繕など）を表現しやすくなります。\nコツ：最初は簡易→慣れたら内訳がおすすめです。",
  },
  oerPropertyType: {
    title: "運営経費テンプレ",
    body:
      "説明：物件タイプ別の一般的な運営費モデルを自動入力します。\n結果への影響：運営費の初期値が変わり、NOI・CFが変わります。\nコツ：実績値がある場合は、テンプレ適用後に上書きしてください。",
  },
  oerAgeBand: {
    title: "築年数帯",
    body:
      "説明：築年数に応じた運営費（修繕・募集費等）の想定レンジです。\n結果への影響：運営費率や修繕の見積もりが変化します。\nコツ：実際の築年に近い帯を選ぶと精度が上がります。",
  },
  oerRateItemLabel: { title: "費目名", body: "率で計算する費目の名称。" },
  oerRateItemRate: { title: "率", body: "家賃に対する割合（%）。" },
  oerRateItemBase: { title: "基準", body: "満室(GPR)か稼働後(EGI)を選びます。" },
  oerRateItemEnabled: { title: "有効", body: "この費目を合算に含めます。" },
  oerFixedItemLabel: { title: "固定費名", body: "年額の固定費項目。" },
  oerFixedItemAmount: { title: "年額", body: "万円/年で入力します。" },
  oerFixedItemEnabled: { title: "有効", body: "この費目を合算に含めます。" },
  oerEventItemLabel: { title: "イベント名", body: "周期イベントの名称。" },
  oerEventItemAmount: { title: "金額", body: "イベント金額（万円）。" },
  oerEventItemInterval: { title: "周期", body: "何年ごとに発生するか。" },
  oerEventItemMode: { title: "方式", body: "平準化か発生年計上を選択。" },
  oerEventItemEnabled: { title: "有効", body: "この費目を合算に含めます。" },
  oerLeasingMonths: {
    title: "費用（月数）",
    body:
      "仲介+ADの合計月数です。入替頻度が高いほど費用が効きます。競争が強いエリアは多め、築浅・駅近は控えめが目安。",
  },
  oerLeasingTenancyYears: {
    title: "平均居住年数",
    body:
      "リーシング費を年換算するための平均居住年数です。長いほど年換算コストは下がります。",
  },
  waterContributionRate: {
    title: "水道分担金率（%）",
    body:
      "説明：水道加入金・分担金など、購入時に発生する費用の見積もりです。\n結果への影響：初期費用（自己資金）を押し上げます。\nコツ：新築・開発案件で発生しやすいので、資料があれば実額で確認を推奨。",
  },
  fireInsuranceRate: {
    title: "火災保険率（%）",
    body:
      "説明：火災保険（必要に応じて地震保険含む）の費用見積もりです。\n結果への影響：初期費用、または運営費（扱いは設定に依存）に影響します。\nコツ：見積もりがある場合はそれを優先してください。",
  },
  registrationCostRate: {
    title: "登記費用率（%）",
    body:
      "説明：登記関連（登録免許税・司法書士報酬等）の見積もりです。\n結果への影響：購入時の初期費用を増やします。\nコツ：物件価格に比例しやすいので、概算率での入力が有効です。",
  },
  loanFeeRate: {
    title: "融資手数料率（%）",
    body:
      "説明：融資事務手数料（定率型）の見積もりです。\n結果への影響：初期費用（自己資金）を増やします。\nコツ：定額型（例：33万円等）の場合は、別項目（その他）で調整します。",
  },
  miscCostRate: {
    title: "その他諸費用率（%）",
    body:
      "説明：上記以外の購入諸費用（印紙、調査費、細目費用など）のまとめ枠です。\n結果への影響：初期費用（自己資金）を増やします。\nコツ：仲介手数料が別計上でない場合、ここに含める運用も可能です。",
  },
  acquisitionTaxRate: {
    title: "不動産取得税率（%）",
    body:
      "説明：購入後に課税される不動産取得税の見積もりです。\n結果への影響：初期費用（後払いの税負担）を増やします。\nコツ：課税標準は時価ではなく評価額ベースなので、概算→確定後に実額反映が安全です。",
  },
  acquisitionLandReductionRate: {
    title: "土地評価圧縮率（%）",
    body:
      "説明：土地の評価額を、時価よりどれだけ低く見積もるかの調整です。\n結果への影響：固定資産税（および取得税の一部前提）が変わり、年間CFに影響します。\nコツ：実際の固定資産評価額が分かる場合は、圧縮ではなく評価率側で合わせるのがおすすめです。",
  },
  landEvaluationRate: {
    title: "土地評価率（%）",
    body:
      "説明：土地の固定資産税評価額が、土地価格（または土地部分）に対して何%かの仮定です。\n結果への影響：固定資産税・都市計画税が増減し、CFに影響します。\nコツ：自治体の評価額（課税明細）に合わせると精度が上がります。",
  },
  buildingEvaluationRate: {
    title: "建物評価率（%）",
    body:
      "説明：建物の固定資産税評価額が、建物価格に対して何%かの仮定です。\n結果への影響：固定資産税・都市計画税が増減し、CFに影響します。\nコツ：新築は評価が高めに出ることがあります。",
  },
  landTaxReductionRate: {
    title: "住宅用地特例（%）",
    body:
      "説明：住宅用地に適用される課税標準の軽減（例：1/6など）を反映します。\n結果への影響：土地にかかる固定資産税が下がり、CFが改善します。\nコツ：敷地面積・戸数・用途で適用が変わるため、分かる場合は実際の特例を反映してください。",
  },
  propertyTaxRate: {
    title: "固定資産税・都市計画税率（%）",
    body:
      "説明：固定資産税と都市計画税を合算した実効税率です。\n結果への影響：毎年の固定費としてNOIを下げ、CFに影響します。\nコツ：物件所在地の税率・課税実績が分かる場合は実額に合わせるのが最も正確です。",
  },
  vacancyModel: {
    title: "空室モデル",
    body:
      "説明：空室（入居率低下）をどのように収入に反映するかの方式です。\n結果への影響：実効賃料収入が減り、NOI・CFが変動します。\nコツ：長期保有なら「入居率を保守的に」置くと安全です。",
  },
  vacancyCycleYears: { title: "空室周期", body: "何年ごとに空室が発生するか。" },
  vacancyCycleMonths: { title: "空室月数", body: "空室が続く月数。" },
  vacancyProbability: { title: "年間空室確率", body: "年ごとの空室発生確率。" },
  vacancyProbabilityMonths: { title: "空室月数", body: "確率モデルの空室月数。" },
  repairEvents: {
    title: "修繕イベント",
    body:
      "説明：給湯器更新・外壁防水など、年次で発生する大きな修繕を登録します。\n結果への影響：特定年のCFが落ちる“谷”を可視化できます。\nコツ：複数棟運用ではイベント登録があると資金繰りが読みやすくなります。",
  },
  repairEventYear: { title: "年", body: "発生する年。" },
  repairEventAmount: { title: "金額", body: "修繕費（万円）。" },
  repairEventLabel: { title: "内容", body: "修繕内容のメモ。" },
  scenarioEnabled: {
    title: "有効にする",
    body:
      "説明：金利上昇・家賃下落・入居率悪化などのストレス条件を適用して比較します。\n結果への影響：CFの下振れ幅が見えるため、投資判断の安全性が上がります。\nコツ：購入判断前は「有効」にして耐性を確認するのがおすすめです。",
  },
  scenarioInterestShockYear: { title: "金利上昇年", body: "金利が上昇する年。" },
  scenarioInterestShockDelta: { title: "金利上昇幅", body: "上昇する金利幅（%）。" },
  scenarioRentCurveEnabled: { title: "家賃下落カーブ", body: "段階的な下落を有効化。" },
  scenarioRentDeclineEarlyRate: { title: "初期下落率", body: "前半の下落率（2年ごと/%）。" },
  scenarioRentDeclineLateRate: { title: "後半下落率", body: "後半の下落率（2年ごと/%）。" },
  scenarioRentDeclineSwitchYear: { title: "切替年", body: "下落率を切り替える年。" },
  scenarioOccupancyDeclineEnabled: { title: "入居率悪化", body: "入居率悪化のシナリオを有効化。" },
  scenarioOccupancyDeclineStartYear: { title: "悪化開始年", body: "悪化が始まる年。" },
  scenarioOccupancyDeclineDelta: { title: "入居率低下幅", body: "低下させる幅（%）。" },
  enableEquipmentSplit: { title: "設備分離", body: "設備として短期償却する設定。" },
  equipmentRatio: { title: "設備比率", body: "建物価格のうち設備に割り当てる割合。" },
  equipmentUsefulLife: { title: "設備耐用年数", body: "設備の耐用年数（年）。" },
  taxType: { title: "税務モード", body: "個人か法人かを選択します。" },
  taxTypeIndividual: { title: "個人", body: "累進課税＋住民税で計算。" },
  taxTypeCorporate: { title: "法人", body: "実効税率＋均等割で計算。" },
  otherIncome: { title: "他所得", body: "給与など他の所得（万円）。" },
  corporateMinimumTax: { title: "法人均等割", body: "赤字でもかかる年額固定税。" },
  exitEnabled: { title: "売却シミュレーション", body: "出口戦略を有効化します。" },
  exitYear: { title: "売却年数", body: "売却する年数。" },
  exitCapRate: { title: "キャップレート", body: "売却利回りの想定値（%）。" },
  exitBrokerageRate: { title: "仲介手数料率", body: "売却価格に対する率。" },
  exitBrokerageFixed: { title: "仲介手数料(定額)", body: "定額の仲介費用（万円）。" },
  exitOtherCostRate: { title: "その他売却コスト率", body: "修繕・測量などの概算率。" },
  exitDiscountRate: { title: "NPV割引率", body: "現在価値の割引率。" },
  exitShortTermTaxRate: { title: "短期譲渡税率", body: "5年以下の税率。" },
  exitLongTermTaxRate: { title: "長期譲渡税率", body: "5年超の税率。" },
};

const getCleaningMonthlyCost = (unitCount: number, visitsPerMonth: number) => {
  if (!Number.isFinite(unitCount) || unitCount <= 0) return null;
  const normalizedVisits = visitsPerMonth >= 4 ? 4 : 2;
  if (unitCount >= 9 && unitCount <= 12) {
    return normalizedVisits === 2 ? 12700 : 18000;
  }
  if (unitCount >= 13 && unitCount <= 16) {
    return normalizedVisits === 2 ? 15600 : 23400;
  }
  return null;
};

const inferOerAgeBand = (age: number): OerAgeBand => {
  const safeAge = Number.isFinite(age) ? Math.max(0, Math.floor(age)) : 0;
  const matched = OER_AGE_BANDS.find((band) => safeAge <= band.maxAge);
  return matched?.value ?? "OLD";
};

const inferOerPropertyType = (
  propertyType: string | null | undefined,
  structure: StructureType
): OerPropertyType => {
  const normalized = (propertyType ?? "").replace(/\s/g, "");
  if (normalized.includes("区分")) return "UNIT";
  if (normalized.includes("マンション")) return "RC_APARTMENT";
  if (normalized.includes("アパート")) {
    if (structure === "S_HEAVY" || structure === "S_LIGHT") return "STEEL_APARTMENT";
    if (structure === "RC" || structure === "SRC") return "RC_APARTMENT";
    return "WOOD_APARTMENT";
  }
  if (structure === "S_HEAVY" || structure === "S_LIGHT") return "STEEL_APARTMENT";
  if (structure === "RC" || structure === "SRC") return "RC_APARTMENT";
  return "WOOD_APARTMENT";
};

type ListingPreview = {
  title: string | null;
  propertyName?: string | null;
  propertyType: string | null;
  address: string | null;
  access?: string | null;
  structure?: string | null;
  builtYearMonth?: string | null;
  landRight?: string | null;
  transactionType?: string | null;
  priceDisplay?: string | null;
  landRight?: string | null;
  transactionType?: string | null;
  priceYen?: number | null;
  yieldPercent?: number | null;
  annualRentYen?: number | null;
  monthlyRentYen?: number | null;
  buildingAgeYears?: number | null;
  floorAreaSqm?: number | null;
  landAreaSqm?: number | null;
  privateRoadAreaSqm?: number | null;
  layout?: string | null;
  floors?: string | null;
  unitCount?: number | null;
  totalUnits?: number | null;
  parking?: string | null;
  buildingCoveragePercent?: number | null;
  floorAreaRatioPercent?: number | null;
  roadAccess?: string | null;
  landCategory?: string | null;
  cityPlanningArea?: string | null;
  zoning?: string | null;
  nationalLandReport?: string | null;
  currentStatus?: string | null;
  handoverDate?: string | null;
  buildingConfirmationNumber?: string | null;
  managementNumber?: string | null;
  nextUpdateDate?: string | null;
  infoRegisteredDate?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
};

interface Props {
  initialData: PropertyInput;
  onCalculate: (data: PropertyInput) => void;
  autoFilledKeys?: (keyof PropertyInput)[];
  onFieldTouch?: (key: keyof PropertyInput) => void;
  listing?: ListingPreview | null;
}

export const SimulationForm: React.FC<Props> = ({
  initialData,
  onCalculate,
  autoFilledKeys = [],
  onFieldTouch,
  listing = null,
}) => {
  const [formData, setFormData] = useState<PropertyInput>(initialData);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isBlankInput = (data: PropertyInput) =>
    data.price === 0 &&
    data.loanAmount === 0 &&
    data.monthlyRent === 0 &&
    data.buildingRatio === 0;
  const [isPristine, setIsPristine] = useState(() => isBlankInput(initialData));
  const [buildingRatioTouched, setBuildingRatioTouched] = useState(false);
  const [oerTypeTouched, setOerTypeTouched] = useState(false);
  const [oerAgeTouched, setOerAgeTouched] = useState(false);
  const [oerPropertyType, setOerPropertyType] = useState<OerPropertyType>(() =>
    inferOerPropertyType(listing?.propertyType, initialData.structure)
  );
  const [oerAgeBand, setOerAgeBand] = useState<OerAgeBand>(() =>
    inferOerAgeBand(initialData.buildingAge)
  );
  const [openPanels, setOpenPanels] = useState({
    basic: true,
    loan: true,
    oer: true,
    initial: true,
    repair: true,
    advanced: true,
  });
  const [activeInputHelp, setActiveInputHelp] = useState<string | null>(null);
  const displayValue = (value: number, scale = 1) =>
    isPristine && value === 0 ? "" : value / scale;
  const displayPercent = (value: number) => (isPristine && value === 0 ? "" : value);
  const autoFilledSet = useMemo(() => new Set(autoFilledKeys), [autoFilledKeys]);
  const isAutoFilled = (key: keyof PropertyInput) => autoFilledSet.has(key);
  const getInputHelp = (helpKey: string, fallbackTitle: string): InputHelp => {
    const help = INPUT_HELP[helpKey];
    if (help) return help;
    return { title: fallbackTitle, body: DEFAULT_INPUT_HELP };
  };
  const renderInfoButton = (helpKey: string, fallbackTitle: string) => {
    const help = getInputHelp(helpKey, fallbackTitle);
    const isOpen = activeInputHelp === helpKey;
    return (
      <span className="input-info">
        <button
          type="button"
          className="input-info-btn"
          aria-label={`${help.title}の説明`}
          aria-expanded={isOpen}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setActiveInputHelp(isOpen ? null : helpKey);
          }}
        >
          i
        </button>
        {isOpen ? (
          <div className="input-info-popover" role="dialog">
            <div className="input-info-title">{help.title}</div>
            <div className="input-info-text">{help.body}</div>
            {help.note ? <div className="input-info-note">{help.note}</div> : null}
          </div>
        ) : null}
      </span>
    );
  };
  const renderHelpLabel = (
    text: string,
    helpKey: string,
    autoKey?: keyof PropertyInput
  ) => (
    <label
      className={
        autoKey && isAutoFilled(autoKey)
          ? "auto-label input-label"
          : "input-label"
      }
    >
      <span className="input-label-text">{text}</span>
      {renderInfoButton(helpKey, text)}
      {autoKey && isAutoFilled(autoKey) ? <span className="auto-pill">推定</span> : null}
    </label>
  );
  const renderLabel = (text: string, key: keyof PropertyInput) =>
    renderHelpLabel(text, key, key);
  const getInputHelpText = (helpKey: string, fallbackTitle: string) =>
    getInputHelp(helpKey, fallbackTitle).body;
  useEffect(() => {
    if (oerTypeTouched) return;
    setOerPropertyType(inferOerPropertyType(listing?.propertyType, formData.structure));
  }, [listing?.propertyType, formData.structure, oerTypeTouched]);

  useEffect(() => {
    if (oerAgeTouched) return;
    setOerAgeBand(inferOerAgeBand(formData.buildingAge));
  }, [formData.buildingAge, oerAgeTouched]);
  const legalLife = LEGAL_USEFUL_LIFE[formData.structure];
  const miscCostRate = Number.isFinite(formData.miscCostRate)
    ? formData.miscCostRate
    : initialData.miscCostRate ?? 0;
  const waterContributionRate = Number.isFinite(formData.waterContributionRate)
    ? formData.waterContributionRate
    : initialData.waterContributionRate ?? 0.2;
  const fireInsuranceRate = Number.isFinite(formData.fireInsuranceRate)
    ? formData.fireInsuranceRate
    : initialData.fireInsuranceRate ?? 0.4;
  const loanFeeRate = Number.isFinite(formData.loanFeeRate)
    ? formData.loanFeeRate
    : initialData.loanFeeRate ?? 2.2;
  const registrationCostRate = Number.isFinite(formData.registrationCostRate)
    ? formData.registrationCostRate
    : initialData.registrationCostRate ?? 1.2;
  const acquisitionTaxRate = Number.isFinite(formData.acquisitionTaxRate)
    ? formData.acquisitionTaxRate
    : initialData.acquisitionTaxRate ?? 3;
  const acquisitionLandReductionRate = Number.isFinite(formData.acquisitionLandReductionRate)
    ? formData.acquisitionLandReductionRate
    : initialData.acquisitionLandReductionRate ?? 50;
  const landEvaluationRate = Number.isFinite(formData.landEvaluationRate)
    ? formData.landEvaluationRate
    : initialData.landEvaluationRate ?? 70;
  const buildingEvaluationRate = Number.isFinite(formData.buildingEvaluationRate)
    ? formData.buildingEvaluationRate
    : initialData.buildingEvaluationRate ?? 50;
  const landTaxReductionRate = Number.isFinite(formData.landTaxReductionRate)
    ? formData.landTaxReductionRate
    : initialData.landTaxReductionRate ?? 16.67;
  const propertyTaxRate = Number.isFinite(formData.propertyTaxRate)
    ? formData.propertyTaxRate
    : initialData.propertyTaxRate ?? 1.7;
  const equipmentUsefulLifeValue = Number.isFinite(formData.equipmentUsefulLife)
    ? formData.equipmentUsefulLife
    : initialData.equipmentUsefulLife ?? 15;
  const exitYearValue = Number.isFinite(formData.exitYear)
    ? formData.exitYear
    : initialData.exitYear ?? 10;
  const exitCapRateValue = Number.isFinite(formData.exitCapRate)
    ? formData.exitCapRate
    : initialData.exitCapRate ?? 7;
  const exitBrokerageRateValue = Number.isFinite(formData.exitBrokerageRate)
    ? formData.exitBrokerageRate
    : initialData.exitBrokerageRate ?? 3;
  const exitBrokerageFixedValue = Number.isFinite(formData.exitBrokerageFixed)
    ? formData.exitBrokerageFixed
    : initialData.exitBrokerageFixed ?? 0;
  const exitOtherCostRateValue = Number.isFinite(formData.exitOtherCostRate)
    ? formData.exitOtherCostRate
    : initialData.exitOtherCostRate ?? 0;
  const exitShortTermTaxRateValue = Number.isFinite(formData.exitShortTermTaxRate)
    ? formData.exitShortTermTaxRate
    : initialData.exitShortTermTaxRate ?? 39;
  const exitLongTermTaxRateValue = Number.isFinite(formData.exitLongTermTaxRate)
    ? formData.exitLongTermTaxRate
    : initialData.exitLongTermTaxRate ?? 20;
  const exitDiscountRateValue = Number.isFinite(formData.exitDiscountRate)
    ? formData.exitDiscountRate
    : initialData.exitDiscountRate ?? 4;
  const occupancyRateValue = Number.isFinite(formData.occupancyRate)
    ? formData.occupancyRate
    : initialData.occupancyRate ?? 100;
  const rentDeclineValue = Number.isFinite(formData.rentDeclineRate)
    ? formData.rentDeclineRate
    : initialData.rentDeclineRate ?? 0;
  const incomeTaxRate = Number.isFinite(formData.incomeTaxRate)
    ? formData.incomeTaxRate
    : initialData.incomeTaxRate ?? 20;
  const vacancyModel = formData.vacancyModel ?? initialData.vacancyModel ?? "FIXED";
  const vacancyCycleYears = Number.isFinite(formData.vacancyCycleYears)
    ? formData.vacancyCycleYears
    : initialData.vacancyCycleYears ?? 4;
  const vacancyCycleMonths = Number.isFinite(formData.vacancyCycleMonths)
    ? formData.vacancyCycleMonths
    : initialData.vacancyCycleMonths ?? 3;
  const vacancyProbability = Number.isFinite(formData.vacancyProbability)
    ? formData.vacancyProbability
    : initialData.vacancyProbability ?? 20;
  const vacancyProbabilityMonths = Number.isFinite(formData.vacancyProbabilityMonths)
    ? formData.vacancyProbabilityMonths
    : initialData.vacancyProbabilityMonths ?? 2;
  const otherIncomeValue = Number.isFinite(formData.otherIncome)
    ? formData.otherIncome
    : initialData.otherIncome ?? 0;
  const corporateMinimumTaxValue = Number.isFinite(formData.corporateMinimumTax)
    ? formData.corporateMinimumTax
    : initialData.corporateMinimumTax ?? 70000;
  const scenarioInterestShockYear = Number.isFinite(formData.scenarioInterestShockYear)
    ? formData.scenarioInterestShockYear
    : initialData.scenarioInterestShockYear ?? 5;
  const scenarioInterestShockDelta = Number.isFinite(formData.scenarioInterestShockDelta)
    ? formData.scenarioInterestShockDelta
    : initialData.scenarioInterestShockDelta ?? 1;
  const scenarioRentDeclineEarlyRate = Number.isFinite(formData.scenarioRentDeclineEarlyRate)
    ? formData.scenarioRentDeclineEarlyRate
    : initialData.scenarioRentDeclineEarlyRate ?? 1.5;
  const scenarioRentDeclineLateRate = Number.isFinite(formData.scenarioRentDeclineLateRate)
    ? formData.scenarioRentDeclineLateRate
    : initialData.scenarioRentDeclineLateRate ?? 0.5;
  const scenarioRentDeclineSwitchYear = Number.isFinite(formData.scenarioRentDeclineSwitchYear)
    ? formData.scenarioRentDeclineSwitchYear
    : initialData.scenarioRentDeclineSwitchYear ?? 10;
  const scenarioOccupancyDeclineStartYear = Number.isFinite(formData.scenarioOccupancyDeclineStartYear)
    ? formData.scenarioOccupancyDeclineStartYear
    : initialData.scenarioOccupancyDeclineStartYear ?? 10;
  const scenarioOccupancyDeclineDelta = Number.isFinite(formData.scenarioOccupancyDeclineDelta)
    ? formData.scenarioOccupancyDeclineDelta
    : initialData.scenarioOccupancyDeclineDelta ?? 5;
  const buildingPrice = Math.round((formData.price * formData.buildingRatio) / 100);
  const landPrice = Math.max(0, formData.price - buildingPrice);
  const miscCost = Math.round((formData.price * miscCostRate) / 100);
  const waterContribution = Math.round((formData.price * waterContributionRate) / 100);
  const fireInsurance = Math.round((buildingPrice * fireInsuranceRate) / 100);
  const loanFee = Math.round((formData.loanAmount * loanFeeRate) / 100);
  const registrationCost = Math.round((formData.price * registrationCostRate) / 100);
  const initialCostsTotal =
    miscCost + waterContribution + fireInsurance + loanFee + registrationCost;
  const landEvaluation = Math.round((landPrice * landEvaluationRate) / 100);
  const buildingEvaluation = Math.round((buildingPrice * buildingEvaluationRate) / 100);
  const acquisitionTaxEstimate = Math.round(
    (landEvaluation * (acquisitionLandReductionRate / 100) + buildingEvaluation) *
      (acquisitionTaxRate / 100)
  );
  const estimatedTotal = formData.price + initialCostsTotal;
  const annualFullRent = formData.monthlyRent * 12;
  const oerTemplate = OER_TEMPLATES[oerPropertyType][oerAgeBand];
  const oerBase = oerTemplate.exclTax;
  const repairEvents = Array.isArray(formData.repairEvents)
    ? formData.repairEvents
    : initialData.repairEvents ?? [];
  const oerModeValue = formData.oerMode ?? "SIMPLE";
  const oerRateItems = Array.isArray(formData.oerRateItems) ? formData.oerRateItems : [];
  const oerFixedItems = Array.isArray(formData.oerFixedItems) ? formData.oerFixedItems : [];
  const oerEventItems = Array.isArray(formData.oerEventItems) ? formData.oerEventItems : [];
  const oerLeasingEnabledValue =
    typeof formData.oerLeasingEnabled === "boolean" ? formData.oerLeasingEnabled : true;
  const unitCountValue = Number.isFinite(formData.unitCount) ? formData.unitCount : 0;
  const cleaningVisitsPerMonthValue =
    Number.isFinite(formData.cleaningVisitsPerMonth) && formData.cleaningVisitsPerMonth > 0
      ? formData.cleaningVisitsPerMonth
      : 2;
  const cleaningMonthlyCost = getCleaningMonthlyCost(
    unitCountValue,
    cleaningVisitsPerMonthValue
  );
  const oerIncludeAd = oerLeasingEnabledValue;
  const oerIncludeRepair = true;
  const oerIncludeBuffer = true;
  const oerLeasingMonthsValue = Number.isFinite(formData.oerLeasingMonths)
    ? formData.oerLeasingMonths
    : initialData.oerLeasingMonths ?? 2;
  const oerLeasingTenancyYearsValue = Number.isFinite(formData.oerLeasingTenancyYears)
    ? formData.oerLeasingTenancyYears
    : initialData.oerLeasingTenancyYears ?? 2;
  const oerLeasingRate =
    oerLeasingEnabledValue &&
    oerLeasingMonthsValue > 0 &&
    oerLeasingTenancyYearsValue > 0
      ? (oerLeasingMonthsValue / (oerLeasingTenancyYearsValue * 12)) * 100
      : 0;
  const oerExtras =
    (oerIncludeAd ? OER_AD_BONUS : 0) +
    (oerIncludeRepair ? OER_REPAIR_BONUS : 0) +
    (oerIncludeBuffer ? OER_BUFFER_BONUS : 0);
  const oerSuggested = Math.max(0, oerBase + oerExtras);
  const oerSuggestedRounded = Number(oerSuggested.toFixed(1));

  useEffect(() => {
    if (oerModeValue !== "DETAILED") return;
    if (!cleaningMonthlyCost) return;
    if (oerPropertyType === "UNIT") return;
    const cleaningAnnual = Math.round(cleaningMonthlyCost * 12);
    const targetIndex = oerFixedItems.findIndex((item) => item.label === "清掃・建物管理");
    if (targetIndex === -1) return;
    if (oerFixedItems[targetIndex]?.annualAmount === cleaningAnnual) return;
    const nextItems = oerFixedItems.map((item, index) =>
      index === targetIndex ? { ...item, annualAmount: cleaningAnnual } : item
    );
    const nextData = { ...formData, oerFixedItems: nextItems };
    setFormData(nextData);
    onCalculate(nextData);
  }, [
    cleaningMonthlyCost,
    oerModeValue,
    oerPropertyType,
    oerFixedItems,
    formData,
    onCalculate,
  ]);

  useEffect(() => {
    const nextPristine = isBlankInput(initialData);
    setIsPristine(nextPristine);
    setBuildingRatioTouched(initialData.buildingRatio > 0);
    if (nextPristine) {
      return;
    }
    if (initialData.buildingRatio > 0) {
      return;
    }
    const suggested = getSuggestedBuildingRatio(initialData.structure, initialData.buildingAge);
    if (suggested <= 0) {
      return;
    }
    const next = { ...initialData, buildingRatio: suggested };
    setFormData(next);
    onCalculate(next);
  }, [initialData, onCalculate]);

  useEffect(() => {
    const occupancyRate = Number.isFinite(formData.occupancyRate)
      ? formData.occupancyRate
      : initialData.occupancyRate ?? 100;
    const rentDeclineRate = Number.isFinite(formData.rentDeclineRate)
      ? formData.rentDeclineRate
      : initialData.rentDeclineRate ?? 0;
    const miscRate = Number.isFinite(formData.miscCostRate)
      ? formData.miscCostRate
      : initialData.miscCostRate ?? 0;
    const waterRate = Number.isFinite(formData.waterContributionRate)
      ? formData.waterContributionRate
      : initialData.waterContributionRate ?? 0.2;
    const fireRate = Number.isFinite(formData.fireInsuranceRate)
      ? formData.fireInsuranceRate
      : initialData.fireInsuranceRate ?? 0.4;
    const loanFee = Number.isFinite(formData.loanFeeRate)
      ? formData.loanFeeRate
      : initialData.loanFeeRate ?? 2.2;
    const registrationRate = Number.isFinite(formData.registrationCostRate)
      ? formData.registrationCostRate
      : initialData.registrationCostRate ?? 1.2;
    const acquisitionRate = Number.isFinite(formData.acquisitionTaxRate)
      ? formData.acquisitionTaxRate
      : initialData.acquisitionTaxRate ?? 3;
    const acquisitionLandReduction = Number.isFinite(formData.acquisitionLandReductionRate)
      ? formData.acquisitionLandReductionRate
      : initialData.acquisitionLandReductionRate ?? 50;
    const landRate = Number.isFinite(formData.landEvaluationRate)
      ? formData.landEvaluationRate
      : initialData.landEvaluationRate ?? 70;
    const buildingRate = Number.isFinite(formData.buildingEvaluationRate)
      ? formData.buildingEvaluationRate
      : initialData.buildingEvaluationRate ?? 50;
    const landReduction = Number.isFinite(formData.landTaxReductionRate)
      ? formData.landTaxReductionRate
      : initialData.landTaxReductionRate ?? 16.67;
    const taxRate = Number.isFinite(formData.propertyTaxRate)
      ? formData.propertyTaxRate
      : initialData.propertyTaxRate ?? 1.7;
    const incomeRate = Number.isFinite(formData.incomeTaxRate)
      ? formData.incomeTaxRate
      : initialData.incomeTaxRate ?? 20;
    const vacancyMode = formData.vacancyModel ?? initialData.vacancyModel ?? "FIXED";
    const cycleYears = Number.isFinite(formData.vacancyCycleYears)
      ? formData.vacancyCycleYears
      : initialData.vacancyCycleYears ?? 4;
    const cycleMonths = Number.isFinite(formData.vacancyCycleMonths)
      ? formData.vacancyCycleMonths
      : initialData.vacancyCycleMonths ?? 3;
    const probability = Number.isFinite(formData.vacancyProbability)
      ? formData.vacancyProbability
      : initialData.vacancyProbability ?? 20;
    const probabilityMonths = Number.isFinite(formData.vacancyProbabilityMonths)
      ? formData.vacancyProbabilityMonths
      : initialData.vacancyProbabilityMonths ?? 2;
    const repairList = Array.isArray(formData.repairEvents)
      ? formData.repairEvents
      : initialData.repairEvents ?? [];
    const otherIncome = Number.isFinite(formData.otherIncome)
      ? formData.otherIncome
      : initialData.otherIncome ?? 0;
    const corporateMinimumTax = Number.isFinite(formData.corporateMinimumTax)
      ? formData.corporateMinimumTax
      : initialData.corporateMinimumTax ?? 70000;
    const scenarioEnabled = typeof formData.scenarioEnabled === "boolean"
      ? formData.scenarioEnabled
      : initialData.scenarioEnabled ?? true;
    const scenarioRentCurveEnabled = typeof formData.scenarioRentCurveEnabled === "boolean"
      ? formData.scenarioRentCurveEnabled
      : initialData.scenarioRentCurveEnabled ?? true;
    const scenarioOccupancyDeclineEnabled = typeof formData.scenarioOccupancyDeclineEnabled === "boolean"
      ? formData.scenarioOccupancyDeclineEnabled
      : initialData.scenarioOccupancyDeclineEnabled ?? true;
    const scenarioShockYear = Number.isFinite(formData.scenarioInterestShockYear)
      ? formData.scenarioInterestShockYear
      : initialData.scenarioInterestShockYear ?? 5;
    const scenarioShockDelta = Number.isFinite(formData.scenarioInterestShockDelta)
      ? formData.scenarioInterestShockDelta
      : initialData.scenarioInterestShockDelta ?? 1;
    const scenarioEarlyRate = Number.isFinite(formData.scenarioRentDeclineEarlyRate)
      ? formData.scenarioRentDeclineEarlyRate
      : initialData.scenarioRentDeclineEarlyRate ?? 1.5;
    const scenarioLateRate = Number.isFinite(formData.scenarioRentDeclineLateRate)
      ? formData.scenarioRentDeclineLateRate
      : initialData.scenarioRentDeclineLateRate ?? 0.5;
    const scenarioSwitchYear = Number.isFinite(formData.scenarioRentDeclineSwitchYear)
      ? formData.scenarioRentDeclineSwitchYear
      : initialData.scenarioRentDeclineSwitchYear ?? 10;
    const scenarioOccupancyStart = Number.isFinite(formData.scenarioOccupancyDeclineStartYear)
      ? formData.scenarioOccupancyDeclineStartYear
      : initialData.scenarioOccupancyDeclineStartYear ?? 10;
    const scenarioOccupancyDelta = Number.isFinite(formData.scenarioOccupancyDeclineDelta)
      ? formData.scenarioOccupancyDeclineDelta
      : initialData.scenarioOccupancyDeclineDelta ?? 5;
    const equipmentUsefulLife = Number.isFinite(formData.equipmentUsefulLife)
      ? formData.equipmentUsefulLife
      : initialData.equipmentUsefulLife ?? 15;
    const exitYear = Number.isFinite(formData.exitYear)
      ? formData.exitYear
      : initialData.exitYear ?? 10;
    const exitCapRate = Number.isFinite(formData.exitCapRate)
      ? formData.exitCapRate
      : initialData.exitCapRate ?? 7;
    const exitBrokerageRate = Number.isFinite(formData.exitBrokerageRate)
      ? formData.exitBrokerageRate
      : initialData.exitBrokerageRate ?? 3;
    const exitBrokerageFixed = Number.isFinite(formData.exitBrokerageFixed)
      ? formData.exitBrokerageFixed
      : initialData.exitBrokerageFixed ?? 0;
    const exitOtherCostRate = Number.isFinite(formData.exitOtherCostRate)
      ? formData.exitOtherCostRate
      : initialData.exitOtherCostRate ?? 0;
    const exitShortTermTaxRate = Number.isFinite(formData.exitShortTermTaxRate)
      ? formData.exitShortTermTaxRate
      : initialData.exitShortTermTaxRate ?? 39;
    const exitLongTermTaxRate = Number.isFinite(formData.exitLongTermTaxRate)
      ? formData.exitLongTermTaxRate
      : initialData.exitLongTermTaxRate ?? 20;
    const exitDiscountRate = Number.isFinite(formData.exitDiscountRate)
      ? formData.exitDiscountRate
      : initialData.exitDiscountRate ?? 4;
    if (
      occupancyRate === formData.occupancyRate &&
      rentDeclineRate === formData.rentDeclineRate &&
      miscRate === formData.miscCostRate &&
      waterRate === formData.waterContributionRate &&
      fireRate === formData.fireInsuranceRate &&
      loanFee === formData.loanFeeRate &&
      registrationRate === formData.registrationCostRate &&
      acquisitionRate === formData.acquisitionTaxRate &&
      acquisitionLandReduction === formData.acquisitionLandReductionRate &&
      landRate === formData.landEvaluationRate &&
      buildingRate === formData.buildingEvaluationRate &&
      landReduction === formData.landTaxReductionRate &&
      taxRate === formData.propertyTaxRate &&
      incomeRate === formData.incomeTaxRate &&
      vacancyMode === formData.vacancyModel &&
      cycleYears === formData.vacancyCycleYears &&
      cycleMonths === formData.vacancyCycleMonths &&
      probability === formData.vacancyProbability &&
      probabilityMonths === formData.vacancyProbabilityMonths &&
      repairList === formData.repairEvents &&
      otherIncome === formData.otherIncome &&
      corporateMinimumTax === formData.corporateMinimumTax &&
      scenarioEnabled === formData.scenarioEnabled &&
      scenarioRentCurveEnabled === formData.scenarioRentCurveEnabled &&
      scenarioOccupancyDeclineEnabled === formData.scenarioOccupancyDeclineEnabled &&
      scenarioShockYear === formData.scenarioInterestShockYear &&
      scenarioShockDelta === formData.scenarioInterestShockDelta &&
      scenarioEarlyRate === formData.scenarioRentDeclineEarlyRate &&
      scenarioLateRate === formData.scenarioRentDeclineLateRate &&
      scenarioSwitchYear === formData.scenarioRentDeclineSwitchYear &&
      scenarioOccupancyStart === formData.scenarioOccupancyDeclineStartYear &&
      scenarioOccupancyDelta === formData.scenarioOccupancyDeclineDelta &&
      equipmentUsefulLife === formData.equipmentUsefulLife &&
      exitYear === formData.exitYear &&
      exitCapRate === formData.exitCapRate &&
      exitBrokerageRate === formData.exitBrokerageRate &&
      exitBrokerageFixed === formData.exitBrokerageFixed &&
      exitOtherCostRate === formData.exitOtherCostRate &&
      exitShortTermTaxRate === formData.exitShortTermTaxRate &&
      exitLongTermTaxRate === formData.exitLongTermTaxRate &&
      exitDiscountRate === formData.exitDiscountRate
    ) {
      return;
    }
    const patched = {
      ...formData,
      occupancyRate,
      rentDeclineRate,
      miscCostRate: miscRate,
      waterContributionRate: waterRate,
      fireInsuranceRate: fireRate,
      loanFeeRate: loanFee,
      registrationCostRate: registrationRate,
      acquisitionTaxRate: acquisitionRate,
      acquisitionLandReductionRate: acquisitionLandReduction,
      landEvaluationRate: landRate,
      buildingEvaluationRate: buildingRate,
      landTaxReductionRate: landReduction,
      propertyTaxRate: taxRate,
      incomeTaxRate: incomeRate,
      vacancyModel: vacancyMode,
      vacancyCycleYears: cycleYears,
      vacancyCycleMonths: cycleMonths,
      vacancyProbability: probability,
      vacancyProbabilityMonths: probabilityMonths,
      repairEvents: repairList,
      otherIncome,
      corporateMinimumTax,
      scenarioEnabled,
      scenarioRentCurveEnabled,
      scenarioOccupancyDeclineEnabled,
      scenarioInterestShockYear: scenarioShockYear,
      scenarioInterestShockDelta: scenarioShockDelta,
      scenarioRentDeclineEarlyRate: scenarioEarlyRate,
      scenarioRentDeclineLateRate: scenarioLateRate,
      scenarioRentDeclineSwitchYear: scenarioSwitchYear,
      scenarioOccupancyDeclineStartYear: scenarioOccupancyStart,
      scenarioOccupancyDeclineDelta: scenarioOccupancyDelta,
      equipmentUsefulLife,
      exitYear,
      exitCapRate,
      exitBrokerageRate,
      exitBrokerageFixed,
      exitOtherCostRate,
      exitShortTermTaxRate,
      exitLongTermTaxRate,
      exitDiscountRate,
    };
    setFormData(patched);
    onCalculate(patched);
  }, [formData, initialData, onCalculate]);

  // 入力が変わるたびに状態を更新し、親へ通知（リアルタイム計算用）
  const handleChange = (key: keyof PropertyInput, value: any) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    setIsPristine(false);
    onFieldTouch?.(key);
    onCalculate(newData);
  };

  const getLoanFromEquityRatio = (price: number, equityRatio: number) => {
    const safePrice = Number.isFinite(price) ? price : 0;
    const safeRatio = Number.isFinite(equityRatio) ? equityRatio : 0;
    return Math.max(0, Math.round(safePrice * (1 - safeRatio / 100)));
  };

  const handlePriceChange = (value: number) => {
    const nextLoanAmount = getLoanFromEquityRatio(value, formData.equityRatio);
    const next = { ...formData, price: value, loanAmount: nextLoanAmount };
    setFormData(next);
    setIsPristine(false);
    onFieldTouch?.("price");
    onCalculate(next);
  };

  const handleEquityRatioChange = (value: number) => {
    const nextLoanAmount = getLoanFromEquityRatio(formData.price, value);
    const next = { ...formData, equityRatio: value, loanAmount: nextLoanAmount };
    setFormData(next);
    setIsPristine(false);
    onFieldTouch?.("equityRatio");
    onCalculate(next);
  };

  const applyAutoBuildingRatio = (nextData: PropertyInput) => {
    if (buildingRatioTouched) return nextData;
    const suggested = getSuggestedBuildingRatio(nextData.structure, nextData.buildingAge);
    if (suggested <= 0) return nextData;
    return { ...nextData, buildingRatio: suggested };
  };

  const handleStructureChange = (value: StructureType) => {
    const next = applyAutoBuildingRatio({ ...formData, structure: value });
    setFormData(next);
    setIsPristine(false);
    onFieldTouch?.("structure");
    onCalculate(next);
  };

  const handleBuildingAgeChange = (value: number) => {
    const next = applyAutoBuildingRatio({ ...formData, buildingAge: value });
    setFormData(next);
    setIsPristine(false);
    onFieldTouch?.("buildingAge");
    onCalculate(next);
  };

  const handleBuildingRatioChange = (value: number) => {
    setBuildingRatioTouched(true);
    onFieldTouch?.("buildingRatio");
    handleChange("buildingRatio", value);
  };

  const createOerId = (prefix: string) =>
    `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;

  const buildOerPreset = () => {
    const repairRate = OER_REPAIR_RATE[oerAgeBand];
    const unitMgmtRate = OER_UNIT_MGMT_RATE[oerAgeBand];
    const insuranceRate = OER_INSURANCE_RATE[oerPropertyType];
    const leasingDefaults = OER_LEASING_DEFAULTS[oerAgeBand];
    const rateItems: OerRateItem[] = [
      { id: createOerId("pm"), label: "PM手数料", rate: 5, base: "GPR", enabled: true },
      {
        id: createOerId("insurance"),
        label: "保険",
        rate: insuranceRate,
        base: "GPR",
        enabled: true,
      },
    ];
    if (oerIncludeRepair) {
      rateItems.push({
        id: createOerId("repair"),
        label: "小修繕積立",
        rate: repairRate,
        base: "GPR",
        enabled: false,
      });
    }
    if (oerPropertyType === "UNIT") {
      rateItems.push({
        id: createOerId("unit"),
        label: "管理費・修繕積立金",
        rate: unitMgmtRate,
        base: "GPR",
        enabled: true,
      });
    }
    if (oerIncludeBuffer) {
      rateItems.push({
        id: createOerId("buffer"),
        label: "予備費",
        rate: OER_BUFFER_BONUS,
        base: "GPR",
        enabled: false,
      });
    }

    const fixedItems: OerFixedItem[] = [];
    if (oerPropertyType !== "UNIT") {
      const baseCleaning =
        oerPropertyType === "RC_APARTMENT"
          ? 420000
          : oerPropertyType === "STEEL_APARTMENT"
          ? 300000
          : 240000;
      const cleaningAnnual = cleaningMonthlyCost
        ? Math.round(cleaningMonthlyCost * 12)
        : baseCleaning;
      fixedItems.push({
        id: createOerId("clean"),
        label: "清掃・建物管理",
        annualAmount: cleaningAnnual,
        enabled: true,
      });
      fixedItems.push({
        id: createOerId("power"),
        label: "共用部電気",
        annualAmount: oerPropertyType === "RC_APARTMENT" ? 60000 : 36000,
        enabled: true,
      });
      fixedItems.push({
        id: createOerId("fire"),
        label: "消防点検",
        annualAmount: oerPropertyType === "RC_APARTMENT" ? 80000 : 50000,
        enabled: true,
      });
      if (oerPropertyType === "RC_APARTMENT") {
        fixedItems.push({
          id: createOerId("elevator"),
          label: "EV保守",
          annualAmount: 480000,
          enabled: false,
        });
        fixedItems.push({
          id: createOerId("water"),
          label: "受水槽",
          annualAmount: 90000,
          enabled: false,
        });
      }
    }

    const eventItems: OerEventItem[] = [];
    if (oerIncludeRepair && oerPropertyType !== "UNIT") {
      const eventAmount =
        oerPropertyType === "RC_APARTMENT"
          ? 2500000
          : oerPropertyType === "STEEL_APARTMENT"
          ? 1500000
          : 1200000;
      eventItems.push({
        id: createOerId("major"),
        label: "外壁・防水",
        amount: eventAmount,
        intervalYears: 12,
        startYear: 12,
        mode: "RESERVE",
        enabled: true,
      });
    }

    return {
      rateItems,
      fixedItems,
      eventItems,
      leasingEnabled: oerIncludeAd,
      leasingMonths: leasingDefaults.months,
      leasingTenancyYears: leasingDefaults.tenancyYears,
    };
  };

  const applyOerPreset = (mode: "SIMPLE" | "DETAILED") => {
    if (mode === "SIMPLE") {
      handleChange("operatingExpenseRate", oerSuggestedRounded);
      return;
    }
    const preset = buildOerPreset();
    const next: PropertyInput = {
      ...formData,
      oerMode: "DETAILED",
      oerRateItems: preset.rateItems,
      oerFixedItems: preset.fixedItems,
      oerEventItems: preset.eventItems,
      oerLeasingEnabled: preset.leasingEnabled,
      oerLeasingMonths: preset.leasingMonths,
      oerLeasingTenancyYears: preset.leasingTenancyYears,
    };
    setFormData(next);
    setIsPristine(false);
    onCalculate(next);
  };

  const handleOerModeChange = (mode: "SIMPLE" | "DETAILED") => {
    if (mode === oerModeValue) return;
    if (mode === "DETAILED" && oerRateItems.length === 0 && oerFixedItems.length === 0) {
      applyOerPreset("DETAILED");
      return;
    }
    handleChange("oerMode", mode);
  };

  const updateOerRateItem = (id: string, patch: Partial<OerRateItem>) => {
    const next = oerRateItems.map((item) => (item.id === id ? { ...item, ...patch } : item));
    handleChange("oerRateItems", next);
  };
  const updateOerFixedItem = (id: string, patch: Partial<OerFixedItem>) => {
    const next = oerFixedItems.map((item) => (item.id === id ? { ...item, ...patch } : item));
    handleChange("oerFixedItems", next);
  };
  const updateOerEventItem = (id: string, patch: Partial<OerEventItem>) => {
    const next = oerEventItems.map((item) => (item.id === id ? { ...item, ...patch } : item));
    handleChange("oerEventItems", next);
  };
  const addOerRateItem = () => {
    const next = [
      ...oerRateItems,
      { id: createOerId("rate"), label: "費目", rate: 0, base: "GPR", enabled: true },
    ];
    handleChange("oerRateItems", next);
  };
  const addOerFixedItem = () => {
    const next = [
      ...oerFixedItems,
      { id: createOerId("fixed"), label: "費目", annualAmount: 0, enabled: true },
    ];
    handleChange("oerFixedItems", next);
  };
  const addOerEventItem = () => {
    const next = [
      ...oerEventItems,
      {
        id: createOerId("event"),
        label: "イベント",
        amount: 0,
        intervalYears: 10,
        startYear: 10,
        mode: "RESERVE",
        enabled: true,
      },
    ];
    handleChange("oerEventItems", next);
  };
  const removeOerItem = (key: "oerRateItems" | "oerFixedItems" | "oerEventItems", id: string) => {
    if (key === "oerRateItems") {
      handleChange(
        "oerRateItems",
        oerRateItems.filter((item) => item.id !== id)
      );
      return;
    }
    if (key === "oerFixedItems") {
      handleChange(
        "oerFixedItems",
        oerFixedItems.filter((item) => item.id !== id)
      );
      return;
    }
    handleChange(
      "oerEventItems",
      oerEventItems.filter((item) => item.id !== id)
    );
  };

  const calculateOerPreview = () => {
    const grossPotentialRent = Math.max(0, annualFullRent);
    const effectiveIncome =
      grossPotentialRent * Math.max(0, Math.min(100, formData.occupancyRate || 0)) / 100;
    const rateExpense = oerRateItems.reduce((sum, item) => {
      if (!item.enabled) return sum;
      const base = item.base === "EGI" ? effectiveIncome : grossPotentialRent;
      return sum + base * (Math.max(0, item.rate) / 100);
    }, 0);
    const fixedExpense = oerFixedItems.reduce(
      (sum, item) => sum + (item.enabled ? Math.max(0, item.annualAmount) : 0),
      0
    );
    const eventExpense = oerEventItems.reduce((sum, item) => {
      if (!item.enabled) return sum;
      const interval = Math.max(1, Math.round(item.intervalYears || 0));
      if (item.mode === "CASH") return sum;
      return sum + Math.max(0, item.amount) / interval;
    }, 0);
    const leasingExpense =
      oerLeasingEnabledValue && oerLeasingRate > 0
        ? grossPotentialRent * (oerLeasingRate / 100)
        : 0;
    const total = rateExpense + fixedExpense + eventExpense + leasingExpense;
    const oerGpr = grossPotentialRent > 0 ? (total / grossPotentialRent) * 100 : 0;
    const oerEgi = effectiveIncome > 0 ? (total / effectiveIncome) * 100 : 0;
    return { total, oerGpr, oerEgi };
  };

  const oerPreview = useMemo(
    () => calculateOerPreview(),
    [
      annualFullRent,
      formData.occupancyRate,
      oerRateItems,
      oerFixedItems,
      oerEventItems,
      oerLeasingEnabledValue,
      oerLeasingRate,
    ]
  );

  const addRepairEvent = () => {
    const nextYear = repairEvents.length > 0 ? repairEvents[repairEvents.length - 1].year + 1 : 10;
    const nextEvent = { year: Math.max(1, Math.min(35, nextYear)), amount: 1000000, label: "" };
    handleChange("repairEvents", [...repairEvents, nextEvent]);
  };

  const updateRepairEvent = (index: number, key: "year" | "amount" | "label", value: any) => {
    const next = repairEvents.map((event, idx) =>
      idx === index ? { ...event, [key]: value } : event
    );
    handleChange("repairEvents", next);
  };

  const removeRepairEvent = (index: number) => {
    const next = repairEvents.filter((_, idx) => idx !== index);
    handleChange("repairEvents", next);
  };

  const togglePanel = (key: keyof typeof openPanels) => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="sheet-card form-card">
      <div className="form-header">
        <h2 className="form-title">物件・融資条件設定</h2>
        <button
          type="button"
          className="section-toggle"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? "▶ 開く" : "▼ 閉じる"}
        </button>
      </div>

      {isCollapsed ? null : (
        <div className="form-scroll">
          <div className="form-input-layout">
            <div className="form-input-left">
              {/* --- 1. 基本情報セクション --- */}
              <div className="form-section form-panel">
                <div className="form-panel-head">
                  <h3 className="form-section-title">基本情報</h3>
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => togglePanel("basic")}
                    aria-expanded={openPanels.basic}
                  >
                    {openPanels.basic ? "▼ 閉じる" : "▶ 開く"}
                  </button>
                </div>
                {openPanels.basic ? (
                  <>
                    <div className="form-grid two-col oer-top-grid">
                      <div>
                        {renderLabel("物件価格 (建物+土地/万円)", "price")}
                        <input
                          type="number"
                          value={displayValue(formData.price, 10000)} // 表示は万円単位
                          onChange={(e) => handlePriceChange(Number(e.target.value) * 10000)}
                        />
                      </div>
                      <div>
                        {renderLabel("建物比率 (%)", "buildingRatio")}
                        <input
                          type="number"
                          value={displayPercent(formData.buildingRatio)}
                          className={isAutoFilled("buildingRatio") ? "auto-input" : undefined}
                          onChange={(e) => handleBuildingRatioChange(Number(e.target.value))}
                        />
                        {!isPristine && formData.price > 0 && formData.buildingRatio > 0 ? (
                          <p className="form-note">
                            建物価格:{" "}
                            {((formData.price * formData.buildingRatio) / 100 / 10000).toLocaleString()} 万円
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="form-grid two-col oer-top-grid">
                      <div>
                        {renderLabel("構造", "structure")}
                        <select
                          value={isPristine ? "" : formData.structure}
                          onChange={(e) => {
                            const value = e.target.value as StructureType;
                            if (!value) return;
                            handleStructureChange(value);
                          }}
                        >
                          <option value="" disabled>
                            選択
                          </option>
                          {STRUCTURE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {!isPristine ? (
                          <p className="form-note">法定耐用年数: {legalLife} 年</p>
                        ) : null}
                      </div>
                      <div>
                        {renderLabel("築年数 (年)", "buildingAge")}
                        <input
                          type="number"
                          value={displayValue(formData.buildingAge)}
                          onChange={(e) => handleBuildingAgeChange(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
              {/* --- 2. 融資・収支セクション --- */}
              <div className="form-section form-panel">
                <div className="form-panel-head">
                  <h3 className="form-section-title">融資・収支</h3>
                  <button
                    type="button"
                    className="section-toggle"
                    onClick={() => togglePanel("loan")}
                    aria-expanded={openPanels.loan}
                  >
                    {openPanels.loan ? "▼ 閉じる" : "▶ 開く"}
                  </button>
                </div>
                {openPanels.loan ? (
                  <>
                    <div className="form-grid one-col compact">
                      <div>
                        {renderLabel("自己資金 (%)", "equityRatio")}
                        <input
                          type="number"
                          step="0.1"
                          value={displayPercent(formData.equityRatio)}
                          className={isAutoFilled("equityRatio") ? "auto-input" : undefined}
                          onChange={(e) =>
                            handleEquityRatioChange(Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        {renderLabel("借入金額 (万円)", "loanAmount")}
                        <input
                          type="number"
                          value={displayValue(formData.loanAmount, 10000)}
                          className={isAutoFilled("loanAmount") ? "auto-input" : undefined}
                          readOnly
                        />
                      </div>
                      <div>
                        {renderLabel("金利 (%)", "interestRate")}
                        <input
                          type="number"
                          step="0.1"
                          value={displayPercent(formData.interestRate)}
                          className={isAutoFilled("interestRate") ? "auto-input" : undefined}
                          onChange={(e) => handleChange("interestRate", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        {renderLabel("期間 (年)", "loanDuration")}
                        <input
                          type="number"
                          value={displayValue(formData.loanDuration)}
                          className={isAutoFilled("loanDuration") ? "auto-input" : undefined}
                          onChange={(e) => handleChange("loanDuration", Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="form-divider" />
                    <div className="form-subtitle">収支</div>
                    <div className="form-grid one-col compact">
                      <div>
                        {renderLabel("月額賃料 (満室想定/万円)", "monthlyRent")}
                        <input
                          type="number"
                          value={displayValue(formData.monthlyRent, 10000)}
                          onChange={(e) =>
                            handleChange("monthlyRent", Number(e.target.value) * 10000)
                          }
                        />
                        {!isPristine && formData.monthlyRent > 0 ? (
                          <p className="form-note">
                            年間賃貸料: {(annualFullRent / 10000).toLocaleString()} 万円
                          </p>
                        ) : null}
                      </div>
                      <div>
                        {renderLabel("家賃下落率 (2年ごと/%)", "rentDeclineRate")}
                        <input
                          type="number"
                          step="0.1"
                          value={displayPercent(rentDeclineValue)}
                          className={isAutoFilled("rentDeclineRate") ? "auto-input" : undefined}
                          onChange={(e) => handleChange("rentDeclineRate", Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="form-input-right">
              <div className="form-input-right-grid">
                <div className="form-input-right-col">
            {/* --- 4. 運営経費 (OER) セクション --- */}
            <div className="form-section form-panel oer-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">運営経費 (OER)</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("oer")}
                  aria-expanded={openPanels.oer}
                >
                  {openPanels.oer ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.oer ? (
                <>
                  <div className="oer-box">
                    <div className="oer-box-head">
                      <div>
                        <div className="oer-box-title">
                          入力方式
                          {renderInfoButton("oerMode", "入力方式")}
                        </div>
                        <p className="form-note">簡易入力か内訳入力を選べます。</p>
                      </div>
                      <div className="oer-mode-toggle" role="group" aria-label="運営経費モード">
                        <button
                          type="button"
                          className={oerModeValue === "SIMPLE" ? "is-active" : undefined}
                          onClick={() => handleOerModeChange("SIMPLE")}
                        >
                          簡易
                        </button>
                        <button
                          type="button"
                          className={oerModeValue === "DETAILED" ? "is-active" : undefined}
                          onClick={() => handleOerModeChange("DETAILED")}
                        >
                          内訳
                        </button>
                      </div>
                    </div>

                    <div className="form-grid oer-top-grid">
                      <div>
                        {renderHelpLabel("運営経費テンプレ", "oerPropertyType")}
                        <select
                          value={oerPropertyType}
                          onChange={(e) => {
                            setOerTypeTouched(true);
                            setOerPropertyType(e.target.value as OerPropertyType);
                          }}
                        >
                          {OER_PROPERTY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        {renderHelpLabel("築年数帯", "oerAgeBand")}
                        <select
                          value={oerAgeBand}
                          onChange={(e) => {
                            setOerAgeTouched(true);
                            setOerAgeBand(e.target.value as OerAgeBand);
                          }}
                        >
                          {OER_AGE_BANDS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        {renderLabel("戸数", "unitCount")}
                        <input
                          type="number"
                          value={displayValue(formData.unitCount)}
                          onChange={(e) => handleChange("unitCount", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        {renderLabel("清掃回数/月", "cleaningVisitsPerMonth")}
                        <select
                          value={
                            formData.cleaningVisitsPerMonth > 0
                              ? String(formData.cleaningVisitsPerMonth)
                              : ""
                          }
                          onChange={(e) =>
                            handleChange("cleaningVisitsPerMonth", Number(e.target.value))
                          }
                        >
                          <option value="" disabled>
                            選択
                          </option>
                          <option value="2">月2回</option>
                          <option value="4">月4回</option>
                        </select>
                        <p className="form-note">9〜16戸は相場で清掃費を自動入力します。</p>
                      </div>
                    </div>
                    <div className="form-grid two-col">
                      <div>
                        <div className="oer-actions">
                          <button
                            type="button"
                            className="section-toggle"
                            onClick={() => applyOerPreset(oerModeValue)}
                          >
                            {oerModeValue === "SIMPLE" ? "テンプレ適用" : "内訳を生成"}
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="form-note">
                          推定: {oerSuggestedRounded}% (固都税除外{oerTemplate.exclTax}% + 補正)
                        </p>
                      </div>
                    </div>
                    <div className="oer-template">
                      <div className="oer-template-title">運営経費率テンプレ（固都税除外）</div>
                      <table className="oer-template-table">
                        <thead>
                          <tr>
                            <th>物件タイプ</th>
                            {OER_AGE_BANDS.map((band) => (
                              <th key={band.value}>{band.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {OER_PROPERTY_OPTIONS.map((option) => (
                            <tr key={option.value}>
                              <td>{option.label}</td>
                              {OER_AGE_BANDS.map((band) => (
                                <td key={`${option.value}-${band.value}`}>
                                  {OER_TEMPLATES[option.value][band.value].exclTax}%
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {oerModeValue === "SIMPLE" ? (
                      <div className="form-grid three-col compact">
                        <div>
                          {renderLabel("運営経費率 (%)", "operatingExpenseRate")}
                          <input
                            type="number"
                            value={displayPercent(formData.operatingExpenseRate)}
                            className={
                              isAutoFilled("operatingExpenseRate") ? "auto-input" : undefined
                            }
                            onChange={(e) =>
                              handleChange("operatingExpenseRate", Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="oer-summary">
                          <div>
                            年間運営経費: {(oerPreview.total / 10000).toLocaleString()} 万円
                          </div>
                          <div>OER(満室): {oerPreview.oerGpr.toFixed(1)}%</div>
                          <div>実効OER: {oerPreview.oerEgi.toFixed(1)}%</div>
                        </div>
                        <div className="oer-detail">
                          <div className="oer-detail-block">
                            <div className="oer-detail-head">
                              <span>率で計算</span>
                              <button
                                type="button"
                                className="section-toggle"
                                onClick={addOerRateItem}
                              >
                                追加
                              </button>
                            </div>
                            {oerRateItems.length === 0 ? (
                              <p className="form-note">内訳が未設定です。</p>
                            ) : (
                              oerRateItems.map((item) => (
                                <div className="oer-item-row rate" key={item.id}>
                                  <input
                                    type="text"
                                    value={item.label}
                                    aria-label="費目名"
                                    title={getInputHelpText("oerRateItemLabel", "費目名")}
                                    onChange={(e) =>
                                      updateOerRateItem(item.id, { label: e.target.value })
                                    }
                                  />
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={Number.isFinite(item.rate) ? item.rate : 0}
                                    aria-label="率"
                                    title={getInputHelpText("oerRateItemRate", "率")}
                                    onChange={(e) =>
                                      updateOerRateItem(item.id, {
                                        rate: Number(e.target.value),
                                      })
                                    }
                                  />
                                  <select
                                    value={item.base}
                                    aria-label="基準"
                                    title={getInputHelpText("oerRateItemBase", "基準")}
                                    onChange={(e) =>
                                      updateOerRateItem(item.id, {
                                        base: e.target.value as OerRateItem["base"],
                                      })
                                    }
                                  >
                                    <option value="GPR">満室</option>
                                    <option value="EGI">稼働後</option>
                                  </select>
                                  <label className="inline-label">
                                    <input
                                      type="checkbox"
                                      checked={item.enabled}
                                      aria-label="有効"
                                      onChange={(e) =>
                                        updateOerRateItem(item.id, { enabled: e.target.checked })
                                      }
                                    />
                                    有効
                                    {renderInfoButton("oerRateItemEnabled", "有効")}
                                  </label>
                                  <button
                                    type="button"
                                    className="section-toggle"
                                    onClick={() => removeOerItem("oerRateItems", item.id)}
                                  >
                                    削除
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="oer-detail-block">
                            <div className="oer-detail-head">
                              <span>固定費 (年額)</span>
                              <button
                                type="button"
                                className="section-toggle"
                                onClick={addOerFixedItem}
                              >
                                追加
                              </button>
                            </div>
                            {oerFixedItems.length === 0 ? (
                              <p className="form-note">固定費が未設定です。</p>
                            ) : (
                              oerFixedItems.map((item) => (
                                <div className="oer-item-row fixed" key={item.id}>
                                  <input
                                    type="text"
                                    value={item.label}
                                    aria-label="固定費名"
                                    title={getInputHelpText("oerFixedItemLabel", "固定費名")}
                                    onChange={(e) =>
                                      updateOerFixedItem(item.id, { label: e.target.value })
                                    }
                                  />
                                  <input
                                    type="number"
                                    value={
                                      Number.isFinite(item.annualAmount)
                                        ? item.annualAmount / 10000
                                        : 0
                                    }
                                    aria-label="年額"
                                    title={getInputHelpText("oerFixedItemAmount", "年額")}
                                    onChange={(e) =>
                                      updateOerFixedItem(item.id, {
                                        annualAmount: Number(e.target.value) * 10000,
                                      })
                                    }
                                  />
                                  <span className="oer-unit">万円/年</span>
                                  <label className="inline-label">
                                    <input
                                      type="checkbox"
                                      checked={item.enabled}
                                      aria-label="有効"
                                      onChange={(e) =>
                                        updateOerFixedItem(item.id, { enabled: e.target.checked })
                                      }
                                    />
                                    有効
                                    {renderInfoButton("oerFixedItemEnabled", "有効")}
                                  </label>
                                  <button
                                    type="button"
                                    className="section-toggle"
                                    onClick={() => removeOerItem("oerFixedItems", item.id)}
                                  >
                                    削除
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="oer-detail-block">
                            <div className="oer-detail-head">
                              <span>イベント (平準化/ドカン)</span>
                              <button
                                type="button"
                                className="section-toggle"
                                onClick={addOerEventItem}
                              >
                                追加
                              </button>
                            </div>
                            {oerEventItems.length === 0 ? (
                              <p className="form-note">イベントが未設定です。</p>
                            ) : (
                              oerEventItems.map((item) => (
                                <div className="oer-item-row event" key={item.id}>
                                  <input
                                    type="text"
                                    value={item.label}
                                    aria-label="イベント名"
                                    title={getInputHelpText("oerEventItemLabel", "イベント名")}
                                    onChange={(e) =>
                                      updateOerEventItem(item.id, { label: e.target.value })
                                    }
                                  />
                                  <input
                                    type="number"
                                    value={Number.isFinite(item.amount) ? item.amount / 10000 : 0}
                                    aria-label="金額"
                                    title={getInputHelpText("oerEventItemAmount", "金額")}
                                    onChange={(e) =>
                                      updateOerEventItem(item.id, {
                                        amount: Number(e.target.value) * 10000,
                                      })
                                    }
                                  />
                                  <input
                                    type="number"
                                    value={item.intervalYears}
                                    aria-label="周期"
                                    title={getInputHelpText("oerEventItemInterval", "周期")}
                                    onChange={(e) =>
                                      updateOerEventItem(item.id, {
                                        intervalYears: Number(e.target.value),
                                      })
                                    }
                                  />
                                  <select
                                    value={item.mode}
                                    aria-label="方式"
                                    title={getInputHelpText("oerEventItemMode", "方式")}
                                    onChange={(e) =>
                                      updateOerEventItem(item.id, {
                                        mode: e.target.value as OerEventItem["mode"],
                                      })
                                    }
                                  >
                                    <option value="RESERVE">平準化</option>
                                    <option value="CASH">発生年</option>
                                  </select>
                                  <label className="inline-label">
                                    <input
                                      type="checkbox"
                                      checked={item.enabled}
                                      aria-label="有効"
                                      onChange={(e) =>
                                        updateOerEventItem(item.id, { enabled: e.target.checked })
                                      }
                                    />
                                    有効
                                    {renderInfoButton("oerEventItemEnabled", "有効")}
                                  </label>
                                  <button
                                    type="button"
                                    className="section-toggle"
                                    onClick={() => removeOerItem("oerEventItems", item.id)}
                                  >
                                    削除
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="oer-detail-block">
                            <div className="oer-detail-head">
                              <span>リーシング費 (AD/仲介)</span>
                            </div>
                            <div className="form-grid compact oer-leasing-grid">
                              <div>
                                {renderHelpLabel("費用(月数)", "oerLeasingMonths")}
                                <input
                                  type="number"
                                  step="0.1"
                                  value={oerLeasingMonthsValue}
                                  disabled={!oerLeasingEnabledValue}
                                  onChange={(e) =>
                                    handleChange("oerLeasingMonths", Number(e.target.value))
                                  }
                                />
                              </div>
                              <div>
                                {renderHelpLabel("平均居住年数", "oerLeasingTenancyYears")}
                                <input
                                  type="number"
                                  step="0.1"
                                  value={oerLeasingTenancyYearsValue}
                                  disabled={!oerLeasingEnabledValue}
                                  onChange={(e) =>
                                    handleChange("oerLeasingTenancyYears", Number(e.target.value))
                                  }
                                />
                              </div>
                            </div>
                            <p className="form-note">
                              年換算: {oerLeasingRate.toFixed(1)}%（満室家賃換算）
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>
                </div>
                <div className="form-input-right-col">
            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">初期費用設定（購入時）</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("initial")}
                  aria-expanded={openPanels.initial}
                >
                  {openPanels.initial ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.initial ? (
                <>
                  <div className="form-grid three-col compact">
                    <div>
                      {renderLabel("水道分担金率 (%)", "waterContributionRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(waterContributionRate)}
                        className={isAutoFilled("waterContributionRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("waterContributionRate", Number(e.target.value))}
                      />
                      {!isPristine && waterContribution > 0 ? (
                        <p className="form-note">{(waterContribution / 10000).toLocaleString()} 万円</p>
                      ) : null}
                    </div>
                    <div>
                      {renderLabel("火災保険率 (%)", "fireInsuranceRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(fireInsuranceRate)}
                        className={isAutoFilled("fireInsuranceRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("fireInsuranceRate", Number(e.target.value))}
                      />
                      {!isPristine && fireInsurance > 0 ? (
                        <p className="form-note">{(fireInsurance / 10000).toLocaleString()} 万円</p>
                      ) : null}
                    </div>
                    <div>
                      {renderLabel("登記費用率 (%)", "registrationCostRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(registrationCostRate)}
                        className={isAutoFilled("registrationCostRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("registrationCostRate", Number(e.target.value))}
                      />
                      {!isPristine && registrationCost > 0 ? (
                        <p className="form-note">{(registrationCost / 10000).toLocaleString()} 万円</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="form-grid three-col compact">
                    <div>
                      {renderLabel("融資手数料率 (%)", "loanFeeRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(loanFeeRate)}
                        className={isAutoFilled("loanFeeRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("loanFeeRate", Number(e.target.value))}
                      />
                      {!isPristine && loanFee > 0 ? (
                        <p className="form-note">{(loanFee / 10000).toLocaleString()} 万円</p>
                      ) : null}
                    </div>
                    <div>
                      {renderLabel("その他諸費用率 (%)", "miscCostRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(miscCostRate)}
                        className={isAutoFilled("miscCostRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("miscCostRate", Number(e.target.value))}
                      />
                      {!isPristine && miscCost > 0 ? (
                        <p className="form-note">{(miscCost / 10000).toLocaleString()} 万円</p>
                      ) : null}
                    </div>
                  </div>
                  {!isPristine && estimatedTotal > 0 ? (
                    <p className="form-note">
                      初期費用合計: {(initialCostsTotal / 10000).toLocaleString()} 万円 / 購入総額:{" "}
                      {(estimatedTotal / 10000).toLocaleString()} 万円
                    </p>
                  ) : null}
                  <div className="form-grid two-col compact">
                    <div>
                      {renderLabel("不動産取得税率 (%)", "acquisitionTaxRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(acquisitionTaxRate)}
                        className={isAutoFilled("acquisitionTaxRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("acquisitionTaxRate", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      {renderLabel("土地評価圧縮率 (%)", "acquisitionLandReductionRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(acquisitionLandReductionRate)}
                        className={isAutoFilled("acquisitionLandReductionRate") ? "auto-input" : undefined}
                        onChange={(e) =>
                          handleChange("acquisitionLandReductionRate", Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                  {!isPristine && acquisitionTaxEstimate > 0 ? (
                    <p className="form-note">
                      不動産取得税（翌年計上）: {(acquisitionTaxEstimate / 10000).toLocaleString()} 万円
                    </p>
                  ) : null}
                  <div className="form-divider" />
                  <div className="form-subtitle">固定資産税・都市計画税パラメータ</div>
                  <div className="form-grid two-col compact">
                    <div>
                      {renderLabel("土地評価率 (%)", "landEvaluationRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(landEvaluationRate)}
                        className={isAutoFilled("landEvaluationRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("landEvaluationRate", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      {renderLabel("建物評価率 (%)", "buildingEvaluationRate")}
                      <input
                        type="number"
                        step="0.1"
                        value={displayPercent(buildingEvaluationRate)}
                        className={isAutoFilled("buildingEvaluationRate") ? "auto-input" : undefined}
                        onChange={(e) =>
                          handleChange("buildingEvaluationRate", Number(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      {renderLabel("住宅用地特例 (%)", "landTaxReductionRate")}
                      <input
                        type="number"
                        step="0.01"
                        value={displayPercent(landTaxReductionRate)}
                        className={isAutoFilled("landTaxReductionRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("landTaxReductionRate", Number(e.target.value))}
                      />
                      <p className="form-note">※1/6なら16.67%</p>
                    </div>
                    <div>
                      {renderLabel("固定資産税・都市計画税率 (%)", "propertyTaxRate")}
                      <input
                        type="number"
                        step="0.01"
                        value={displayPercent(propertyTaxRate)}
                        className={isAutoFilled("propertyTaxRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("propertyTaxRate", Number(e.target.value))}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>
                </div>
                <div className="form-input-right-col">
            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">修繕・空室設定</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("repair")}
                  aria-expanded={openPanels.repair}
                >
                  {openPanels.repair ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.repair ? (
                <>
                  <div className="form-grid two-col compact">
                    <div>
                      {renderHelpLabel("空室モデル", "vacancyModel")}
                      <select
                        value={vacancyModel}
                        onChange={(e) => handleChange("vacancyModel", e.target.value)}
                      >
                        <option value="FIXED">固定（入居率のみ）</option>
                        <option value="CYCLE">周期モデル</option>
                        <option value="PROBABILITY">確率モデル</option>
                      </select>
                    </div>
                    <div>
                      {renderLabel("入居率 (%)", "occupancyRate")}
                      <input
                        type="number"
                        value={displayPercent(occupancyRateValue)}
                        className={isAutoFilled("occupancyRate") ? "auto-input" : undefined}
                        onChange={(e) => handleChange("occupancyRate", Number(e.target.value))}
                      />
                      <p className="form-note">空室モデルは入居率に上乗せで反映</p>
                    </div>
                  </div>
                  {vacancyModel === "CYCLE" ? (
                    <div className="form-grid two-col compact">
                      <div>
                        {renderLabel("空室周期 (年)", "vacancyCycleYears")}
                        <input
                          type="number"
                          value={displayValue(vacancyCycleYears)}
                          className={isAutoFilled("vacancyCycleYears") ? "auto-input" : undefined}
                          onChange={(e) => handleChange("vacancyCycleYears", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        {renderLabel("空室月数", "vacancyCycleMonths")}
                        <input
                          type="number"
                          value={displayValue(vacancyCycleMonths)}
                          className={isAutoFilled("vacancyCycleMonths") ? "auto-input" : undefined}
                          onChange={(e) =>
                            handleChange("vacancyCycleMonths", Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  {vacancyModel === "PROBABILITY" ? (
                    <div className="form-grid two-col compact">
                      <div>
                        {renderLabel("年間空室確率 (%)", "vacancyProbability")}
                        <input
                          type="number"
                          step="0.1"
                          value={displayPercent(vacancyProbability)}
                          className={isAutoFilled("vacancyProbability") ? "auto-input" : undefined}
                          onChange={(e) =>
                            handleChange("vacancyProbability", Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        {renderLabel("空室月数", "vacancyProbabilityMonths")}
                        <input
                          type="number"
                          value={displayValue(vacancyProbabilityMonths)}
                          className={isAutoFilled("vacancyProbabilityMonths") ? "auto-input" : undefined}
                          onChange={(e) =>
                            handleChange("vacancyProbabilityMonths", Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="repair-block">
                    <div className="inline-toggle form-split-row">
                      {renderHelpLabel("修繕イベント", "repairEvents")}
                      <button type="button" className="section-toggle" onClick={addRepairEvent}>
                        追加
                      </button>
                    </div>
                    {repairEvents.length === 0 ? (
                      <p className="form-note">修繕イベントが未登録です。</p>
                    ) : (
                      repairEvents.map((event, index) => (
                        <div key={`${event.year}-${index}`} className="repair-row">
                          <div className="form-grid three-col">
                            <div>
                              {renderHelpLabel("年", "repairEventYear")}
                              <input
                                type="number"
                                value={event.year}
                                onChange={(e) =>
                                  updateRepairEvent(index, "year", Number(e.target.value))
                                }
                              />
                            </div>
                            <div>
                              {renderHelpLabel("金額 (万円)", "repairEventAmount")}
                              <input
                                type="number"
                                value={event.amount / 10000}
                                onChange={(e) =>
                                  updateRepairEvent(index, "amount", Number(e.target.value) * 10000)
                                }
                              />
                            </div>
                            <div>
                              {renderHelpLabel("内容", "repairEventLabel")}
                              <input
                                type="text"
                                value={event.label ?? ""}
                                onChange={(e) => updateRepairEvent(index, "label", e.target.value)}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="section-toggle"
                            onClick={() => removeRepairEvent(index)}
                          >
                            削除
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="form-divider" />
                  <div className="form-subtitle">リスクシナリオ比較</div>
                    <div className="inline-toggle form-split-row">
                      <div className="inline-toggle">
                        <input
                          type="checkbox"
                          id="scenarioEnabled"
                          checked={formData.scenarioEnabled}
                          onChange={(e) => handleChange("scenarioEnabled", e.target.checked)}
                        />
                        <label htmlFor="scenarioEnabled" className="inline-label">
                          有効にする
                          {renderInfoButton("scenarioEnabled", "有効にする")}
                        </label>
                      </div>
                    </div>
                  <p className="form-note">
                    金利上昇・家賃下落カーブ・入居率悪化を組み合わせたストレスシナリオを比較します。
                  </p>
                  {formData.scenarioEnabled ? (
                    <>
                      <div className="form-grid three-col compact">
                        <div>
                          {renderHelpLabel("金利上昇年", "scenarioInterestShockYear")}
                          <input
                            type="number"
                            value={displayValue(scenarioInterestShockYear)}
                            onChange={(e) =>
                              handleChange("scenarioInterestShockYear", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          {renderHelpLabel("金利上昇幅 (%)", "scenarioInterestShockDelta")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(scenarioInterestShockDelta)}
                            onChange={(e) =>
                              handleChange("scenarioInterestShockDelta", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          {renderHelpLabel("家賃下落カーブ", "scenarioRentCurveEnabled")}
                          <div className="inline-toggle">
                            <input
                              type="checkbox"
                              id="scenarioRentCurve"
                              checked={formData.scenarioRentCurveEnabled}
                              onChange={(e) =>
                                handleChange("scenarioRentCurveEnabled", e.target.checked)
                              }
                            />
                            <label htmlFor="scenarioRentCurve" className="inline-label">
                              有効
                              {renderInfoButton("scenarioRentCurveEnabled", "有効")}
                            </label>
                          </div>
                        </div>
                      </div>
                      {formData.scenarioRentCurveEnabled ? (
                        <div className="form-grid three-col compact">
                          <div>
                            {renderHelpLabel("初期下落率 (2年ごと/%)", "scenarioRentDeclineEarlyRate")}
                            <input
                              type="number"
                              step="0.1"
                              value={displayPercent(scenarioRentDeclineEarlyRate)}
                              onChange={(e) =>
                                handleChange("scenarioRentDeclineEarlyRate", Number(e.target.value))
                              }
                            />
                          </div>
                          <div>
                            {renderHelpLabel("後半下落率 (2年ごと/%)", "scenarioRentDeclineLateRate")}
                            <input
                              type="number"
                              step="0.1"
                              value={displayPercent(scenarioRentDeclineLateRate)}
                              onChange={(e) =>
                                handleChange("scenarioRentDeclineLateRate", Number(e.target.value))
                              }
                            />
                          </div>
                          <div>
                            {renderHelpLabel("切替年", "scenarioRentDeclineSwitchYear")}
                            <input
                              type="number"
                              value={displayValue(scenarioRentDeclineSwitchYear)}
                              onChange={(e) =>
                                handleChange("scenarioRentDeclineSwitchYear", Number(e.target.value))
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="form-grid three-col compact">
                        <div>
                          {renderHelpLabel("入居率悪化", "scenarioOccupancyDeclineEnabled")}
                          <div className="inline-toggle">
                            <input
                              type="checkbox"
                              id="scenarioOccupancy"
                              checked={formData.scenarioOccupancyDeclineEnabled}
                              onChange={(e) =>
                                handleChange("scenarioOccupancyDeclineEnabled", e.target.checked)
                              }
                            />
                            <label htmlFor="scenarioOccupancy" className="inline-label">
                              有効
                              {renderInfoButton("scenarioOccupancyDeclineEnabled", "有効")}
                            </label>
                          </div>
                        </div>
                        <div>
                          {renderHelpLabel("悪化開始年", "scenarioOccupancyDeclineStartYear")}
                          <input
                            type="number"
                            value={displayValue(scenarioOccupancyDeclineStartYear)}
                            onChange={(e) =>
                              handleChange(
                                "scenarioOccupancyDeclineStartYear",
                                Number(e.target.value)
                              )
                            }
                          />
                        </div>
                        <div>
                          {renderHelpLabel("入居率低下幅 (%)", "scenarioOccupancyDeclineDelta")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(scenarioOccupancyDeclineDelta)}
                            onChange={(e) =>
                              handleChange("scenarioOccupancyDeclineDelta", Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            {/* --- 3. 高度な設定（常時表示） --- */}
            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">高度な設定</h3>
              </div>
              {/* 設備分離設定 [cite: 666-667] */}
              <div className="form-advanced-section">
                <div className="inline-toggle form-split-row">
                  {renderHelpLabel("減価償却の設備分離", "enableEquipmentSplit")}
                  <div className="inline-toggle">
                      <input
                        type="checkbox"
                        id="equipmentSplit"
                        checked={formData.enableEquipmentSplit}
                        onChange={(e) => handleChange("enableEquipmentSplit", e.target.checked)}
                      />
                      <label htmlFor="equipmentSplit" className="inline-label">
                        有効にする
                        {renderInfoButton("enableEquipmentSplit", "有効にする")}
                      </label>
                    </div>
                  </div>
                  <p className="form-note">
                    建物価格の一部を「設備（耐用年数15年）」として計算し、初期の節税効果を高めます。
                  </p>
                  {formData.enableEquipmentSplit ? (
                    <>
                      <div className="form-grid two-col">
                        <div>
                          {renderHelpLabel("設備比率 (%)", "equipmentRatio")}
                          <input
                            type="number"
                            value={displayPercent(formData.equipmentRatio)}
                            onChange={(e) => handleChange("equipmentRatio", Number(e.target.value))}
                          />
                        </div>
                        <div>
                          {renderHelpLabel("設備耐用年数 (年)", "equipmentUsefulLife")}
                          <input
                            type="number"
                            value={displayValue(equipmentUsefulLifeValue)}
                            onChange={(e) =>
                              handleChange("equipmentUsefulLife", Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                      <div className="form-note">推奨値: RCなら20〜30%、設備は15年目安</div>
                    </>
                  ) : null}
              </div>

              {/* 税務設定 [cite: 670-671] */}
              <div className="form-advanced-section">
                  {renderHelpLabel("税務モード", "taxType")}
                  <div className="form-grid two-col">
                    <label className="inline-label">
                      <input
                        type="radio"
                        name="taxType"
                        value="INDIVIDUAL"
                        checked={formData.taxType === "INDIVIDUAL"}
                        onChange={() => handleChange("taxType", "INDIVIDUAL")}
                      />
                      <span>個人 (累進課税)</span>
                      {renderInfoButton("taxTypeIndividual", "個人 (累進課税)")}
                    </label>
                    <label className="inline-label">
                      <input
                        type="radio"
                        name="taxType"
                        value="CORPORATE"
                        checked={formData.taxType === "CORPORATE"}
                        onChange={() => handleChange("taxType", "CORPORATE")}
                      />
                      <span>法人 (実効税率+均等割)</span>
                      {renderInfoButton("taxTypeCorporate", "法人 (実効税率+均等割)")}
                    </label>
                  </div>
                  <div className="form-grid two-col">
                    <div>
                      {renderHelpLabel("他所得 (給与など/万円)", "otherIncome")}
                      <input
                        type="number"
                        value={displayValue(otherIncomeValue, 10000)}
                        onChange={(e) =>
                          handleChange("otherIncome", Number(e.target.value) * 10000)
                        }
                      />
                      <p className="form-note">累進課税 + 住民税10%で計算</p>
                    </div>
                    <div>
                      {renderHelpLabel("法人均等割 (万円/年)", "corporateMinimumTax")}
                      <input
                        type="number"
                        value={displayValue(corporateMinimumTaxValue, 10000)}
                        onChange={(e) =>
                          handleChange("corporateMinimumTax", Number(e.target.value) * 10000)
                        }
                      />
                      <p className="form-note">※法人モードのみ適用</p>
                    </div>
                  </div>
              </div>

              {/* 出口戦略（売却） */}
              <div className="form-advanced-section">
                  <div className="inline-toggle form-split-row">
                    {renderHelpLabel("出口戦略（売却）", "exitEnabled")}
                    <div className="inline-toggle">
                      <input
                        type="checkbox"
                        id="exitEnabled"
                        checked={formData.exitEnabled}
                        onChange={(e) => handleChange("exitEnabled", e.target.checked)}
                      />
                      <label htmlFor="exitEnabled" className="inline-label">
                        有効にする
                        {renderInfoButton("exitEnabled", "有効にする")}
                      </label>
                    </div>
                  </div>
                  <p className="form-note">
                    売却年のNOIをキャップレートで割り戻して価格を算出します。
                  </p>
                  {formData.exitEnabled ? (
                    <>
                      <div className="form-grid two-col">
                        <div>
                          {renderHelpLabel("売却年数 (年)", "exitYear")}
                          <input
                            type="number"
                            value={displayValue(exitYearValue)}
                            onChange={(e) => handleChange("exitYear", Number(e.target.value))}
                          />
                        </div>
                        <div>
                          {renderHelpLabel("想定キャップレート (%)", "exitCapRate")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(exitCapRateValue)}
                            onChange={(e) => handleChange("exitCapRate", Number(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="form-grid two-col">
                        <div>
                          {renderHelpLabel("仲介手数料率 (%)", "exitBrokerageRate")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(exitBrokerageRateValue)}
                            onChange={(e) =>
                              handleChange("exitBrokerageRate", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          {renderHelpLabel("仲介手数料 (定額/万円)", "exitBrokerageFixed")}
                          <input
                            type="number"
                            value={displayValue(exitBrokerageFixedValue, 10000)}
                            onChange={(e) =>
                              handleChange("exitBrokerageFixed", Number(e.target.value) * 10000)
                            }
                          />
                        </div>
                      </div>
                      <div className="form-grid two-col">
                        <div>
                          {renderHelpLabel("その他売却コスト率 (%)", "exitOtherCostRate")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(exitOtherCostRateValue)}
                            onChange={(e) => handleChange("exitOtherCostRate", Number(e.target.value))}
                          />
                          <p className="form-note">修繕・測量・登記などの概算</p>
                        </div>
                        <div>
                          {renderHelpLabel("NPV割引率 (%)", "exitDiscountRate")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(exitDiscountRateValue)}
                            onChange={(e) => handleChange("exitDiscountRate", Number(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="form-grid two-col">
                        <div>
                          {renderHelpLabel("短期譲渡税率 (%)", "exitShortTermTaxRate")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(exitShortTermTaxRateValue)}
                            onChange={(e) =>
                              handleChange("exitShortTermTaxRate", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          {renderHelpLabel("長期譲渡税率 (%)", "exitLongTermTaxRate")}
                          <input
                            type="number"
                            step="0.1"
                            value={displayPercent(exitLongTermTaxRateValue)}
                            onChange={(e) =>
                              handleChange("exitLongTermTaxRate", Number(e.target.value))
                            }
                          />
                          <p className="form-note">5年超で長期を適用</p>
                        </div>
                      </div>
                    </>
                  ) : null}
              </div>
            </div>
                </div>
              </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
