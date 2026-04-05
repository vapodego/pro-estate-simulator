import {
  DevelopmentSiteConditionKey,
  LEGAL_USEFUL_LIFE,
  PropertyInput,
  StructureType,
  VacancyModelType,
} from "./types";

const BUILDING_RATIO_TABLE: Record<StructureType, { maxAge: number; ratio: number }[]> = {
  RC: [
    { maxAge: 5, ratio: 70 },
    { maxAge: 15, ratio: 60 },
    { maxAge: 25, ratio: 50 },
    { maxAge: 35, ratio: 40 },
    { maxAge: Number.POSITIVE_INFINITY, ratio: 30 },
  ],
  SRC: [
    { maxAge: 5, ratio: 70 },
    { maxAge: 15, ratio: 60 },
    { maxAge: 25, ratio: 50 },
    { maxAge: 35, ratio: 40 },
    { maxAge: Number.POSITIVE_INFINITY, ratio: 30 },
  ],
  S_HEAVY: [
    { maxAge: 5, ratio: 65 },
    { maxAge: 15, ratio: 55 },
    { maxAge: 25, ratio: 45 },
    { maxAge: 35, ratio: 35 },
    { maxAge: Number.POSITIVE_INFINITY, ratio: 25 },
  ],
  S_LIGHT: [
    { maxAge: 5, ratio: 55 },
    { maxAge: 15, ratio: 45 },
    { maxAge: 25, ratio: 35 },
    { maxAge: 35, ratio: 25 },
    { maxAge: Number.POSITIVE_INFINITY, ratio: 15 },
  ],
  WOOD: [
    { maxAge: 5, ratio: 50 },
    { maxAge: 15, ratio: 40 },
    { maxAge: 25, ratio: 30 },
    { maxAge: 35, ratio: 20 },
    { maxAge: Number.POSITIVE_INFINITY, ratio: 10 },
  ],
};

const INTEREST_RATE_TABLE: Record<StructureType, number> = {
  RC: 1.6,
  SRC: 1.6,
  S_HEAVY: 1.8,
  S_LIGHT: 2.0,
  WOOD: 2.2,
};

const OPERATING_EXPENSE_TABLE: Record<StructureType, number> = {
  RC: 15,
  SRC: 15,
  S_HEAVY: 17,
  S_LIGHT: 20,
  WOOD: 22,
};

const normalizeAge = (age?: number) =>
  Number.isFinite(age) ? Math.max(0, Math.floor(age as number)) : null;

const LOAN_DURATION_BONUS: Record<StructureType, number> = {
  RC: 8,
  SRC: 8,
  S_HEAVY: 10,
  S_LIGHT: 12,
  WOOD: 15,
};

type DevelopmentAutoFillKey =
  | "developmentSoftCost"
  | "developmentOtherCost"
  | "developmentContingencyRate"
  | "developmentConstructionMonths"
  | "developmentLeaseUpMonths"
  | "developmentInterestOnlyMonths";

type TokyoRcDevelopmentBand = {
  baseConstructionMonths: number;
  contingencyRatePercent: number;
  maxConstructionCostJpy: number;
  otherCostRatePercent: number;
  softCostRatePercent: number;
};

type TokyoRcLeaseUpBand = {
  leaseUpMonths: number;
  maxUnitCount: number;
};

type TokyoRcSiteConditionRule = {
  constructionMonthsAdd: number;
  otherCostRatePercentAdd: number;
};

const TOKYO_RC_DEFAULT_CONSTRUCTION_COST_JPY = 350_000_000;
const TOKYO_RC_DEFAULT_UNIT_COUNT = 24;
const TOKYO_RC_INTEREST_ONLY_BUFFER_MONTHS = 2;
const DEVELOPMENT_SITE_CONDITION_KEYS: DevelopmentSiteConditionKey[] = [
  "siteConditionDemolition",
  "siteConditionRetainingWall",
  "siteConditionGroundImprovement",
  "siteConditionBasement",
  "siteConditionLogisticsConstraint",
];

const TOKYO_RC_DEVELOPMENT_BANDS: TokyoRcDevelopmentBand[] = [
  {
    maxConstructionCostJpy: 150_000_000,
    softCostRatePercent: 8.0,
    otherCostRatePercent: 3.5,
    contingencyRatePercent: 6.0,
    baseConstructionMonths: 9,
  },
  {
    maxConstructionCostJpy: 300_000_000,
    softCostRatePercent: 7.5,
    otherCostRatePercent: 4.0,
    contingencyRatePercent: 6.5,
    baseConstructionMonths: 10,
  },
  {
    maxConstructionCostJpy: 500_000_000,
    softCostRatePercent: 7.0,
    otherCostRatePercent: 4.5,
    contingencyRatePercent: 7.0,
    baseConstructionMonths: 12,
  },
  {
    maxConstructionCostJpy: 800_000_000,
    softCostRatePercent: 6.8,
    otherCostRatePercent: 5.5,
    contingencyRatePercent: 7.5,
    baseConstructionMonths: 14,
  },
  {
    maxConstructionCostJpy: Number.POSITIVE_INFINITY,
    softCostRatePercent: 6.5,
    otherCostRatePercent: 6.5,
    contingencyRatePercent: 8.0,
    baseConstructionMonths: 16,
  },
];

const TOKYO_RC_LEASE_UP_BANDS: TokyoRcLeaseUpBand[] = [
  { maxUnitCount: 12, leaseUpMonths: 4 },
  { maxUnitCount: 24, leaseUpMonths: 5 },
  { maxUnitCount: 40, leaseUpMonths: 6 },
  { maxUnitCount: 60, leaseUpMonths: 7 },
  { maxUnitCount: Number.POSITIVE_INFINITY, leaseUpMonths: 8 },
];

const TOKYO_RC_SITE_CONDITION_RULES: Record<
  DevelopmentSiteConditionKey,
  TokyoRcSiteConditionRule
> = {
  siteConditionDemolition: {
    otherCostRatePercentAdd: 2.0,
    constructionMonthsAdd: 1,
  },
  siteConditionRetainingWall: {
    otherCostRatePercentAdd: 3.0,
    constructionMonthsAdd: 1,
  },
  siteConditionGroundImprovement: {
    otherCostRatePercentAdd: 2.5,
    constructionMonthsAdd: 1,
  },
  siteConditionBasement: {
    otherCostRatePercentAdd: 4.0,
    constructionMonthsAdd: 2,
  },
  siteConditionLogisticsConstraint: {
    otherCostRatePercentAdd: 1.5,
    constructionMonthsAdd: 1,
  },
};

const DEVELOPMENT_AUTO_FILL_KEYS: DevelopmentAutoFillKey[] = [
  "developmentSoftCost",
  "developmentOtherCost",
  "developmentContingencyRate",
  "developmentConstructionMonths",
  "developmentLeaseUpMonths",
  "developmentInterestOnlyMonths",
];

export const getSuggestedBuildingRatio = (structure: StructureType, age: number): number => {
  const safeAge = normalizeAge(age) ?? 0;
  const rows = BUILDING_RATIO_TABLE[structure];
  const matched = rows.find((row) => safeAge <= row.maxAge) ?? rows[rows.length - 1];
  return matched?.ratio ?? 0;
};

export const getSuggestedInterestRate = (structure?: StructureType | null): number | null => {
  if (!structure) return null;
  return INTEREST_RATE_TABLE[structure] ?? null;
};

export const getSuggestedLoanDuration = (
  structure?: StructureType | null,
  age?: number
): number | null => {
  if (!structure) return null;
  const safeAge = normalizeAge(age);
  if (safeAge === null) return null;
  const legalLife = LEGAL_USEFUL_LIFE[structure];
  const remaining = Math.max(0, legalLife - safeAge);
  let optimistic = remaining + (LOAN_DURATION_BONUS[structure] ?? 0);
  if (structure === "WOOD" && safeAge <= 10) {
    optimistic = Math.max(optimistic, 35);
  }
  return Math.min(35, Math.max(10, Math.round(optimistic)));
};

export const getSuggestedOccupancyRate = (age?: number): number | null => {
  const safeAge = normalizeAge(age);
  if (safeAge === null) return null;
  if (safeAge <= 10) return 95;
  if (safeAge <= 20) return 90;
  if (safeAge <= 30) return 85;
  return 80;
};

export const getSuggestedOperatingExpenseRate = (
  structure?: StructureType | null,
  age?: number
): number | null => {
  if (!structure) return null;
  const base = OPERATING_EXPENSE_TABLE[structure] ?? null;
  if (base === null) return null;
  const safeAge = normalizeAge(age);
  const uplift = safeAge !== null && safeAge > 20 ? 2 : 0;
  return base + uplift;
};

const isMissingNumber = (value: number | null | undefined) =>
  !Number.isFinite(value) || (value as number) <= 0;

const isTokyoRcDevelopmentScenario = (input: PropertyInput) =>
  input.investmentMode === "NEW_DEVELOPMENT" &&
  (input.structure === "RC" || input.structure === "SRC");

export const getDevelopmentSiteConditionAdjustment = (
  input: Pick<PropertyInput, DevelopmentSiteConditionKey>
) => {
  return DEVELOPMENT_SITE_CONDITION_KEYS.reduce(
    (accumulator, key) => {
      if (!input[key]) return accumulator;
      const rule = TOKYO_RC_SITE_CONDITION_RULES[key];
      return {
        activeKeys: [...accumulator.activeKeys, key],
        additionalConstructionMonths:
          accumulator.additionalConstructionMonths + rule.constructionMonthsAdd,
        additionalOtherCostRatePercent:
          accumulator.additionalOtherCostRatePercent + rule.otherCostRatePercentAdd,
      };
    },
    {
      activeKeys: [] as DevelopmentSiteConditionKey[],
      additionalConstructionMonths: 0,
      additionalOtherCostRatePercent: 0,
    }
  );
};

const getTokyoRcDevelopmentBand = (constructionCostJpy: number) =>
  TOKYO_RC_DEVELOPMENT_BANDS.find(
    (band) => constructionCostJpy <= band.maxConstructionCostJpy
  ) ?? TOKYO_RC_DEVELOPMENT_BANDS[TOKYO_RC_DEVELOPMENT_BANDS.length - 1];

const getReferenceConstructionCost = (input: PropertyInput) => {
  if (Number.isFinite(input.developmentConstructionCost) && input.developmentConstructionCost > 0) {
    return input.developmentConstructionCost;
  }
  if (
    Number.isFinite(input.price) &&
    input.price > 0 &&
    Number.isFinite(input.buildingRatio) &&
    input.buildingRatio > 0
  ) {
    return Math.round(input.price * (input.buildingRatio / 100));
  }
  return TOKYO_RC_DEFAULT_CONSTRUCTION_COST_JPY;
};

const getTokyoRcConstructionMonths = (constructionCostJpy: number, unitCount: number) => {
  const band = getTokyoRcDevelopmentBand(constructionCostJpy);
  const safeUnits =
    Number.isFinite(unitCount) && unitCount > 0 ? unitCount : TOKYO_RC_DEFAULT_UNIT_COUNT;
  let months = band.baseConstructionMonths;
  if (safeUnits > 40) months += 1;
  if (safeUnits > 80) months += 1;
  return months;
};

const getTokyoRcLeaseUpMonths = (unitCount: number) => {
  const safeUnits =
    Number.isFinite(unitCount) && unitCount > 0 ? unitCount : TOKYO_RC_DEFAULT_UNIT_COUNT;
  return (
    TOKYO_RC_LEASE_UP_BANDS.find((band) => safeUnits <= band.maxUnitCount)?.leaseUpMonths ?? 6
  );
};

const numbersMatch = (left: number | null | undefined, right: number | null | undefined) =>
  Number.isFinite(left as number) &&
  Number.isFinite(right as number) &&
  Math.abs((left as number) - (right as number)) < 0.0001;

export const getSuggestedDevelopmentDefaults = (
  input: PropertyInput
): Partial<Pick<PropertyInput, DevelopmentAutoFillKey>> => {
  if (!isTokyoRcDevelopmentScenario(input)) {
    return {};
  }

  const referenceConstructionCost = getReferenceConstructionCost(input);
  const constructionCost =
    Number.isFinite(input.developmentConstructionCost) && input.developmentConstructionCost > 0
      ? input.developmentConstructionCost
      : 0;
  const unitCount =
    Number.isFinite(input.unitCount) && input.unitCount > 0
      ? input.unitCount
      : TOKYO_RC_DEFAULT_UNIT_COUNT;
  const band = getTokyoRcDevelopmentBand(referenceConstructionCost);
  const siteConditionAdjustment = getDevelopmentSiteConditionAdjustment(input);
  const constructionMonths =
    getTokyoRcConstructionMonths(referenceConstructionCost, unitCount) +
    siteConditionAdjustment.additionalConstructionMonths;
  const leaseUpMonths = getTokyoRcLeaseUpMonths(unitCount);
  const otherCostRatePercent =
    band.otherCostRatePercent + siteConditionAdjustment.additionalOtherCostRatePercent;

  return {
    developmentSoftCost:
      constructionCost > 0
        ? Math.round(constructionCost * (band.softCostRatePercent / 100))
        : 0,
    developmentOtherCost:
      constructionCost > 0
        ? Math.round(constructionCost * (otherCostRatePercent / 100))
        : 0,
    developmentContingencyRate: band.contingencyRatePercent,
    developmentConstructionMonths: constructionMonths,
    developmentLeaseUpMonths: leaseUpMonths,
    developmentInterestOnlyMonths:
      constructionMonths + leaseUpMonths + TOKYO_RC_INTEREST_ONLY_BUFFER_MONTHS,
  };
};

export const applySuggestedDevelopmentDefaults = (
  input: PropertyInput,
  previousInput?: PropertyInput,
  options?: { preserveKeys?: DevelopmentAutoFillKey[] }
): PropertyInput => {
  const nextSuggestions = getSuggestedDevelopmentDefaults(input);
  const previousSuggestions = previousInput
    ? getSuggestedDevelopmentDefaults(previousInput)
    : {};
  const preservedKeys = new Set(options?.preserveKeys ?? []);
  const next = { ...input };

  DEVELOPMENT_AUTO_FILL_KEYS.forEach((key) => {
    if (preservedKeys.has(key)) return;

    const suggestedValue = nextSuggestions[key];
    if (!Number.isFinite(suggestedValue as number)) return;

    const currentValue = input[key];
    const previousValue = previousInput?.[key];
    const previousSuggestedValue = previousSuggestions[key];
    const shouldApply =
      isMissingNumber(currentValue) ||
      numbersMatch(previousValue as number, previousSuggestedValue as number);

    if (shouldApply) {
      next[key] = suggestedValue as number;
    }
  });

  return next;
};

export const applyEstimatedDefaults = (input: PropertyInput): PropertyInput => {
  const inputWithDevelopmentDefaults = applySuggestedDevelopmentDefaults(input);
  const structure = inputWithDevelopmentDefaults.structure;
  const buildingAge = inputWithDevelopmentDefaults.buildingAge;
  const suggestedBuildingRatio =
    isMissingNumber(inputWithDevelopmentDefaults.buildingRatio)
      ? getSuggestedBuildingRatio(structure, buildingAge)
      : null;
  const suggestedEquityRatio =
    isMissingNumber(inputWithDevelopmentDefaults.equityRatio) &&
    inputWithDevelopmentDefaults.price > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((inputWithDevelopmentDefaults.price -
              (inputWithDevelopmentDefaults.loanAmount ??
                Math.round(inputWithDevelopmentDefaults.price * 0.95))) /
              inputWithDevelopmentDefaults.price) *
              100
          )
        )
      : null;
  const suggestedLoanAmount =
    isMissingNumber(inputWithDevelopmentDefaults.loanAmount) &&
    inputWithDevelopmentDefaults.price > 0
      ? Math.max(
          0,
          Math.round(
            inputWithDevelopmentDefaults.price *
              (1 - (suggestedEquityRatio ?? inputWithDevelopmentDefaults.equityRatio ?? 5) / 100)
          )
        )
      : null;
  const suggestedInterestRate =
    isMissingNumber(inputWithDevelopmentDefaults.interestRate)
      ? getSuggestedInterestRate(structure)
      : null;
  const suggestedLoanDuration =
    isMissingNumber(inputWithDevelopmentDefaults.loanDuration)
      ? getSuggestedLoanDuration(structure, buildingAge)
      : null;
  const suggestedOccupancyRate =
    isMissingNumber(inputWithDevelopmentDefaults.occupancyRate)
      ? getSuggestedOccupancyRate(buildingAge)
      : null;
  const suggestedOperatingExpenseRate =
    isMissingNumber(inputWithDevelopmentDefaults.operatingExpenseRate)
      ? getSuggestedOperatingExpenseRate(structure, buildingAge)
      : null;
  const hasOerMode =
    inputWithDevelopmentDefaults.oerMode === "SIMPLE" ||
    inputWithDevelopmentDefaults.oerMode === "DETAILED";
  const oerLeasingEnabled =
    typeof inputWithDevelopmentDefaults.oerLeasingEnabled === "boolean"
      ? inputWithDevelopmentDefaults.oerLeasingEnabled
      : true;

  return {
    ...inputWithDevelopmentDefaults,
    buildingRatio: suggestedBuildingRatio ?? inputWithDevelopmentDefaults.buildingRatio,
    equityRatio: suggestedEquityRatio ?? inputWithDevelopmentDefaults.equityRatio,
    loanAmount: suggestedLoanAmount ?? inputWithDevelopmentDefaults.loanAmount,
    interestRate: suggestedInterestRate ?? inputWithDevelopmentDefaults.interestRate,
    loanDuration: suggestedLoanDuration ?? inputWithDevelopmentDefaults.loanDuration,
    occupancyRate: suggestedOccupancyRate ?? inputWithDevelopmentDefaults.occupancyRate,
    operatingExpenseRate:
      suggestedOperatingExpenseRate ?? inputWithDevelopmentDefaults.operatingExpenseRate,
    unitCount: isMissingNumber(inputWithDevelopmentDefaults.unitCount)
      ? 0
      : inputWithDevelopmentDefaults.unitCount,
    cleaningVisitsPerMonth: isMissingNumber(inputWithDevelopmentDefaults.cleaningVisitsPerMonth)
      ? 2
      : inputWithDevelopmentDefaults.cleaningVisitsPerMonth,
    oerMode: hasOerMode ? inputWithDevelopmentDefaults.oerMode : "SIMPLE",
    oerRateItems: Array.isArray(inputWithDevelopmentDefaults.oerRateItems)
      ? inputWithDevelopmentDefaults.oerRateItems
      : [],
    oerFixedItems: Array.isArray(inputWithDevelopmentDefaults.oerFixedItems)
      ? inputWithDevelopmentDefaults.oerFixedItems
      : [],
    oerEventItems: Array.isArray(inputWithDevelopmentDefaults.oerEventItems)
      ? inputWithDevelopmentDefaults.oerEventItems
      : [],
    oerLeasingEnabled,
    oerLeasingMonths: isMissingNumber(inputWithDevelopmentDefaults.oerLeasingMonths)
      ? 2
      : inputWithDevelopmentDefaults.oerLeasingMonths,
    oerLeasingTenancyYears: isMissingNumber(inputWithDevelopmentDefaults.oerLeasingTenancyYears)
      ? 2
      : inputWithDevelopmentDefaults.oerLeasingTenancyYears,
    rentDeclineRate: isMissingNumber(inputWithDevelopmentDefaults.rentDeclineRate)
      ? 0.5
      : inputWithDevelopmentDefaults.rentDeclineRate,
    waterContributionRate: isMissingNumber(inputWithDevelopmentDefaults.waterContributionRate)
      ? 0.2
      : inputWithDevelopmentDefaults.waterContributionRate,
    fireInsuranceRate: isMissingNumber(inputWithDevelopmentDefaults.fireInsuranceRate)
      ? 0.4
      : inputWithDevelopmentDefaults.fireInsuranceRate,
    loanFeeRate: isMissingNumber(inputWithDevelopmentDefaults.loanFeeRate)
      ? 2.2
      : inputWithDevelopmentDefaults.loanFeeRate,
    registrationCostRate: isMissingNumber(inputWithDevelopmentDefaults.registrationCostRate)
      ? 1.2
      : inputWithDevelopmentDefaults.registrationCostRate,
    acquisitionTaxRate: isMissingNumber(inputWithDevelopmentDefaults.acquisitionTaxRate)
      ? 3
      : inputWithDevelopmentDefaults.acquisitionTaxRate,
    acquisitionLandReductionRate: isMissingNumber(
      inputWithDevelopmentDefaults.acquisitionLandReductionRate
    )
      ? 50
      : inputWithDevelopmentDefaults.acquisitionLandReductionRate,
    landEvaluationRate: isMissingNumber(inputWithDevelopmentDefaults.landEvaluationRate)
      ? 70
      : inputWithDevelopmentDefaults.landEvaluationRate,
    buildingEvaluationRate: isMissingNumber(inputWithDevelopmentDefaults.buildingEvaluationRate)
      ? 50
      : inputWithDevelopmentDefaults.buildingEvaluationRate,
    landTaxReductionRate: isMissingNumber(inputWithDevelopmentDefaults.landTaxReductionRate)
      ? 16.67
      : inputWithDevelopmentDefaults.landTaxReductionRate,
    propertyTaxRate: isMissingNumber(inputWithDevelopmentDefaults.propertyTaxRate)
      ? 1.7
      : inputWithDevelopmentDefaults.propertyTaxRate,
    newBuildTaxReductionEnabled:
      typeof inputWithDevelopmentDefaults.newBuildTaxReductionEnabled === "boolean"
        ? inputWithDevelopmentDefaults.newBuildTaxReductionEnabled
        : false,
    vacancyModel: inputWithDevelopmentDefaults.vacancyModel ?? ("FIXED" as VacancyModelType),
    vacancyCycleYears: isMissingNumber(inputWithDevelopmentDefaults.vacancyCycleYears)
      ? 4
      : inputWithDevelopmentDefaults.vacancyCycleYears,
    vacancyCycleMonths: isMissingNumber(inputWithDevelopmentDefaults.vacancyCycleMonths)
      ? 3
      : inputWithDevelopmentDefaults.vacancyCycleMonths,
    vacancyProbability: isMissingNumber(inputWithDevelopmentDefaults.vacancyProbability)
      ? 20
      : inputWithDevelopmentDefaults.vacancyProbability,
    vacancyProbabilityMonths: isMissingNumber(inputWithDevelopmentDefaults.vacancyProbabilityMonths)
      ? 2
      : inputWithDevelopmentDefaults.vacancyProbabilityMonths,
    incomeTaxRate: isMissingNumber(inputWithDevelopmentDefaults.incomeTaxRate)
      ? 20
      : inputWithDevelopmentDefaults.incomeTaxRate,
    corporateMinimumTax: isMissingNumber(inputWithDevelopmentDefaults.corporateMinimumTax)
      ? 70000
      : inputWithDevelopmentDefaults.corporateMinimumTax,
    equipmentRatio: isMissingNumber(inputWithDevelopmentDefaults.equipmentRatio)
      ? 20
      : inputWithDevelopmentDefaults.equipmentRatio,
    equipmentUsefulLife: isMissingNumber(inputWithDevelopmentDefaults.equipmentUsefulLife)
      ? 15
      : inputWithDevelopmentDefaults.equipmentUsefulLife,
    scenarioInterestShockYear: isMissingNumber(inputWithDevelopmentDefaults.scenarioInterestShockYear)
      ? 5
      : inputWithDevelopmentDefaults.scenarioInterestShockYear,
    scenarioInterestShockDelta: isMissingNumber(inputWithDevelopmentDefaults.scenarioInterestShockDelta)
      ? 1
      : inputWithDevelopmentDefaults.scenarioInterestShockDelta,
    scenarioRentDeclineEarlyRate: isMissingNumber(
      inputWithDevelopmentDefaults.scenarioRentDeclineEarlyRate
    )
      ? 1.5
      : inputWithDevelopmentDefaults.scenarioRentDeclineEarlyRate,
    scenarioRentDeclineLateRate: isMissingNumber(
      inputWithDevelopmentDefaults.scenarioRentDeclineLateRate
    )
      ? 0.5
      : inputWithDevelopmentDefaults.scenarioRentDeclineLateRate,
    scenarioRentDeclineSwitchYear: isMissingNumber(
      inputWithDevelopmentDefaults.scenarioRentDeclineSwitchYear
    )
      ? 10
      : inputWithDevelopmentDefaults.scenarioRentDeclineSwitchYear,
    scenarioOccupancyDeclineStartYear: isMissingNumber(
      inputWithDevelopmentDefaults.scenarioOccupancyDeclineStartYear
    )
      ? 10
      : inputWithDevelopmentDefaults.scenarioOccupancyDeclineStartYear,
    scenarioOccupancyDeclineDelta: isMissingNumber(
      inputWithDevelopmentDefaults.scenarioOccupancyDeclineDelta
    )
      ? 5
      : inputWithDevelopmentDefaults.scenarioOccupancyDeclineDelta,
    exitYear: isMissingNumber(inputWithDevelopmentDefaults.exitYear)
      ? 10
      : inputWithDevelopmentDefaults.exitYear,
    exitCapRate: isMissingNumber(inputWithDevelopmentDefaults.exitCapRate)
      ? 7
      : inputWithDevelopmentDefaults.exitCapRate,
    exitBrokerageRate: isMissingNumber(inputWithDevelopmentDefaults.exitBrokerageRate)
      ? 3
      : inputWithDevelopmentDefaults.exitBrokerageRate,
    exitBrokerageFixed: isMissingNumber(inputWithDevelopmentDefaults.exitBrokerageFixed)
      ? 600000
      : inputWithDevelopmentDefaults.exitBrokerageFixed,
    exitOtherCostRate: isMissingNumber(inputWithDevelopmentDefaults.exitOtherCostRate)
      ? 1
      : inputWithDevelopmentDefaults.exitOtherCostRate,
    exitShortTermTaxRate: isMissingNumber(inputWithDevelopmentDefaults.exitShortTermTaxRate)
      ? 39
      : inputWithDevelopmentDefaults.exitShortTermTaxRate,
    exitLongTermTaxRate: isMissingNumber(inputWithDevelopmentDefaults.exitLongTermTaxRate)
      ? 20
      : inputWithDevelopmentDefaults.exitLongTermTaxRate,
    exitDiscountRate: isMissingNumber(inputWithDevelopmentDefaults.exitDiscountRate)
      ? 4
      : inputWithDevelopmentDefaults.exitDiscountRate,
  };
};

const AUTO_FILL_KEYS: (keyof PropertyInput)[] = [
  "buildingRatio",
  "developmentSoftCost",
  "developmentOtherCost",
  "developmentContingencyRate",
  "developmentConstructionMonths",
  "developmentLeaseUpMonths",
  "developmentInterestOnlyMonths",
  "equityRatio",
  "loanAmount",
  "interestRate",
  "loanDuration",
  "occupancyRate",
  "operatingExpenseRate",
  "oerLeasingMonths",
  "oerLeasingTenancyYears",
  "rentDeclineRate",
  "waterContributionRate",
  "fireInsuranceRate",
  "loanFeeRate",
  "registrationCostRate",
  "miscCostRate",
  "acquisitionTaxRate",
  "acquisitionLandReductionRate",
  "landEvaluationRate",
  "buildingEvaluationRate",
  "landTaxReductionRate",
  "propertyTaxRate",
  "vacancyCycleYears",
  "vacancyCycleMonths",
  "vacancyProbability",
  "vacancyProbabilityMonths",
  "incomeTaxRate",
  "corporateMinimumTax",
  "equipmentRatio",
  "equipmentUsefulLife",
  "scenarioInterestShockYear",
  "scenarioInterestShockDelta",
  "scenarioRentDeclineEarlyRate",
  "scenarioRentDeclineLateRate",
  "scenarioRentDeclineSwitchYear",
  "scenarioOccupancyDeclineStartYear",
  "scenarioOccupancyDeclineDelta",
  "exitYear",
  "exitCapRate",
  "exitBrokerageRate",
  "exitBrokerageFixed",
  "exitOtherCostRate",
  "exitShortTermTaxRate",
  "exitLongTermTaxRate",
  "exitDiscountRate",
];

export const applyEstimatedDefaultsWithMeta = (input: PropertyInput) => {
  const data = applyEstimatedDefaults(input);
  const autoFilled = AUTO_FILL_KEYS.filter((key) =>
    isMissingNumber(input[key] as number) && data[key] !== input[key]
  );
  return { data, autoFilled };
};
