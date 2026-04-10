import type { DealDocument } from "../utils/deal";
import type { PropertyInput, YearlyResult } from "../utils/types";

export const createBasePropertyInput = (
  overrides: Partial<PropertyInput> = {},
): PropertyInput => ({
  investmentMode: "EXISTING_ASSET",
  price: 100_000_000,
  buildingRatio: 70,
  miscCostRate: 5,
  landEvaluationRate: 70,
  buildingEvaluationRate: 50,
  landTaxReductionRate: 16.67,
  propertyTaxRate: 1.7,
  newBuildTaxReductionEnabled: false,
  newBuildTaxReductionYears: 3,
  newBuildTaxReductionRate: 50,
  structure: "RC",
  buildingAge: 12,
  developmentLandPrice: 0,
  developmentConstructionCost: 0,
  developmentSoftCost: 0,
  developmentOtherCost: 0,
  developmentContingencyRate: 0,
  developmentConstructionMonths: 12,
  developmentLeaseUpMonths: 6,
  developmentInterestOnlyMonths: 12,
  siteConditionDemolition: false,
  siteConditionRetainingWall: false,
  siteConditionGroundImprovement: false,
  siteConditionBasement: false,
  siteConditionLogisticsConstraint: false,
  enableEquipmentSplit: false,
  equipmentRatio: 0,
  equipmentUsefulLife: 15,
  waterContributionRate: 0,
  fireInsuranceRate: 0,
  loanFeeRate: 2,
  registrationCostRate: 2,
  acquisitionTaxRate: 3,
  acquisitionLandReductionRate: 50,
  loanCoverageMode: "PRICE_ONLY",
  equityRatio: 20,
  loanAmount: 80_000_000,
  interestRate: 2,
  loanDuration: 35,
  monthlyRent: 1_000_000,
  occupancyRate: 95,
  occupancyDetailEnabled: false,
  occupancyRateYear1to2: 0,
  occupancyRateYear3to10: 0,
  occupancyRateYear11to20: 0,
  occupancyRateYear20to30: 0,
  occupancyRateYear30to40: 0,
  rentDeclineRate: 1,
  unitCount: 10,
  cleaningVisitsPerMonth: 2,
  operatingExpenseRate: 20,
  oerMode: "SIMPLE",
  oerRateItems: [],
  oerFixedItems: [],
  oerEventItems: [],
  oerLeasingEnabled: false,
  oerLeasingMonths: 0,
  oerLeasingTenancyYears: 0,
  repairEvents: [],
  vacancyModel: "FIXED",
  vacancyCycleYears: 0,
  vacancyCycleMonths: 0,
  vacancyProbability: 0,
  vacancyProbabilityMonths: 0,
  taxType: "CORPORATE",
  incomeTaxRate: 0,
  otherIncome: 0,
  corporateMinimumTax: 70_000,
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
  exitEnabled: true,
  exitYear: 10,
  exitCapRate: 5,
  exitBrokerageRate: 3,
  exitBrokerageFixed: 660_000,
  exitOtherCostRate: 1,
  exitShortTermTaxRate: 39.63,
  exitLongTermTaxRate: 20.315,
  exitDiscountRate: 6,
  ...overrides,
});

export const createBaseDealDraft = (): DealDocument => ({
  deal_id: "deal-577",
  metadata: {
    investment_strategy: "existing_asset",
    target_structure: "rc",
    tags: ["source:nifty"],
  },
  sourcing: {
    current_primary_source: "nifty",
  },
  land: {
    title: "No.577 東京都足立区梅田",
    address: "東京都足立区梅田7",
    asking_price_jpy: 76_000_000,
    target_purchase_price_jpy: 76_000_000,
  },
  workflow: {
    pipeline_stage: "volume_ready",
    simulation_status: "not_started",
  },
  volume: {
    status: "complete",
    selected_study_id: "vol_1",
    studies: [
      {
        study_id: "vol_1",
        output_summary: {
          estimated_total_floor_area_sqm: 260,
          estimated_net_leasable_area_sqm: 210,
          estimated_unit_count_max: 10,
          estimated_unit_count_min: 8,
          draft_unit_mix: [
            {
              layout: "1K",
              unit_count: 10,
              average_area_sqm: 21,
              average_monthly_rent_jpy: 100_500,
            },
          ],
        },
      },
    ],
  },
  rent: {
    status: "complete",
    selected_study_id: "rent_1",
    studies: [
      {
        study_id: "rent_1",
        target_monthly_rent_jpy: 1_005_000,
        stabilized_occupancy_percent: 97,
        unit_mix: [
          {
            layout: "1K",
            unit_count: 10,
            average_area_sqm: 21,
            average_monthly_rent_jpy: 100_500,
          },
        ],
      },
    ],
  },
  costs: {
    status: "complete",
    selected_study_id: "cost_1",
    studies: [
      {
        study_id: "cost_1",
        structure: "rc",
        breakdown: {
          land_price_jpy: 76_000_000,
          construction_cost_jpy: 190_000_000,
          total_project_cost_jpy: 284_000_000,
        },
        notes: [],
      },
    ],
  },
  finance: {
    selected_assumption_id: "fin_1",
    assumption_sets: [
      {
        assumption_id: "fin_1",
        loan_to_cost_percent: 80,
        equity_ratio_percent: 20,
        permanent_loan_interest_percent: 2,
        loan_term_years: 35,
        loan_fee_rate_percent: 2,
        hold_years: 10,
        exit_cap_rate_percent: 5,
        discount_rate_percent: 6,
        tax_mode: "corporate",
      },
    ],
  },
  simulation: {
    status: "not_started",
    runs: [],
  },
  decision: {},
});

export const summarizeResults = (results: YearlyResult[]) => {
  if (results.length === 0) {
    return {
      minCashFlow: 0,
      minCashFlowYear: 1,
      minDscr: Number.POSITIVE_INFINITY,
      totalCashFlow: 0,
    };
  }

  let minCashFlow = Number.POSITIVE_INFINITY;
  let minCashFlowYear = results[0].year;
  let minDscr = Number.POSITIVE_INFINITY;
  let totalCashFlow = 0;

  for (const result of results) {
    if (result.cashFlowPostTax < minCashFlow) {
      minCashFlow = result.cashFlowPostTax;
      minCashFlowYear = result.year;
    }
    const dscr =
      result.loanPaymentTotal > 0
        ? (result.income - result.expense - result.propertyTax) / result.loanPaymentTotal
        : Number.POSITIVE_INFINITY;
    if (dscr < minDscr) {
      minDscr = dscr;
    }
    totalCashFlow += result.cashFlowPostTax;
  }

  return {
    minCashFlow,
    minCashFlowYear,
    minDscr,
    totalCashFlow,
  };
};
