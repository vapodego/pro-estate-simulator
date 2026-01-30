// 物件構造の定義 [cite: 645-648]
export type StructureType = 'RC' | 'SRC' | 'S_HEAVY' | 'S_LIGHT' | 'WOOD';

// 構造ごとの法定耐用年数マスターデータ [cite: 646-648]
export const LEGAL_USEFUL_LIFE: Record<StructureType, number> = {
  RC: 47,       // 鉄筋コンクリート
  SRC: 47,      // 鉄骨鉄筋コンクリート
  S_HEAVY: 34,  // 重量鉄骨（肉厚4mm超）
  S_LIGHT: 19,  // 軽量鉄骨（肉厚3mm以下 ※安全側で設定）
  WOOD: 22,     // 木造
};

export type VacancyModelType = 'FIXED' | 'CYCLE' | 'PROBABILITY';

export interface RepairEvent {
  year: number;
  amount: number;
  label?: string;
}

export type OerBaseType = 'GPR' | 'EGI';
export type OerMode = 'SIMPLE' | 'DETAILED';
export type OerEventMode = 'RESERVE' | 'CASH';

export interface OerRateItem {
  id: string;
  label: string;
  rate: number;
  base: OerBaseType;
  enabled: boolean;
}

export interface OerFixedItem {
  id: string;
  label: string;
  annualAmount: number;
  enabled: boolean;
}

export interface OerEventItem {
  id: string;
  label: string;
  amount: number;
  intervalYears: number;
  startYear: number;
  mode: OerEventMode;
  enabled: boolean;
}

// 入力データの型定義
export interface PropertyInput {
  price: number;              // 物件価格（本体: 建物+土地）
  buildingRatio: number;      // 建物比率（%）
  miscCostRate: number;       // 諸費用率（%）
  landEvaluationRate: number; // 土地評価率（%）
  buildingEvaluationRate: number; // 建物評価率（%）
  landTaxReductionRate: number; // 住宅用地特例（%）
  propertyTaxRate: number;    // 固定資産税率（%）
  structure: StructureType;   // 構造
  buildingAge: number;        // 築年数
  
  // 【重要機能】設備分離設定 [cite: 667]
  enableEquipmentSplit: boolean; // 設備分離をするか
  equipmentRatio: number;        // 設備比率（例: 20%）
  equipmentUsefulLife: number;   // 設備耐用年数（年）

  // 初期費用（率入力）
  waterContributionRate: number;   // 水道分担金（%）
  fireInsuranceRate: number;       // 火災保険料（建物価格に対する%）
  loanFeeRate: number;             // 融資手数料（借入額に対する%）
  registrationCostRate: number;    // 登記費用（%）
  acquisitionTaxRate: number;      // 不動産取得税率（%）
  acquisitionLandReductionRate: number; // 取得税の土地評価圧縮率（%）

  // 融資設定
  equityRatio: number;       // 自己資金（%）
  loanAmount: number;         // 借入金額
  interestRate: number;       // 金利（%）
  loanDuration: number;       // 借入期間（年）

  // 収支設定
  monthlyRent: number;        // 家賃収入（月額）
  occupancyRate: number;      // 入居率（%）
  rentDeclineRate: number;    // 家賃下落率（2年ごと/%）
  unitCount: number;          // 戸数（清掃・管理の目安）
  cleaningVisitsPerMonth: number; // 清掃回数（月）
  operatingExpenseRate: number; // 運営経費率（%）
  oerMode: OerMode;           // 運営経費の計算モード
  oerRateItems: OerRateItem[]; // 運営経費(率)
  oerFixedItems: OerFixedItem[]; // 運営経費(固定)
  oerEventItems: OerEventItem[]; // 運営経費(イベント)
  oerLeasingEnabled: boolean; // リーシング費を含める
  oerLeasingMonths: number;   // リーシング費(月数)
  oerLeasingTenancyYears: number; // 平均居住年数

  // 修繕・空室モデル
  repairEvents: RepairEvent[]; // 修繕イベント（年・金額）
  vacancyModel: VacancyModelType; // 空室モデル
  vacancyCycleYears: number;      // 周期モデル: 周期年数
  vacancyCycleMonths: number;     // 周期モデル: 空室月数
  vacancyProbability: number;     // 確率モデル: 年間確率（%）
  vacancyProbabilityMonths: number; // 確率モデル: 空室月数

  // 税務設定
  taxType: 'INDIVIDUAL' | 'CORPORATE'; // 個人か法人か [cite: 670-671]
  incomeTaxRate: number;      // 所得税率（%）
  otherIncome: number;        // 給与所得など（個人の場合）
  corporateMinimumTax: number; // 法人の均等割（年額）

  // リスクシナリオ設定
  scenarioEnabled: boolean;           // シナリオ比較を有効化
  scenarioInterestShockYear: number;  // 金利上昇年
  scenarioInterestShockDelta: number; // 金利上昇幅（%）
  scenarioRentCurveEnabled: boolean;  // 家賃下落カーブを有効化
  scenarioRentDeclineEarlyRate: number; // 初期家賃下落率（2年ごと/%）
  scenarioRentDeclineLateRate: number;  // 後半家賃下落率（2年ごと/%）
  scenarioRentDeclineSwitchYear: number; // 下落率の切替年
  scenarioOccupancyDeclineEnabled: boolean; // 空室悪化を有効化
  scenarioOccupancyDeclineStartYear: number; // 空室悪化開始年
  scenarioOccupancyDeclineDelta: number; // 入居率低下幅（%）

  // 出口戦略（売却）
  exitEnabled: boolean;       // 売却シミュレーションを有効にするか
  exitYear: number;           // 売却年数
  exitCapRate: number;        // 想定利回り（キャップレート/%）
  exitBrokerageRate: number;  // 仲介手数料率（%）
  exitBrokerageFixed: number; // 仲介手数料（定額）
  exitOtherCostRate: number;  // 売却時のその他コスト率（%）
  exitShortTermTaxRate: number; // 短期譲渡税率（%）
  exitLongTermTaxRate: number;  // 長期譲渡税率（%）
  exitDiscountRate: number;   // NPV割引率（%）
}

export interface ScenarioConfig {
  interestRateShockEnabled: boolean;
  interestRateShockYear: number;
  interestRateShockDelta: number;
  rentCurveEnabled: boolean;
  rentDeclineEarlyRate: number;
  rentDeclineLateRate: number;
  rentDeclineSwitchYear: number;
  occupancyDeclineEnabled: boolean;
  occupancyDeclineStartYear: number;
  occupancyDeclineDelta: number;
}

// 年ごとのシミュレーション結果型
export interface YearlyResult {
  year: number;               // 年数（1年目〜）
  grossPotentialRent: number; // 満室想定家賃（GPI）
  income: number;             // 家賃収入（空室考慮後）
  expense: number;            // 運営経費
  propertyTax: number;        // 固定資産税（概算）
  repairCost: number;         // 修繕費（イベント）
  
  // 借入返済
  loanPaymentTotal: number;   // 返済総額
  loanInterest: number;       // うち利息（経費になる）
  loanPrincipal: number;      // うち元金（経費にならない）
  loanBalance: number;        // 年末借入残高

  // 減価償却 
  depreciationBody: number;      // 躯体償却費
  depreciationEquipment: number; // 設備償却費
  depreciationTotal: number;     // 償却費合計

  // 税務計算
  taxableIncome: number;      // 課税所得
  taxAmount: number;          // 所得税・住民税（または法人税）
  
  // キャッシュフロー [cite: 626]
  cashFlowPreTax: number;     // 税引前CF
  cashFlowPostTax: number;    // 税引後CF

  acquisitionTax: number;     // 不動産取得税（翌年計上）
  
  // 指標
  isDeadCross: boolean;       // デッドクロス発生中か（元金返済 > 減価償却） 
}
