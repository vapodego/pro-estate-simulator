import { LEGAL_USEFUL_LIFE, PropertyInput, StructureType, VacancyModelType } from "./types";

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

export const applyEstimatedDefaults = (input: PropertyInput): PropertyInput => {
  const structure = input.structure;
  const buildingAge = input.buildingAge;
  const suggestedBuildingRatio =
    isMissingNumber(input.buildingRatio) ? getSuggestedBuildingRatio(structure, buildingAge) : null;
  const suggestedEquityRatio =
    isMissingNumber(input.equityRatio) && input.price > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((input.price - (input.loanAmount ?? Math.round(input.price * 0.95))) / input.price) * 100
          )
        )
      : null;
  const suggestedLoanAmount =
    isMissingNumber(input.loanAmount) && input.price > 0
      ? Math.max(
          0,
          Math.round(
            input.price *
              (1 - (suggestedEquityRatio ?? input.equityRatio ?? 5) / 100)
          )
        )
      : null;
  const suggestedInterestRate =
    isMissingNumber(input.interestRate) ? getSuggestedInterestRate(structure) : null;
  const suggestedLoanDuration =
    isMissingNumber(input.loanDuration) ? getSuggestedLoanDuration(structure, buildingAge) : null;
  const suggestedOccupancyRate =
    isMissingNumber(input.occupancyRate) ? getSuggestedOccupancyRate(buildingAge) : null;
  const suggestedOperatingExpenseRate =
    isMissingNumber(input.operatingExpenseRate)
      ? getSuggestedOperatingExpenseRate(structure, buildingAge)
      : null;
  const hasOerMode = input.oerMode === "SIMPLE" || input.oerMode === "DETAILED";
  const oerLeasingEnabled =
    typeof input.oerLeasingEnabled === "boolean" ? input.oerLeasingEnabled : true;

  return {
    ...input,
    buildingRatio: suggestedBuildingRatio ?? input.buildingRatio,
    equityRatio: suggestedEquityRatio ?? input.equityRatio,
    loanAmount: suggestedLoanAmount ?? input.loanAmount,
    interestRate: suggestedInterestRate ?? input.interestRate,
    loanDuration: suggestedLoanDuration ?? input.loanDuration,
    occupancyRate: suggestedOccupancyRate ?? input.occupancyRate,
    operatingExpenseRate: suggestedOperatingExpenseRate ?? input.operatingExpenseRate,
    unitCount: isMissingNumber(input.unitCount) ? 0 : input.unitCount,
    cleaningVisitsPerMonth: isMissingNumber(input.cleaningVisitsPerMonth)
      ? 2
      : input.cleaningVisitsPerMonth,
    oerMode: hasOerMode ? input.oerMode : "SIMPLE",
    oerRateItems: Array.isArray(input.oerRateItems) ? input.oerRateItems : [],
    oerFixedItems: Array.isArray(input.oerFixedItems) ? input.oerFixedItems : [],
    oerEventItems: Array.isArray(input.oerEventItems) ? input.oerEventItems : [],
    oerLeasingEnabled,
    oerLeasingMonths: isMissingNumber(input.oerLeasingMonths) ? 2 : input.oerLeasingMonths,
    oerLeasingTenancyYears: isMissingNumber(input.oerLeasingTenancyYears)
      ? 2
      : input.oerLeasingTenancyYears,
    rentDeclineRate: isMissingNumber(input.rentDeclineRate) ? 0.5 : input.rentDeclineRate,
    waterContributionRate: isMissingNumber(input.waterContributionRate) ? 0.2 : input.waterContributionRate,
    fireInsuranceRate: isMissingNumber(input.fireInsuranceRate) ? 0.4 : input.fireInsuranceRate,
    loanFeeRate: isMissingNumber(input.loanFeeRate) ? 2.2 : input.loanFeeRate,
    registrationCostRate: isMissingNumber(input.registrationCostRate) ? 1.2 : input.registrationCostRate,
    acquisitionTaxRate: isMissingNumber(input.acquisitionTaxRate) ? 3 : input.acquisitionTaxRate,
    acquisitionLandReductionRate: isMissingNumber(input.acquisitionLandReductionRate)
      ? 50
      : input.acquisitionLandReductionRate,
    landEvaluationRate: isMissingNumber(input.landEvaluationRate) ? 70 : input.landEvaluationRate,
    buildingEvaluationRate: isMissingNumber(input.buildingEvaluationRate)
      ? 50
      : input.buildingEvaluationRate,
    landTaxReductionRate: isMissingNumber(input.landTaxReductionRate) ? 16.67 : input.landTaxReductionRate,
    propertyTaxRate: isMissingNumber(input.propertyTaxRate) ? 1.7 : input.propertyTaxRate,
    vacancyModel: input.vacancyModel ?? ("FIXED" as VacancyModelType),
    vacancyCycleYears: isMissingNumber(input.vacancyCycleYears) ? 4 : input.vacancyCycleYears,
    vacancyCycleMonths: isMissingNumber(input.vacancyCycleMonths) ? 3 : input.vacancyCycleMonths,
    vacancyProbability: isMissingNumber(input.vacancyProbability) ? 20 : input.vacancyProbability,
    vacancyProbabilityMonths: isMissingNumber(input.vacancyProbabilityMonths)
      ? 2
      : input.vacancyProbabilityMonths,
    incomeTaxRate: isMissingNumber(input.incomeTaxRate) ? 20 : input.incomeTaxRate,
    corporateMinimumTax: isMissingNumber(input.corporateMinimumTax) ? 70000 : input.corporateMinimumTax,
    equipmentRatio: isMissingNumber(input.equipmentRatio) ? 20 : input.equipmentRatio,
    equipmentUsefulLife: isMissingNumber(input.equipmentUsefulLife) ? 15 : input.equipmentUsefulLife,
    scenarioInterestShockYear: isMissingNumber(input.scenarioInterestShockYear)
      ? 5
      : input.scenarioInterestShockYear,
    scenarioInterestShockDelta: isMissingNumber(input.scenarioInterestShockDelta)
      ? 1
      : input.scenarioInterestShockDelta,
    scenarioRentDeclineEarlyRate: isMissingNumber(input.scenarioRentDeclineEarlyRate)
      ? 1.5
      : input.scenarioRentDeclineEarlyRate,
    scenarioRentDeclineLateRate: isMissingNumber(input.scenarioRentDeclineLateRate)
      ? 0.5
      : input.scenarioRentDeclineLateRate,
    scenarioRentDeclineSwitchYear: isMissingNumber(input.scenarioRentDeclineSwitchYear)
      ? 10
      : input.scenarioRentDeclineSwitchYear,
    scenarioOccupancyDeclineStartYear: isMissingNumber(input.scenarioOccupancyDeclineStartYear)
      ? 10
      : input.scenarioOccupancyDeclineStartYear,
    scenarioOccupancyDeclineDelta: isMissingNumber(input.scenarioOccupancyDeclineDelta)
      ? 5
      : input.scenarioOccupancyDeclineDelta,
    exitYear: isMissingNumber(input.exitYear) ? 10 : input.exitYear,
    exitCapRate: isMissingNumber(input.exitCapRate) ? 7 : input.exitCapRate,
    exitBrokerageRate: isMissingNumber(input.exitBrokerageRate) ? 3 : input.exitBrokerageRate,
    exitBrokerageFixed: isMissingNumber(input.exitBrokerageFixed) ? 600000 : input.exitBrokerageFixed,
    exitOtherCostRate: isMissingNumber(input.exitOtherCostRate) ? 1 : input.exitOtherCostRate,
    exitShortTermTaxRate: isMissingNumber(input.exitShortTermTaxRate) ? 39 : input.exitShortTermTaxRate,
    exitLongTermTaxRate: isMissingNumber(input.exitLongTermTaxRate) ? 20 : input.exitLongTermTaxRate,
    exitDiscountRate: isMissingNumber(input.exitDiscountRate) ? 4 : input.exitDiscountRate,
  };
};

const AUTO_FILL_KEYS: (keyof PropertyInput)[] = [
  "buildingRatio",
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
