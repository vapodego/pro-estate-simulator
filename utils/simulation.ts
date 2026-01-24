import { PropertyInput, YearlyResult, ScenarioConfig, LEGAL_USEFUL_LIFE, StructureType } from './types';

// 中古耐用年数の計算（簡便法） 
export const calculateUsefulLife = (structure: StructureType, age: number): number => {
  const legalLife = LEGAL_USEFUL_LIFE[structure];
  if (age >= legalLife) {
    return Math.floor(legalLife * 0.2);
  }
  return Math.floor((legalLife - age) + (age * 0.2));
};

// 固定資産税の概算（住宅用地特例・簡易評価）
const calculatePropertyTax = (
  price: number,
  buildingRatio: number,
  landEvaluationRate: number,
  buildingEvaluationRate: number,
  landTaxReductionRate: number,
  propertyTaxRate: number
): number => {
  const safePrice = Number.isFinite(price) ? price : 0;
  const safeRatio = Number.isFinite(buildingRatio) ? buildingRatio : 0;
  const safeLandRate = Number.isFinite(landEvaluationRate) ? landEvaluationRate : 70;
  const safeBuildingRate = Number.isFinite(buildingEvaluationRate) ? buildingEvaluationRate : 50;
  const safeLandReduction = Number.isFinite(landTaxReductionRate) ? landTaxReductionRate : 16.67;
  const safeTaxRate = Number.isFinite(propertyTaxRate) ? propertyTaxRate : 1.4;
  const buildingPrice = safePrice * (safeRatio / 100);
  const landPrice = Math.max(0, safePrice - buildingPrice);
  const landEvaluation = landPrice * (safeLandRate / 100);
  const buildingEvaluation = buildingPrice * (safeBuildingRate / 100);
  const taxableValue = landEvaluation * (safeLandReduction / 100) + buildingEvaluation;
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

// メインのシミュレーション関数
export const calculateSimulation = (
  input: PropertyInput,
  scenario?: ScenarioConfig
): YearlyResult[] => {
  const results: YearlyResult[] = [];
  const safeNumber = (value: number, fallback: number) =>
    Number.isFinite(value) ? value : fallback;
  const fixedAssetTax = calculatePropertyTax(
    input.price,
    input.buildingRatio,
    input.landEvaluationRate,
    input.buildingEvaluationRate,
    input.landTaxReductionRate,
    input.propertyTaxRate
  );

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
    // --- A. インカム計算 ---
    // 家賃収入（入居率・家賃下落率を考慮） [cite: 625]
    const baseAnnualRent = safeNumber(input.monthlyRent, 0) * 12;
    const rentDeclineRate = safeNumber(input.rentDeclineRate, 0);
    const occupancyRate = safeNumber(input.occupancyRate, 100);
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
    const grossIncome = baseAnnualRent * declineFactor * (adjustedOccupancy / 100);
    const opExpenseRate = safeNumber(input.operatingExpenseRate, 0);
    const opExpense = grossIncome * (opExpenseRate / 100);
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
