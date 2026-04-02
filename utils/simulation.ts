import {
  PropertyInput,
  YearlyResult,
  ScenarioConfig,
  LEGAL_USEFUL_LIFE,
  StructureType,
  OerRateItem,
  OerFixedItem,
  OerEventItem,
  OerPropertyType,
} from './types';
import { getDevelopmentCostSummary, isDevelopmentMode } from './development';
import { getOerRateForAge } from './oer';
import { getOccupancyRateForAge } from './occupancy';

// 中古耐用年数の計算（簡便法） 
export const calculateUsefulLife = (structure: StructureType, age: number): number => {
  const legalLife = LEGAL_USEFUL_LIFE[structure];
  if (age >= legalLife) {
    return Math.floor(legalLife * 0.2);
  }
  return Math.floor((legalLife - age) + (age * 0.2));
};

// 固定資産税の概算（住宅用地特例・簡易評価）
const calculatePropertyTax = (params: {
  price: number;
  buildingRatio: number;
  landEvaluationRate: number;
  buildingEvaluationRate: number;
  landTaxReductionRate: number;
  propertyTaxRate: number;
  newBuildTaxReductionEnabled: boolean;
  buildingAge: number;
  newBuildTaxReductionYears: number;
  newBuildTaxReductionRate: number;
  year: number;
}): number => {
  const safePrice = Number.isFinite(params.price) ? params.price : 0;
  const safeRatio = Number.isFinite(params.buildingRatio) ? params.buildingRatio : 0;
  const safeLandRate = Number.isFinite(params.landEvaluationRate)
    ? params.landEvaluationRate
    : 70;
  const safeBuildingRate = Number.isFinite(params.buildingEvaluationRate)
    ? params.buildingEvaluationRate
    : 50;
  const safeLandReduction = Number.isFinite(params.landTaxReductionRate)
    ? params.landTaxReductionRate
    : 16.67;
  const safeTaxRate =
    Number.isFinite(params.propertyTaxRate) && params.propertyTaxRate > 0
      ? params.propertyTaxRate
      : 1.7;
  const safeReductionEnabled = params.newBuildTaxReductionEnabled === true;
  const safeBuildingAge = Number.isFinite(params.buildingAge)
    ? Math.max(0, Math.floor(params.buildingAge))
    : 0;
  const safeReductionYears = Number.isFinite(params.newBuildTaxReductionYears)
    ? Math.max(0, Math.floor(params.newBuildTaxReductionYears))
    : 0;
  const safeReductionRate = Number.isFinite(params.newBuildTaxReductionRate)
    ? Math.max(0, params.newBuildTaxReductionRate)
    : 50;

  const buildingPrice = safePrice * (safeRatio / 100);
  const landPrice = Math.max(0, safePrice - buildingPrice);
  const landEvaluation = landPrice * (safeLandRate / 100);
  const ageAtYear = safeBuildingAge + Math.max(0, params.year - 1);
  const buildingDecayRate = 1.5;
  const buildingDecayFactor = Math.max(0, 1 - (buildingDecayRate / 100) * ageAtYear);
  const buildingEvaluation = buildingPrice * (safeBuildingRate / 100) * buildingDecayFactor;
  const isReductionPeriod = safeReductionEnabled && safeReductionYears > 0 && ageAtYear < safeReductionYears;
  const buildingTaxable = isReductionPeriod
    ? buildingEvaluation * (safeReductionRate / 100)
    : buildingEvaluation;
  const taxableValue = landEvaluation * (safeLandReduction / 100) + buildingTaxable;
  return Math.round(taxableValue * (safeTaxRate / 100));
};

// PMT関数（毎月の返済額計算）
export const calculatePMT = (rate: number, periods: number, present: number): number => {
  if (rate === 0) return present / periods;
  const monthlyRate = rate / 12 / 100;
  const numPayments = periods * 12;
  return (present * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));
};

const INCOME_TAX_BRACKETS = [
  { upTo: 1950000, rate: 0.05, deduction: 0 },
  { upTo: 3300000, rate: 0.1, deduction: 97500 },
  { upTo: 6950000, rate: 0.2, deduction: 427500 },
  { upTo: 9000000, rate: 0.23, deduction: 636000 },
  { upTo: 18000000, rate: 0.33, deduction: 1536000 },
  { upTo: 40000000, rate: 0.4, deduction: 2796000 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, deduction: 4796000 },
];

const calculateProgressiveTax = (taxableIncome: number): number => {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) return 0;
  const bracket = INCOME_TAX_BRACKETS.find((item) => taxableIncome <= item.upTo);
  if (!bracket) return 0;
  const incomeTax = taxableIncome * bracket.rate - bracket.deduction;
  const residentTax = taxableIncome * 0.1;
  return Math.max(0, Math.round(incomeTax + residentTax));
};

const calculateDevelopmentPropertyTax = (params: {
  landPrice: number;
  buildingPrice: number;
  landEvaluationRate: number;
  buildingEvaluationRate: number;
  landTaxReductionRate: number;
  propertyTaxRate: number;
  newBuildTaxReductionEnabled: boolean;
  newBuildTaxReductionYears: number;
  newBuildTaxReductionRate: number;
  operationYear: number;
  buildingMonthsInService: number;
}) => {
  const safeLandRate = Number.isFinite(params.landEvaluationRate)
    ? params.landEvaluationRate
    : 70;
  const safeBuildingRate = Number.isFinite(params.buildingEvaluationRate)
    ? params.buildingEvaluationRate
    : 50;
  const safeLandReduction = Number.isFinite(params.landTaxReductionRate)
    ? params.landTaxReductionRate
    : 16.67;
  const safeTaxRate =
    Number.isFinite(params.propertyTaxRate) && params.propertyTaxRate > 0
      ? params.propertyTaxRate
      : 1.7;
  const safeBuildingMonths = Math.max(0, Math.min(12, params.buildingMonthsInService));
  const landEvaluation = Math.max(0, params.landPrice) * (safeLandRate / 100);
  const landTax = landEvaluation * (safeLandReduction / 100) * (safeTaxRate / 100);

  if (safeBuildingMonths <= 0 || params.buildingPrice <= 0) {
    return Math.round(landTax);
  }

  const operationYear = Math.max(1, params.operationYear);
  const buildingDecayRate = 1.5;
  const buildingDecayFactor = Math.max(0, 1 - (buildingDecayRate / 100) * (operationYear - 1));
  const buildingEvaluation =
    Math.max(0, params.buildingPrice) *
    (safeBuildingRate / 100) *
    buildingDecayFactor;
  const reductionEnabled = params.newBuildTaxReductionEnabled === true;
  const reductionYears = Number.isFinite(params.newBuildTaxReductionYears)
    ? Math.max(0, Math.floor(params.newBuildTaxReductionYears))
    : 0;
  const reductionRate = Number.isFinite(params.newBuildTaxReductionRate)
    ? Math.max(0, params.newBuildTaxReductionRate)
    : 50;
  const buildingTaxable =
    reductionEnabled && operationYear <= reductionYears
      ? buildingEvaluation * (reductionRate / 100)
      : buildingEvaluation;
  const buildingTax =
    buildingTaxable * (safeTaxRate / 100) * (safeBuildingMonths / 12);

  return Math.round(landTax + buildingTax);
};

const inferOerPropertyType = (structure: StructureType, unitCount: number): OerPropertyType => {
  const safeUnits = Number.isFinite(unitCount) ? unitCount : 0;
  if (safeUnits > 0 && safeUnits <= 1) return "UNIT";
  if (structure === "WOOD") return "WOOD_APARTMENT";
  if (structure === "S_HEAVY" || structure === "S_LIGHT") return "STEEL_APARTMENT";
  return "RC_APARTMENT";
};

const calculateOerDetailed = (
  year: number,
  grossPotentialRent: number,
  effectiveIncome: number,
  rateItems: OerRateItem[],
  fixedItems: OerFixedItem[],
  eventItems: OerEventItem[],
  leasingEnabled: boolean,
  leasingMonths: number,
  leasingTenancyYears: number
): number => {
  const safeNumber = (value: number, fallback: number) =>
    Number.isFinite(value) ? value : fallback;
  const rateExpense = rateItems.reduce((sum, item) => {
    if (!item?.enabled) return sum;
    const rate = Math.max(0, safeNumber(item.rate, 0));
    const base = item.base === "EGI" ? effectiveIncome : grossPotentialRent;
    return sum + base * (rate / 100);
  }, 0);
  const fixedExpense = fixedItems.reduce((sum, item) => {
    if (!item?.enabled) return sum;
    const amount = Math.max(0, safeNumber(item.annualAmount, 0));
    return sum + amount;
  }, 0);
  const eventExpense = eventItems.reduce((sum, item) => {
    if (!item?.enabled) return sum;
    const amount = Math.max(0, safeNumber(item.amount, 0));
    const interval = Math.max(1, Math.round(safeNumber(item.intervalYears, 0)));
    const startYear = Math.max(1, Math.round(safeNumber(item.startYear, 1)));
    if (item.mode === "CASH") {
      if (year >= startYear && (year - startYear) % interval === 0) {
        return sum + amount;
      }
      return sum;
    }
    return sum + amount / interval;
  }, 0);
  const leasingRate =
    leasingEnabled && leasingMonths > 0 && leasingTenancyYears > 0
      ? (leasingMonths / (leasingTenancyYears * 12)) * 100
      : 0;
  const leasingExpense = grossPotentialRent * (leasingRate / 100);
  return rateExpense + fixedExpense + eventExpense + leasingExpense;
};

const calculateDevelopmentSimulation = (
  input: PropertyInput,
  scenario?: ScenarioConfig
): YearlyResult[] => {
  const results: YearlyResult[] = [];
  const safeNumber = (value: number, fallback: number) =>
    Number.isFinite(value) ? value : fallback;
  const development = getDevelopmentCostSummary(input);
  const landPrice = development.landPrice;
  const totalBuildingPrice = development.constructionCost;
  const waterContribution = Math.round(
    (Math.max(0, input.price) * Math.max(0, safeNumber(input.waterContributionRate, 0))) / 100
  );
  const fireInsurance = Math.round(
    (Math.max(0, totalBuildingPrice) * Math.max(0, safeNumber(input.fireInsuranceRate, 0))) / 100
  );
  const registrationCost = Math.round(
    (Math.max(0, input.price) * Math.max(0, safeNumber(input.registrationCostRate, 0))) / 100
  );
  const loanFeeCost = Math.round(
    (Math.max(0, input.loanAmount) * Math.max(0, safeNumber(input.loanFeeRate, 0))) / 100
  );
  const totalProjectCost =
    development.projectCostBeforeFinancing +
    waterContribution +
    fireInsurance +
    registrationCost +
    loanFeeCost;
  const landEvaluation = landPrice * (safeNumber(input.landEvaluationRate, 70) / 100);
  const buildingEvaluation =
    totalBuildingPrice * (safeNumber(input.buildingEvaluationRate, 50) / 100);
  const landRatio = totalProjectCost > 0 ? landPrice / totalProjectCost : 0;
  const acquisitionTaxEstimate = Math.round(
    (landEvaluation * (safeNumber(input.acquisitionLandReductionRate, 50) / 100) +
      buildingEvaluation) *
      (safeNumber(input.acquisitionTaxRate, 3) / 100)
  );
  const shockEnabled = scenario?.interestRateShockEnabled ?? false;
  const shockYear = Math.max(1, Math.round(safeNumber(Number(scenario?.interestRateShockYear), 5)));
  const shockDelta = safeNumber(Number(scenario?.interestRateShockDelta), 1);
  const rentCurveEnabled = scenario?.rentCurveEnabled ?? false;
  const rentDeclineEarlyRate = safeNumber(
    Number(scenario?.rentDeclineEarlyRate),
    input.rentDeclineRate
  );
  const rentDeclineLateRate = safeNumber(
    Number(scenario?.rentDeclineLateRate),
    input.rentDeclineRate
  );
  const rentDeclineSwitchYear = Math.max(
    1,
    Math.round(safeNumber(Number(scenario?.rentDeclineSwitchYear), 10))
  );
  const occupancyDeclineEnabled = scenario?.occupancyDeclineEnabled ?? false;
  const occupancyDeclineStartYear = Math.max(
    1,
    Math.round(safeNumber(Number(scenario?.occupancyDeclineStartYear), 10))
  );
  const occupancyDeclineDelta = safeNumber(Number(scenario?.occupancyDeclineDelta), 5);
  const constructionMonths = Math.max(
    1,
    Math.round(safeNumber(input.developmentConstructionMonths, 12))
  );
  const leaseUpMonths = Math.max(
    0,
    Math.round(safeNumber(input.developmentLeaseUpMonths, 6))
  );
  const interestOnlyMonths = Math.max(
    0,
    Math.round(
      safeNumber(
        input.developmentInterestOnlyMonths,
        constructionMonths + leaseUpMonths
      )
    )
  );
  const totalMonths = 35 * 12;
  const bodyPrice = totalBuildingPrice;
  const equipmentPrice = input.enableEquipmentSplit
    ? totalBuildingPrice * (safeNumber(input.equipmentRatio, 0) / 100)
    : 0;
  const adjustedBodyPrice = Math.max(0, bodyPrice - equipmentPrice);
  const bodyLife = Math.max(1, calculateUsefulLife(input.structure, 0));
  const equipmentLife = input.enableEquipmentSplit
    ? Math.max(1, safeNumber(input.equipmentUsefulLife, 15))
    : 0;
  const financedRatio = totalProjectCost > 0 ? Math.max(0, Math.min(1, input.loanAmount / totalProjectCost)) : 0;
  const upfrontSoftCost = development.softCost * 0.35;
  const upfrontOtherCost = development.otherCost * 0.35;
  const spreadSoftCost = Math.max(0, development.softCost - upfrontSoftCost);
  const spreadOtherCost = Math.max(0, development.otherCost - upfrontOtherCost);
  const monthlyConstructionCost = development.constructionCost / constructionMonths;
  const monthlySoftCost = spreadSoftCost / constructionMonths;
  const monthlyOtherCost = spreadOtherCost / constructionMonths;
  const monthlyContingencyCost = development.contingencyCost / constructionMonths;
  const acquisitionTaxYear = Math.min(35, Math.floor(constructionMonths / 12) + 2);
  let currentLoanBalance = 0;
  let totalLoanDrawn = 0;
  let currentMonthlyPayment = 0;
  let currentInterestRate = safeNumber(input.interestRate, 0);

  type AnnualAccumulator = {
    grossPotentialRent: number;
    grossIncome: number;
    equityContribution: number;
    loanInterest: number;
    loanPrincipal: number;
    loanPaymentTotal: number;
    monthsInService: number;
    operationYear: number;
    loanBalance: number;
    depreciationBody: number;
    depreciationEquipment: number;
  };

  const yearlyAccumulators: AnnualAccumulator[] = Array.from({ length: 35 }, () => ({
    grossPotentialRent: 0,
    grossIncome: 0,
    equityContribution: 0,
    loanInterest: 0,
    loanPrincipal: 0,
    loanPaymentTotal: 0,
    monthsInService: 0,
    operationYear: 0,
    loanBalance: 0,
    depreciationBody: 0,
    depreciationEquipment: 0,
  }));

  for (let month = 1; month <= totalMonths; month++) {
    const projectYear = Math.ceil(month / 12);
    const annual = yearlyAccumulators[projectYear - 1];
    let monthSpend = 0;

    if (month === 1) {
      monthSpend +=
        landPrice +
        waterContribution +
        registrationCost +
        loanFeeCost +
        upfrontSoftCost +
        upfrontOtherCost;
    }
    if (month <= constructionMonths) {
      monthSpend +=
        monthlyConstructionCost +
        monthlySoftCost +
        monthlyOtherCost +
        monthlyContingencyCost;
    }

    const financedSpend = Math.min(
      Math.max(0, input.loanAmount - totalLoanDrawn),
      monthSpend * financedRatio
    );
    const equitySpend = Math.max(0, monthSpend - financedSpend);
    totalLoanDrawn += financedSpend;
    currentLoanBalance += financedSpend;
    annual.equityContribution += equitySpend;

    const shockedRate =
      shockEnabled && projectYear >= shockYear
        ? safeNumber(input.interestRate, 0) + shockDelta
        : safeNumber(input.interestRate, 0);
    if (shockedRate !== currentInterestRate) {
      currentInterestRate = shockedRate;
    }

    if (month > interestOnlyMonths && currentLoanBalance > 0) {
      const elapsedAmortizationMonths = Math.max(0, month - interestOnlyMonths - 1);
      const remainingMonths = Math.max(
        1,
        Math.round(safeNumber(input.loanDuration, 0) * 12) - elapsedAmortizationMonths
      );
      currentMonthlyPayment = calculatePMT(
        currentInterestRate,
        remainingMonths / 12,
        currentLoanBalance
      );
    } else {
      currentMonthlyPayment = 0;
    }

    const interest = currentLoanBalance * (currentInterestRate / 100 / 12);
    let principal = 0;
    let monthlyLoanPayment = 0;

    if (month <= interestOnlyMonths) {
      monthlyLoanPayment = interest;
    } else if (currentLoanBalance > 0) {
      principal = Math.min(currentLoanBalance, Math.max(0, currentMonthlyPayment - interest));
      monthlyLoanPayment = interest + principal;
      currentLoanBalance -= principal;
    }

    annual.loanInterest += interest;
    annual.loanPrincipal += principal;
    annual.loanPaymentTotal += monthlyLoanPayment;
    annual.loanBalance = Math.max(0, currentLoanBalance);

    if (month > constructionMonths) {
      const operationMonth = month - constructionMonths;
      const operationYear = Math.max(1, Math.ceil(operationMonth / 12));
      const occupancyBase = getOccupancyRateForAge(
        operationYear - 1,
        input.occupancyDetailEnabled ?? false,
        {
          occupancyRate: safeNumber(input.occupancyRate, 100),
          occupancyRateYear1to2: input.occupancyRateYear1to2,
          occupancyRateYear3to10: input.occupancyRateYear3to10,
          occupancyRateYear11to20: input.occupancyRateYear11to20,
          occupancyRateYear20to30: input.occupancyRateYear20to30,
          occupancyRateYear30to40: input.occupancyRateYear30to40,
        }
      );
      const declineFactor = rentCurveEnabled
        ? Math.pow(
            1 - rentDeclineEarlyRate / 100,
            Math.floor((Math.min(operationYear, rentDeclineSwitchYear) - 1) / 2)
          ) *
          Math.pow(
            1 - rentDeclineLateRate / 100,
            Math.floor(Math.max(0, operationYear - rentDeclineSwitchYear) / 2)
          )
        : Math.pow(
            1 - safeNumber(input.rentDeclineRate, 0) / 100,
            Math.floor((operationYear - 1) / 2)
          );
      const occupancyAfterStress =
        occupancyDeclineEnabled && operationYear >= occupancyDeclineStartYear
          ? Math.max(0, occupancyBase - occupancyDeclineDelta)
          : occupancyBase;
      let vacancyLoss = 0;
      if (input.vacancyModel === 'CYCLE') {
        const cycleYears = Math.max(1, Math.round(safeNumber(input.vacancyCycleYears, 4)));
        const cycleMonths = Math.max(0, safeNumber(input.vacancyCycleMonths, 0));
        if (cycleYears > 0 && operationYear % cycleYears === 0) {
          vacancyLoss = cycleMonths / 12;
        }
      } else if (input.vacancyModel === 'PROBABILITY') {
        const probability = Math.max(0, safeNumber(input.vacancyProbability, 0)) / 100;
        const months = Math.max(0, safeNumber(input.vacancyProbabilityMonths, 0));
        vacancyLoss = probability * (months / 12);
      }
      const leaseUpFactor =
        leaseUpMonths > 0 ? Math.min(1, operationMonth / leaseUpMonths) : 1;
      const adjustedOccupancy = Math.min(
        100,
        Math.max(0, occupancyAfterStress * leaseUpFactor * (1 - vacancyLoss))
      );
      const monthlyPotentialRent = Math.max(0, safeNumber(input.monthlyRent, 0) * declineFactor);
      const monthlyIncome = monthlyPotentialRent * (adjustedOccupancy / 100);

      annual.grossPotentialRent += monthlyPotentialRent;
      annual.grossIncome += monthlyIncome;
      annual.monthsInService += 1;
      annual.operationYear = operationYear;
      annual.depreciationBody += adjustedBodyPrice / bodyLife / 12;
      if (input.enableEquipmentSplit && equipmentLife > 0) {
        annual.depreciationEquipment += equipmentPrice / equipmentLife / 12;
      }
    }
  }

  for (let year = 1; year <= 35; year++) {
    const annual = yearlyAccumulators[year - 1];
    const oerTemplateType =
      input.oerTemplateType ?? inferOerPropertyType(input.structure, input.unitCount);
    const baseTemplateRate = getOerRateForAge(
      oerTemplateType,
      Math.max(0, annual.operationYear - 1)
    );
    const opExpenseRate = safeNumber(input.operatingExpenseRate, 0);
    const shouldAutoOer =
      input.oerMode === 'SIMPLE' && Math.abs(opExpenseRate - baseTemplateRate) < 0.01;
    const dynamicOerRate = getOerRateForAge(
      oerTemplateType,
      Math.max(0, annual.operationYear - 1)
    );
    const opExpense =
      annual.grossPotentialRent <= 0
        ? 0
        : input.oerMode === 'DETAILED'
          ? calculateOerDetailed(
              year,
              annual.grossPotentialRent,
              annual.grossIncome,
              Array.isArray(input.oerRateItems) ? input.oerRateItems : [],
              Array.isArray(input.oerFixedItems) ? input.oerFixedItems : [],
              Array.isArray(input.oerEventItems) ? input.oerEventItems : [],
              input.oerLeasingEnabled ?? true,
              safeNumber(input.oerLeasingMonths, 0),
              safeNumber(input.oerLeasingTenancyYears, 0)
            )
          : annual.grossIncome * ((shouldAutoOer ? dynamicOerRate : opExpenseRate) / 100);
    const repairCost = Array.isArray(input.repairEvents)
      ? input.repairEvents.reduce((sum, event) => {
          if (event?.year !== year) return sum;
          const amount = Number.isFinite(event.amount) ? event.amount : 0;
          return sum + Math.max(0, amount);
        }, 0)
      : 0;
    const propertyTax = calculateDevelopmentPropertyTax({
      landPrice,
      buildingPrice: totalBuildingPrice,
      landEvaluationRate: input.landEvaluationRate,
      buildingEvaluationRate: input.buildingEvaluationRate,
      landTaxReductionRate: input.landTaxReductionRate,
      propertyTaxRate: input.propertyTaxRate,
      newBuildTaxReductionEnabled: input.newBuildTaxReductionEnabled,
      newBuildTaxReductionYears: input.newBuildTaxReductionYears,
      newBuildTaxReductionRate: input.newBuildTaxReductionRate,
      operationYear: annual.operationYear,
      buildingMonthsInService: annual.monthsInService,
    });
    const depreciationBody = annual.depreciationBody;
    const depreciationEquipment = annual.depreciationEquipment;
    const depreciationTotal = depreciationBody + depreciationEquipment;
    const realEstateIncome =
      annual.grossIncome -
      opExpense -
      repairCost -
      annual.loanInterest -
      depreciationTotal -
      propertyTax;

    let taxAmount = 0;
    if (input.taxType === 'INDIVIDUAL') {
      const otherIncome = safeNumber(input.otherIncome, 0);
      const adjustedRealEstateIncome =
        realEstateIncome < 0
          ? realEstateIncome + annual.loanInterest * landRatio
          : realEstateIncome;
      const totalTaxableIncome = otherIncome + adjustedRealEstateIncome;
      const totalTax = calculateProgressiveTax(totalTaxableIncome);
      const baseTax = calculateProgressiveTax(otherIncome);
      taxAmount = totalTax - baseTax;
    } else {
      if (realEstateIncome > 0) {
        const rate = realEstateIncome <= 8000000 ? 0.15 : 0.23;
        taxAmount = realEstateIncome * rate;
      }
      taxAmount += safeNumber(input.corporateMinimumTax, 0);
    }

    taxAmount = Math.round(taxAmount);
    const acquisitionTax = year === acquisitionTaxYear ? acquisitionTaxEstimate : 0;
    const cashFlowPreTax =
      annual.grossIncome -
      opExpense -
      repairCost -
      annual.loanPaymentTotal -
      propertyTax -
      acquisitionTax -
      annual.equityContribution;
    const cashFlowPostTax = cashFlowPreTax - taxAmount;
    const isDeadCross = annual.loanPrincipal > depreciationTotal;

    results.push({
      year,
      grossPotentialRent: annual.grossPotentialRent,
      income: annual.grossIncome,
      expense: opExpense,
      propertyTax,
      repairCost,
      loanPaymentTotal: annual.loanPaymentTotal,
      loanInterest: annual.loanInterest,
      loanPrincipal: annual.loanPrincipal,
      loanBalance: annual.loanBalance,
      depreciationBody,
      depreciationEquipment,
      depreciationTotal,
      taxableIncome: realEstateIncome,
      taxAmount,
      cashFlowPreTax,
      cashFlowPostTax,
      acquisitionTax,
      isDeadCross,
    });
  }

  return results;
};

// メインのシミュレーション関数
export const calculateSimulation = (
  input: PropertyInput,
  scenario?: ScenarioConfig
): YearlyResult[] => {
  if (isDevelopmentMode(input)) {
    return calculateDevelopmentSimulation(input, scenario);
  }
  const results: YearlyResult[] = [];
  const safeNumber = (value: number, fallback: number) =>
    Number.isFinite(value) ? value : fallback;
  const buildingPriceForTax = input.price * (input.buildingRatio / 100);
  const landPriceForTax = Math.max(0, input.price - buildingPriceForTax);
  const landEvaluation = landPriceForTax * (safeNumber(input.landEvaluationRate, 70) / 100);
  const buildingEvaluation =
    buildingPriceForTax * (safeNumber(input.buildingEvaluationRate, 50) / 100);
  const landRatio = input.price > 0 ? landPriceForTax / input.price : 0;
  const acquisitionTaxEstimate = Math.round(
    (landEvaluation * (safeNumber(input.acquisitionLandReductionRate, 50) / 100) +
      buildingEvaluation) *
      (safeNumber(input.acquisitionTaxRate, 3) / 100)
  );

  const shockEnabled = scenario?.interestRateShockEnabled ?? false;
  const shockYear = Math.max(1, Math.round(safeNumber(Number(scenario?.interestRateShockYear), 5)));
  const shockDelta = safeNumber(Number(scenario?.interestRateShockDelta), 1);
  const rentCurveEnabled = scenario?.rentCurveEnabled ?? false;
  const rentDeclineEarlyRate = safeNumber(
    Number(scenario?.rentDeclineEarlyRate),
    input.rentDeclineRate
  );
  const rentDeclineLateRate = safeNumber(
    Number(scenario?.rentDeclineLateRate),
    input.rentDeclineRate
  );
  const rentDeclineSwitchYear = Math.max(
    1,
    Math.round(safeNumber(Number(scenario?.rentDeclineSwitchYear), 10))
  );
  const occupancyDeclineEnabled = scenario?.occupancyDeclineEnabled ?? false;
  const occupancyDeclineStartYear = Math.max(
    1,
    Math.round(safeNumber(Number(scenario?.occupancyDeclineStartYear), 10))
  );
  const occupancyDeclineDelta = safeNumber(
    Number(scenario?.occupancyDeclineDelta),
    5
  );
  
  // 1. 建物価格と設備価格の算出
  const totalBuildingPrice = input.price * (input.buildingRatio / 100);
  let bodyPrice = totalBuildingPrice;
  let equipmentPrice = 0;

  // 設備分離ロジック 
  if (input.enableEquipmentSplit) {
    equipmentPrice = totalBuildingPrice * (input.equipmentRatio / 100);
    bodyPrice = totalBuildingPrice - equipmentPrice;
  }

  // 2. 耐用年数の決定
  const bodyLife = calculateUsefulLife(input.structure, input.buildingAge);
  const equipmentLife = input.enableEquipmentSplit
    ? Math.max(1, safeNumber(input.equipmentUsefulLife, 15))
    : 0; // 設備は一般的に15年 [cite: 667]

  // ローン計算用変数
  let currentLoanBalance = input.loanAmount;
  let currentInterestRate = input.interestRate;
  let currentMonthlyPayment = calculatePMT(
    currentInterestRate,
    input.loanDuration,
    input.loanAmount
  );

  // 35年分シミュレーション（長期保有シミュレーション）
  for (let year = 1; year <= 35; year++) {
    const fixedAssetTax = calculatePropertyTax({
      price: input.price,
      buildingRatio: input.buildingRatio,
      landEvaluationRate: input.landEvaluationRate,
      buildingEvaluationRate: input.buildingEvaluationRate,
      landTaxReductionRate: input.landTaxReductionRate,
      propertyTaxRate: input.propertyTaxRate,
      newBuildTaxReductionEnabled: input.newBuildTaxReductionEnabled,
      buildingAge: input.buildingAge,
      newBuildTaxReductionYears: input.newBuildTaxReductionYears,
      newBuildTaxReductionRate: input.newBuildTaxReductionRate,
      year,
    });
    // --- A. インカム計算 ---
    // 家賃収入（入居率・家賃下落率を考慮） [cite: 625]
    const baseAnnualRent = safeNumber(input.monthlyRent, 0) * 12;
    const rentDeclineRate = safeNumber(input.rentDeclineRate, 0);
    const ageAtYear = safeNumber(input.buildingAge, 0) + (year - 1);
    const occupancyRate = getOccupancyRateForAge(
      ageAtYear,
      input.occupancyDetailEnabled ?? false,
      {
        occupancyRate: safeNumber(input.occupancyRate, 100),
        occupancyRateYear1to2: input.occupancyRateYear1to2,
        occupancyRateYear3to10: input.occupancyRateYear3to10,
        occupancyRateYear11to20: input.occupancyRateYear11to20,
        occupancyRateYear20to30: input.occupancyRateYear20to30,
        occupancyRateYear30to40: input.occupancyRateYear30to40,
      }
    );
    const declineFactor = rentCurveEnabled
      ? Math.pow(1 - rentDeclineEarlyRate / 100, Math.floor((Math.min(year, rentDeclineSwitchYear) - 1) / 2)) *
        Math.pow(1 - rentDeclineLateRate / 100, Math.floor(Math.max(0, year - rentDeclineSwitchYear) / 2))
      : Math.pow(1 - rentDeclineRate / 100, Math.floor((year - 1) / 2));
    const effectiveOccupancy =
      occupancyDeclineEnabled && year >= occupancyDeclineStartYear
        ? Math.max(0, occupancyRate - occupancyDeclineDelta)
        : occupancyRate;
    let vacancyLoss = 0;
    if (input.vacancyModel === 'CYCLE') {
      const cycleYears = Math.max(1, Math.round(safeNumber(input.vacancyCycleYears, 4)));
      const cycleMonths = Math.max(0, safeNumber(input.vacancyCycleMonths, 0));
      if (cycleYears > 0 && year % cycleYears === 0) {
        vacancyLoss = cycleMonths / 12;
      }
    } else if (input.vacancyModel === 'PROBABILITY') {
      const probability = Math.max(0, safeNumber(input.vacancyProbability, 0)) / 100;
      const months = Math.max(0, safeNumber(input.vacancyProbabilityMonths, 0));
      vacancyLoss = probability * (months / 12);
    }
    const adjustedOccupancy = Math.min(100, Math.max(0, effectiveOccupancy * (1 - vacancyLoss)));
    const grossPotentialRent = baseAnnualRent * declineFactor;
    const grossIncome = grossPotentialRent * (adjustedOccupancy / 100);
    const opExpenseRate = safeNumber(input.operatingExpenseRate, 0);
    const oerTemplateType =
      input.oerTemplateType ?? inferOerPropertyType(input.structure, input.unitCount);
    const baseTemplateRate = getOerRateForAge(
      oerTemplateType,
      safeNumber(input.buildingAge, 0)
    );
    const shouldAutoOer =
      input.oerMode === "SIMPLE" && Math.abs(opExpenseRate - baseTemplateRate) < 0.01;
    const dynamicOerRate = getOerRateForAge(oerTemplateType, ageAtYear);
    const opExpense =
      input.oerMode === "DETAILED"
        ? calculateOerDetailed(
            year,
            grossPotentialRent,
            grossIncome,
            Array.isArray(input.oerRateItems) ? input.oerRateItems : [],
            Array.isArray(input.oerFixedItems) ? input.oerFixedItems : [],
            Array.isArray(input.oerEventItems) ? input.oerEventItems : [],
            input.oerLeasingEnabled ?? true,
            safeNumber(input.oerLeasingMonths, 0),
            safeNumber(input.oerLeasingTenancyYears, 0)
          )
        : grossIncome * ((shouldAutoOer ? dynamicOerRate : opExpenseRate) / 100);
    const repairCost = Array.isArray(input.repairEvents)
      ? input.repairEvents.reduce((sum, event) => {
          if (event?.year !== year) return sum;
          const amount = Number.isFinite(event.amount) ? event.amount : 0;
          return sum + Math.max(0, amount);
        }, 0)
      : 0;

    // --- B. ローン返済計算（元利均等） ---
    let yearlyInterest = 0;
    let yearlyPrincipal = 0;

    const shockedRate = shockEnabled && year >= shockYear
      ? input.interestRate + shockDelta
      : input.interestRate;
    if (shockedRate !== currentInterestRate) {
      currentInterestRate = shockedRate;
      const remainingYears = Math.max(0, input.loanDuration - (year - 1));
      currentMonthlyPayment =
        remainingYears > 0
          ? calculatePMT(currentInterestRate, remainingYears, currentLoanBalance)
          : 0;
    }
    
    // 12ヶ月分の利息・元金内訳を計算
    for (let m = 0; m < 12; m++) {
      if (currentLoanBalance <= 0) break;
      const interest = currentLoanBalance * (currentInterestRate / 100 / 12);
      const principal = currentMonthlyPayment - interest;
      
      yearlyInterest += interest;
      yearlyPrincipal += principal;
      currentLoanBalance -= principal;
    }
    // 完済後の処理
    if (currentLoanBalance < 0) currentLoanBalance = 0;
    const yearlyLoanPayment = yearlyInterest + yearlyPrincipal;

    // --- C. 減価償却費計算（定額法） ---
    let depreciationBody = 0;
    let depreciationEquipment = 0;

    if (year <= bodyLife) {
      depreciationBody = bodyPrice / bodyLife;
    }
    if (input.enableEquipmentSplit && year <= equipmentLife) {
      depreciationEquipment = equipmentPrice / equipmentLife;
    }
    const depreciationTotal = depreciationBody + depreciationEquipment;

    // --- D. 税金計算 ---
    // 不動産所得 = 収入 - 経費 - 利息 - 減価償却
    const realEstateIncome =
      grossIncome - opExpense - repairCost - yearlyInterest - depreciationTotal - fixedAssetTax;
    
    let taxAmount = 0;
    if (input.taxType === 'INDIVIDUAL') {
      const otherIncome = safeNumber(input.otherIncome, 0);
      const adjustedRealEstateIncome =
        realEstateIncome < 0
          ? realEstateIncome + yearlyInterest * landRatio
          : realEstateIncome;
      const totalTaxableIncome = otherIncome + adjustedRealEstateIncome;
      const totalTax = calculateProgressiveTax(totalTaxableIncome);
      const baseTax = calculateProgressiveTax(otherIncome);
      taxAmount = totalTax - baseTax;
    } else {
      if (realEstateIncome > 0) {
        const rate = realEstateIncome <= 8000000 ? 0.15 : 0.23;
        taxAmount = realEstateIncome * rate;
      }
      taxAmount += safeNumber(input.corporateMinimumTax, 0);
    }
    taxAmount = Math.round(taxAmount);

    // --- E. キャッシュフロー計算 ---
    const acquisitionTax = year === 2 ? acquisitionTaxEstimate : 0;
    // 税引前CF = 収入 - 経費 - ローン返済総額（元金+利息）
    const cashFlowPreTax =
      grossIncome - opExpense - repairCost - yearlyLoanPayment - fixedAssetTax - acquisitionTax;
    // 税引後CF = 税引前CF - 税金
    const cashFlowPostTax = cashFlowPreTax - taxAmount;

    // --- F. デッドクロス判定 ---
    // 元金返済額 > 減価償却費 になるとデッドクロス（黒字倒産リスク） 
    const isDeadCross = yearlyPrincipal > depreciationTotal;

    results.push({
      year,
      grossPotentialRent,
      income: grossIncome,
      expense: opExpense,
      propertyTax: fixedAssetTax,
      repairCost,
      loanPaymentTotal: yearlyLoanPayment,
      loanInterest: yearlyInterest,
      loanPrincipal: yearlyPrincipal,
      loanBalance: Math.max(0, currentLoanBalance),
      depreciationBody,
      depreciationEquipment,
      depreciationTotal,
      taxableIncome: realEstateIncome,
      taxAmount,
      cashFlowPreTax,
      cashFlowPostTax,
      acquisitionTax,
      isDeadCross
    });
  }

  return results;
};
