import type {
  DevelopmentSiteConditionKey,
  PropertyInput,
  StructureType,
  YearlyResult,
} from "./types";
import { getDevelopmentCostSummary, isDevelopmentMode } from "./development";

type JsonObject = Record<string, unknown>;

export type DealDocument = JsonObject;

export type DealImportSummary = {
  address: string | null;
  dealId: string;
  source: string;
  strategy: string;
  title: string;
  warnings: string[];
};

export type DealImportResult = {
  dealDraft: DealDocument;
  patch: Partial<PropertyInput>;
  summary: DealImportSummary;
};

type ScenarioSummary = {
  minCashFlow: number;
  minCashFlowYear: number;
  minDscr: number;
  totalCashFlow: number;
};

type ScoringSummary = {
  decision: string;
  grade: string;
  totalScore: number;
};

type AdditionalScoringSummary = ScoringSummary & {
  memoRiskFlags: string[];
};

type BuildDealSimulationExportParams = {
  additionalInfoScore: AdditionalScoringSummary;
  baseEquityMultiple: number | null;
  baseSummary: ScenarioSummary;
  dealDraft: DealDocument;
  exitIrr: number | null;
  exitNpv: number | null;
  exitSalePrice: number;
  firstDeadCrossYear: number | null;
  importedWarnings: string[];
  input: PropertyInput;
  investmentScore: ScoringSummary;
  results: YearlyResult[];
  safetyScore: number;
  totalProjectCost: number;
};

const TERMINAL_PIPELINE_STAGES = new Set([
  "rejected",
  "archived",
  "go",
  "purchased",
]);

const DEVELOPMENT_SITE_CONDITION_NOTE_PREFIX = "Simulator site conditions:";
const DEVELOPMENT_SITE_CONDITION_NOTE_TOKENS: Record<DevelopmentSiteConditionKey, string> = {
  siteConditionDemolition: "demolition",
  siteConditionRetainingWall: "retaining_wall",
  siteConditionGroundImprovement: "ground_improvement",
  siteConditionBasement: "basement",
  siteConditionLogisticsConstraint: "logistics_constraint",
};

function buildDevelopmentSiteConditionNote(input: PropertyInput) {
  const selectedTokens = (Object.entries(DEVELOPMENT_SITE_CONDITION_NOTE_TOKENS) as [
    DevelopmentSiteConditionKey,
    string,
  ][])
    .filter(([key]) => input[key])
    .map(([, token]) => token);
  return `${DEVELOPMENT_SITE_CONDITION_NOTE_PREFIX} ${
    selectedTokens.length > 0 ? selectedTokens.join(", ") : "none"
  }`;
}

function parseDevelopmentSiteConditionNotes(notes: unknown): Partial<
  Pick<PropertyInput, DevelopmentSiteConditionKey>
> {
  const matchedNote = asStringArray(notes).find((note) =>
    note.startsWith(DEVELOPMENT_SITE_CONDITION_NOTE_PREFIX)
  );
  if (!matchedNote) return {};

  const rawValue = matchedNote.slice(DEVELOPMENT_SITE_CONDITION_NOTE_PREFIX.length).trim().toLowerCase();
  if (!rawValue || rawValue === "none") {
    return {};
  }

  const tokens = new Set(
    rawValue
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
  );

  return (Object.entries(DEVELOPMENT_SITE_CONDITION_NOTE_TOKENS) as [
    DevelopmentSiteConditionKey,
    string,
  ][]).reduce<Partial<Pick<PropertyInput, DevelopmentSiteConditionKey>>>((accumulator, [key, token]) => {
    if (tokens.has(token)) {
      accumulator[key] = true;
    }
    return accumulator;
  }, {});
}

export function parseDealForSimulation(text: string): DealImportResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Deal JSON を読み込めませんでした。JSON 形式を確認してください。");
  }

  return buildDealImport(parsed);
}

export function buildDealWithSimulationRun({
  additionalInfoScore,
  baseEquityMultiple,
  baseSummary,
  dealDraft,
  exitIrr,
  exitNpv,
  exitSalePrice,
  firstDeadCrossYear,
  importedWarnings,
  input,
  investmentScore,
  results,
  safetyScore,
  totalProjectCost,
}: BuildDealSimulationExportParams): DealDocument {
  const nextDeal = cloneJson(dealDraft);
  const exportedAt = new Date().toISOString();
  const metadata = ensureObject(nextDeal, "metadata");
  const workflow = ensureObject(nextDeal, "workflow");
  const land = ensureObject(nextDeal, "land");
  const volume = ensureObject(nextDeal, "volume");
  const rent = ensureObject(nextDeal, "rent");
  const costs = ensureObject(nextDeal, "costs");
  const finance = ensureObject(nextDeal, "finance");
  const simulation = ensureObject(nextDeal, "simulation");
  const decision = ensureObject(nextDeal, "decision");
  const dealId = asString(nextDeal.deal_id) ?? "deal";
  const strategy = asString(metadata.investment_strategy) ?? "existing_asset";
  const developmentMode = isDevelopmentMode(input) || strategy === "new_development";
  const mode = developmentMode ? "new_development" : "existing_asset";
  const developmentCosts = developmentMode ? getDevelopmentCostSummary(input) : null;
  const selectedVolumeStudyId = getSelectedItemId(volume, "selected_study_id", "studies", "study_id");
  const existingUnitMix =
    getSelectedVolumeStudyUnitMix(nextDeal) ??
    buildFallbackUnitMix(input.unitCount, input.monthlyRent, null);
  const runId = `simulation_${safeToken(dealId)}_${timestampToken(exportedAt)}`;
  const rentStudyId = `rent_${safeToken(dealId)}_${timestampToken(exportedAt)}`;
  const costStudyId = `cost_${safeToken(dealId)}_${timestampToken(exportedAt)}`;
  const financeAssumptionId = `finance_${safeToken(dealId)}_${timestampToken(exportedAt)}`;
  const year1 = results[0] ?? null;
  const stabilizedAnnualRent =
    input.monthlyRent > 0 ? Math.round(input.monthlyRent * 12 * (input.occupancyRate / 100)) : null;
  const year1Noi =
    year1 !== null ? Math.round(year1.income - year1.expense - year1.propertyTax) : null;
  const breakEvenOccupancyPercent =
    year1 && year1.grossPotentialRent > 0
      ? roundNumber(
          ((year1.expense + year1.propertyTax + year1.repairCost + year1.loanPaymentTotal) /
            year1.grossPotentialRent) *
            100,
          2,
        )
      : null;
  const equityRequired = Math.max(0, Math.round(totalProjectCost - input.loanAmount));
  const landPrice = chooseNumber(
    developmentCosts?.landPrice ?? null,
    asNumber(getPath(land, "target_purchase_price_jpy")),
    asNumber(getPath(land, "asking_price_jpy")),
    roundInteger(totalProjectCost - (totalProjectCost * (input.buildingRatio / 100))),
  );
  const buildingPrice = Math.max(
    0,
    developmentCosts?.constructionCost ??
      (roundInteger(totalProjectCost * (input.buildingRatio / 100)) ?? 0),
  );
  const initialCosts = Math.max(0, totalProjectCost - Math.round(input.price));
  const financeCost = Math.round((Math.max(0, input.loanAmount) * Math.max(0, input.loanFeeRate)) / 100);
  const registrationCost = Math.round((Math.max(0, input.price) * Math.max(0, input.registrationCostRate)) / 100);
  const acquisitionTaxCost = Math.round((Math.max(0, input.price) * Math.max(0, input.acquisitionTaxRate)) / 100);
  const waterContributionCost = Math.round((Math.max(0, input.price) * Math.max(0, input.waterContributionRate)) / 100);
  const miscCost = Math.max(
    0,
    initialCosts - financeCost - registrationCost - acquisitionTaxCost - waterContributionCost,
  );
  const warnings = buildSimulationWarnings({
    input,
    importedWarnings,
    mode,
    strategy,
    totalProjectCost,
  });

  metadata.investment_strategy = mode;
  metadata.target_structure = mapSimulatorStructureToDeal(input.structure);
  metadata.tags = uniqueStrings(asStringArray(metadata.tags), ["tool:pro-estate-simulator"]);
  nextDeal.updated_at = exportedAt;

  if (!asString(land.address) && asString(land.address) !== null) {
    land.address = asString(land.address);
  }

  const nextRentStudy: JsonObject = {
    study_id: rentStudyId,
    created_at: exportedAt,
    method: "manual",
    target_monthly_rent_jpy: input.monthlyRent > 0 ? Math.round(input.monthlyRent) : null,
    average_rent_per_sqm_jpy:
      input.monthlyRent > 0 && existingUnitMix.length > 0
        ? roundInteger(input.monthlyRent / Math.max(sumUnitMixArea(existingUnitMix), 1))
        : null,
    stabilized_occupancy_percent: roundPercent(input.occupancyRate),
    lease_up_months: mode === "new_development" ? Math.max(0, Math.round(input.developmentLeaseUpMonths)) : null,
    unit_mix: existingUnitMix,
    supporting_notes: [
      `Simulator monthly rent input: ${Math.round(input.monthlyRent).toLocaleString()}円`,
      `Simulator occupancy input: ${roundPercent(input.occupancyRate) ?? 0}%`,
    ],
    payload_artifact_id: null,
  };

  const nextCostStudy: JsonObject = {
    study_id: costStudyId,
    created_at: exportedAt,
    method: "manual",
    structure: mapSimulatorStructureToDeal(input.structure),
    gross_floor_area_sqm: chooseNumber(getSelectedVolumeStudyGrossFloorArea(nextDeal), null),
    net_leasable_area_sqm: chooseNumber(getSelectedVolumeStudyNetArea(nextDeal), null),
    cost_per_sqm_jpy: null,
    cost_per_tsubo_jpy: null,
    contingency_rate_percent: roundPercent(input.miscCostRate),
    breakdown: {
      land_price_jpy: landPrice,
      demolition_cost_jpy: null,
      site_work_cost_jpy:
        mode === "new_development" && developmentCosts && developmentCosts.otherCost > 0
          ? developmentCosts.otherCost
          : null,
      ground_improvement_cost_jpy: null,
      construction_cost_jpy: buildingPrice,
      design_and_pm_cost_jpy:
        mode === "new_development" && developmentCosts
          ? developmentCosts.softCost > 0
            ? developmentCosts.softCost
            : null
          : miscCost > 0
            ? miscCost
            : null,
      permit_and_approval_cost_jpy: null,
      utilities_and_water_cost_jpy: waterContributionCost > 0 ? waterContributionCost : null,
      sales_and_leasing_cost_jpy: null,
      finance_cost_jpy: financeCost > 0 ? financeCost : null,
      taxes_and_acquisition_cost_jpy:
        registrationCost + acquisitionTaxCost > 0
          ? registrationCost + acquisitionTaxCost
          : null,
      contingency_cost_jpy:
        mode === "new_development" && developmentCosts
          ? developmentCosts.contingencyCost > 0
            ? developmentCosts.contingencyCost
            : null
          : null,
      total_project_cost_jpy: roundInteger(totalProjectCost),
    },
    schedule: {
      land_settlement_month: mode === "new_development" ? 0 : null,
      construction_months:
        mode === "new_development" ? Math.max(1, Math.round(input.developmentConstructionMonths)) : null,
      lease_up_months:
        mode === "new_development" ? Math.max(0, Math.round(input.developmentLeaseUpMonths)) : null,
      stabilization_month:
        mode === "new_development"
          ? Math.max(
              1,
              Math.round(input.developmentConstructionMonths) +
                Math.max(0, Math.round(input.developmentLeaseUpMonths))
            )
          : null,
    },
    notes: [
      mode === "new_development"
        ? "Current simulator stores a development-mode cost snapshot with construction and lease-up assumptions."
        : "Current simulator stores a manual cost snapshot from the existing-asset workflow.",
      ...(mode === "new_development" ? [buildDevelopmentSiteConditionNote(input)] : []),
    ],
  };

  const totalCostForLtc = totalProjectCost > 0 ? totalProjectCost : input.price;
  const equityRatioPercent =
    totalCostForLtc > 0
      ? roundPercent((Math.max(totalCostForLtc - input.loanAmount, 0) / totalCostForLtc) * 100)
      : roundPercent(input.equityRatio);
  const loanToCostPercent =
    totalCostForLtc > 0 ? roundPercent((Math.max(input.loanAmount, 0) / totalCostForLtc) * 100) : null;
  const nextFinanceAssumption: JsonObject = {
    assumption_id: financeAssumptionId,
    name: `Simulator export ${new Date(exportedAt).toLocaleDateString("ja-JP")}`,
    loan_to_cost_percent: loanToCostPercent,
    equity_ratio_percent: equityRatioPercent,
    construction_loan_interest_percent:
      mode === "new_development" ? roundPercent(input.interestRate) : null,
    permanent_loan_interest_percent: roundPercent(input.interestRate),
    loan_term_years: Math.round(input.loanDuration),
    interest_only_months:
      mode === "new_development"
        ? Math.max(0, Math.round(input.developmentInterestOnlyMonths))
        : 0,
    loan_fee_rate_percent: roundPercent(input.loanFeeRate),
    hold_years: input.exitEnabled ? Math.round(input.exitYear) : null,
    exit_cap_rate_percent: input.exitEnabled ? roundPercent(input.exitCapRate) : null,
    discount_rate_percent: input.exitEnabled ? roundPercent(input.exitDiscountRate) : null,
    tax_mode: input.taxType === "INDIVIDUAL" ? "individual" : "corporate",
  };

  const nextRun: JsonObject = {
    run_id: runId,
    created_at: exportedAt,
    mode,
    engine_name: "pro-estate-simulator",
    engine_version: developmentMode ? "development-v1" : "existing-v1",
    selected_volume_study_id: selectedVolumeStudyId,
    selected_rent_study_id: rentStudyId,
    selected_cost_study_id: costStudyId,
    selected_finance_assumption_id: financeAssumptionId,
    summary: {
      stabilized_annual_rent_jpy: stabilizedAnnualRent,
      year_1_noi_jpy: year1Noi,
      stabilized_noi_jpy: year1Noi,
      year_1_cash_flow_before_tax_jpy: year1 ? Math.round(year1.cashFlowPreTax) : null,
      year_1_cash_flow_after_tax_jpy: year1 ? Math.round(year1.cashFlowPostTax) : null,
      irr_percent: exitIrr !== null ? roundNumber(exitIrr * 100, 2) : null,
      npv_jpy: exitNpv !== null ? Math.round(exitNpv) : null,
      equity_multiple: baseEquityMultiple !== null ? roundNumber(baseEquityMultiple, 3) : null,
      dscr_min: Number.isFinite(baseSummary.minDscr) ? roundNumber(baseSummary.minDscr, 3) : null,
      break_even_occupancy_percent: breakEvenOccupancyPercent,
      total_project_cost_jpy: roundInteger(totalProjectCost),
      equity_required_jpy: roundInteger(equityRequired),
      max_draw_jpy: Math.round(Math.max(input.loanAmount, 0)),
      exit_value_jpy: input.exitEnabled ? Math.round(exitSalePrice) : null,
      profit_on_cost_percent:
        year1Noi !== null && totalProjectCost > 0
          ? roundNumber((year1Noi / totalProjectCost) * 100, 2)
          : null,
    },
    annual_results: results.map((result) => ({
      year: result.year,
      gross_income_jpy: Math.round(result.grossPotentialRent),
      opex_jpy: Math.round(result.expense + result.propertyTax),
      noi_jpy: Math.round(result.income - result.expense - result.propertyTax),
      debt_service_jpy: Math.round(result.loanPaymentTotal),
      cash_flow_before_tax_jpy: Math.round(result.cashFlowPreTax),
      cash_flow_after_tax_jpy: Math.round(result.cashFlowPostTax),
    })),
    warnings,
    payload_artifact_id: null,
  };

  rent.status = input.monthlyRent > 0 ? "complete" : "in_progress";
  rent.selected_study_id = rentStudyId;
  rent.studies = [...asObjectArray(rent.studies), nextRentStudy];

  costs.status = totalProjectCost > 0 ? "complete" : "in_progress";
  costs.selected_study_id = costStudyId;
  costs.studies = [...asObjectArray(costs.studies), nextCostStudy];

  finance.selected_assumption_id = financeAssumptionId;
  finance.assumption_sets = [...asObjectArray(finance.assumption_sets), nextFinanceAssumption];

  simulation.status = "complete";
  simulation.selected_run_id = runId;
  simulation.runs = [...asObjectArray(simulation.runs), nextRun];

  workflow.simulation_status = "complete";
  workflow.last_writer = "pro-estate-simulator";
  workflow.next_action =
    strategy === "new_development"
      ? "Review the development simulation assumptions and final IC memo."
      : "Review the final investment memo and go/no-go decision.";
  if (!TERMINAL_PIPELINE_STAGES.has(asString(workflow.pipeline_stage) ?? "")) {
    workflow.pipeline_stage = "simulated";
  }

  if (getSelectedItemId(volume, "selected_study_id", "studies", "study_id")) {
    workflow.volume_status = "complete";
  }

  decision.recommended_action = mapDecisionToRecommendedAction(investmentScore.decision);
  decision.investment_score = roundPercent(investmentScore.totalScore);
  decision.thesis = buildDecisionThesis({
    baseSummary,
    exitIrr,
    input,
    safetyScore,
    year1,
  });
  decision.major_risks = buildMajorRisks({
    firstDeadCrossYear,
    importedWarnings,
    input,
    mode,
    strategy,
    summary: baseSummary,
  });
  decision.upside_points = buildUpsidePoints({
    additionalInfoScore,
    exitIrr,
    investmentScore,
    safetyScore,
    summary: baseSummary,
    year1,
  });
  decision.required_followups = buildRequiredFollowups({
    input,
    mode,
    strategy,
    warnings,
  });
  decision.selected_run_id = runId;

  return nextDeal;
}

export function buildDealSimulationExportFilename(dealDraft: DealDocument) {
  const dealId = asString(dealDraft.deal_id) ?? "deal";
  return `${safeToken(dealId)}__simulation-run.json`;
}

function buildDealImport(parsed: unknown): DealImportResult {
  const root = asObject(parsed);
  if (!root) {
    throw new Error("Deal JSON のトップレベルが object ではありません。");
  }

  const metadata = asObject(root.metadata);
  const sourcing = asObject(root.sourcing);
  const land = asObject(root.land);
  if (!land) {
    throw new Error("Deal JSON に `land` セクションが見つかりませんでした。");
  }

  const dealId = asString(root.deal_id);
  if (!dealId) {
    throw new Error("Deal JSON に `deal_id` がありません。");
  }

  const strategy = asString(metadata?.investment_strategy) ?? "existing_asset";
  const title = asString(land.title) ?? dealId;
  const address = asString(land.address);
  const selectedVolumeStudy = getSelectedItem(asObject(root.volume), "selected_study_id", "studies", "study_id");
  const selectedRentStudy = getSelectedItem(asObject(root.rent), "selected_study_id", "studies", "study_id");
  const selectedCostStudy = getSelectedItem(asObject(root.costs), "selected_study_id", "studies", "study_id");
  const selectedFinance = getSelectedItem(
    asObject(root.finance),
    "selected_assumption_id",
    "assumption_sets",
    "assumption_id",
  );
  const source = resolveLeadSource(sourcing);
  const patch: Partial<PropertyInput> = {};
  const warnings: string[] = [];
  const developmentMode = strategy === "new_development";

  const totalProjectCost = asNumber(getPath(selectedCostStudy, "breakdown", "total_project_cost_jpy"));
  const landPrice = chooseNumber(
    asNumber(getPath(selectedCostStudy, "breakdown", "land_price_jpy")),
    asNumber(land.asking_price_jpy),
    asNumber(land.target_purchase_price_jpy),
  );

  if (totalProjectCost !== null) {
    patch.price = Math.round(totalProjectCost);
    patch.miscCostRate = 0;
    patch.waterContributionRate = 0;
    patch.fireInsuranceRate = 0;
    patch.loanFeeRate = 0;
    patch.registrationCostRate = 0;
    patch.acquisitionTaxRate = 0;
    patch.acquisitionLandReductionRate = 0;
    warnings.push(
      "総事業費を simulator の価格欄へ流し込みました。初期費用率は二重計上を避けるため 0 にリセットしています。",
    );
  } else {
    const askingPrice = chooseNumber(
      asNumber(land.asking_price_jpy),
      asNumber(land.target_purchase_price_jpy),
    );
    if (askingPrice !== null) {
      patch.price = Math.round(askingPrice);
      warnings.push("総事業費が未登録のため、価格には土地価格のみを流し込みました。");
    } else {
      warnings.push("価格情報が未登録です。Step 2 で総事業費または価格を入力してください。");
    }
  }

  if (patch.price && landPrice !== null && patch.price > 0) {
    patch.buildingRatio = roundPercent(((patch.price - landPrice) / patch.price) * 100) ?? 0;
  }

  const simulatorStructure = mapDealStructureToSimulator(
    asString(getPath(selectedCostStudy, "structure")) ??
      asString(metadata?.target_structure),
  );
  if (simulatorStructure) {
    patch.structure = simulatorStructure;
  }

  patch.investmentMode = developmentMode ? "NEW_DEVELOPMENT" : "EXISTING_ASSET";

  if (developmentMode) {
    const importedSiteConditions = parseDevelopmentSiteConditionNotes(selectedCostStudy?.notes);
    patch.buildingAge = 0;
    patch.newBuildTaxReductionEnabled = true;
    patch.developmentLandPrice =
      asNumber(getPath(selectedCostStudy, "breakdown", "land_price_jpy")) ??
      asNumber(land.asking_price_jpy) ??
      asNumber(land.target_purchase_price_jpy) ??
      0;
    patch.developmentConstructionCost =
      asNumber(getPath(selectedCostStudy, "breakdown", "construction_cost_jpy")) ?? 0;
    patch.developmentSoftCost =
      (asNumber(getPath(selectedCostStudy, "breakdown", "design_and_pm_cost_jpy")) ?? 0) +
      (asNumber(getPath(selectedCostStudy, "breakdown", "permit_and_approval_cost_jpy")) ?? 0) +
      (asNumber(getPath(selectedCostStudy, "breakdown", "utilities_and_water_cost_jpy")) ?? 0) +
      (asNumber(getPath(selectedCostStudy, "breakdown", "sales_and_leasing_cost_jpy")) ?? 0) +
      (asNumber(getPath(selectedCostStudy, "breakdown", "finance_cost_jpy")) ?? 0) +
      (asNumber(getPath(selectedCostStudy, "breakdown", "taxes_and_acquisition_cost_jpy")) ?? 0);
    patch.developmentOtherCost =
      (asNumber(getPath(selectedCostStudy, "breakdown", "demolition_cost_jpy")) ?? 0) +
      (asNumber(getPath(selectedCostStudy, "breakdown", "site_work_cost_jpy")) ?? 0) +
      (asNumber(getPath(selectedCostStudy, "breakdown", "ground_improvement_cost_jpy")) ?? 0);
    patch.developmentContingencyRate =
      (() => {
        const contingencyCost = asNumber(getPath(selectedCostStudy, "breakdown", "contingency_cost_jpy"));
        const baseCost =
          Math.max(0, patch.developmentConstructionCost ?? 0) +
          Math.max(0, patch.developmentSoftCost ?? 0) +
          Math.max(0, patch.developmentOtherCost ?? 0);
        if (contingencyCost === null || baseCost <= 0) return 5;
        return roundPercent((contingencyCost / baseCost) * 100) ?? 5;
      })();
    patch.developmentConstructionMonths =
      Math.round(asNumber(getPath(selectedCostStudy, "schedule", "construction_months")) ?? 12);
    patch.developmentLeaseUpMonths =
      Math.round(asNumber(getPath(selectedCostStudy, "schedule", "lease_up_months")) ?? 6);
    patch.developmentInterestOnlyMonths =
      Math.round(
        asNumber(getPath(selectedFinance, "interest_only_months")) ??
          asNumber(getPath(selectedCostStudy, "schedule", "stabilization_month")) ??
          ((patch.developmentConstructionMonths ?? 12) + (patch.developmentLeaseUpMonths ?? 6))
      );
    patch.siteConditionDemolition =
      importedSiteConditions.siteConditionDemolition ??
      ((asNumber(getPath(selectedCostStudy, "breakdown", "demolition_cost_jpy")) ?? 0) > 0);
    patch.siteConditionRetainingWall = importedSiteConditions.siteConditionRetainingWall ?? false;
    patch.siteConditionGroundImprovement =
      importedSiteConditions.siteConditionGroundImprovement ??
      ((asNumber(getPath(selectedCostStudy, "breakdown", "ground_improvement_cost_jpy")) ?? 0) > 0);
    patch.siteConditionBasement = importedSiteConditions.siteConditionBasement ?? false;
    patch.siteConditionLogisticsConstraint =
      importedSiteConditions.siteConditionLogisticsConstraint ?? false;
    warnings.push("この Deal は新築開発案件として読み込みました。工期とリーシング前提を Step 2 で確認してください。");
  }

  const selectedUnitMix =
    asObjectArray(getPath(selectedRentStudy, "unit_mix")).length > 0
      ? asObjectArray(getPath(selectedRentStudy, "unit_mix"))
      : asObjectArray(getPath(selectedVolumeStudy, "output_summary", "draft_unit_mix"));

  const monthlyRent = chooseNumber(
    asNumber(getPath(selectedRentStudy, "target_monthly_rent_jpy")),
    deriveMonthlyRentFromUnitMix(selectedUnitMix),
  );
  if (monthlyRent !== null) {
    patch.monthlyRent = Math.round(monthlyRent);
  } else {
    warnings.push("賃料スタディが未登録です。Step 2 で月額賃料を入力してください。");
  }

  const occupancy = asNumber(getPath(selectedRentStudy, "stabilized_occupancy_percent"));
  if (occupancy !== null) {
    patch.occupancyRate = occupancy;
  }

  const unitCount = chooseNumber(
    sumUnitMixCount(selectedUnitMix),
    asNumber(getPath(selectedVolumeStudy, "output_summary", "estimated_unit_count_max")),
    asNumber(getPath(selectedVolumeStudy, "output_summary", "estimated_unit_count_min")),
  );
  if (unitCount !== null) {
    patch.unitCount = Math.round(unitCount);
  } else if (!selectedVolumeStudy) {
    warnings.push("ボリュームスタディが未登録です。戸数は手入力してください。");
  }

  const financeRate = chooseNumber(
    asNumber(getPath(selectedFinance, "permanent_loan_interest_percent")),
    asNumber(getPath(selectedFinance, "construction_loan_interest_percent")),
  );
  if (financeRate !== null) {
    patch.interestRate = financeRate;
  }

  const loanTermYears = asNumber(getPath(selectedFinance, "loan_term_years"));
  if (loanTermYears !== null) {
    patch.loanDuration = Math.round(loanTermYears);
  }

  const equityRatio = chooseNumber(
    asNumber(getPath(selectedFinance, "equity_ratio_percent")),
    (() => {
      const loanToCost = asNumber(getPath(selectedFinance, "loan_to_cost_percent"));
      return loanToCost !== null ? 100 - loanToCost : null;
    })(),
  );
  if (equityRatio !== null) {
    patch.equityRatio = roundPercent(equityRatio) ?? equityRatio;
  }

  if (patch.price && patch.price > 0) {
    const loanAmount = chooseNumber(
      (() => {
        const loanToCost = asNumber(getPath(selectedFinance, "loan_to_cost_percent"));
        return loanToCost !== null ? (patch.price * loanToCost) / 100 : null;
      })(),
      equityRatio !== null ? patch.price * (1 - equityRatio / 100) : null,
    );
    if (loanAmount !== null) {
      patch.loanAmount = Math.round(loanAmount);
    }
  }

  const loanFeeRate = asNumber(getPath(selectedFinance, "loan_fee_rate_percent"));
  if (loanFeeRate !== null && totalProjectCost === null) {
    patch.loanFeeRate = loanFeeRate;
  }

  const holdYears = asNumber(getPath(selectedFinance, "hold_years"));
  const exitCapRate = asNumber(getPath(selectedFinance, "exit_cap_rate_percent"));
  const discountRate = asNumber(getPath(selectedFinance, "discount_rate_percent"));
  if (holdYears !== null) {
    patch.exitYear = Math.round(holdYears);
  }
  if (exitCapRate !== null) {
    patch.exitCapRate = exitCapRate;
  }
  if (discountRate !== null) {
    patch.exitDiscountRate = discountRate;
  }
  if (holdYears !== null && exitCapRate !== null) {
    patch.exitEnabled = true;
  }

  const taxMode = asString(getPath(selectedFinance, "tax_mode"));
  if (taxMode === "individual") {
    patch.taxType = "INDIVIDUAL";
  } else if (taxMode === "corporate") {
    patch.taxType = "CORPORATE";
  }

  if (!selectedCostStudy) {
    warnings.push("コストスタディが未登録です。価格と構成比は Step 2 で確認してください。");
  }
  if (!selectedFinance) {
    warnings.push("融資条件が未登録です。金利・借入額・借入期間は Step 2 で補完してください。");
  }

  return {
    dealDraft: root,
    patch,
    summary: {
      address,
      dealId,
      source,
      strategy,
      title,
      warnings: uniqueStrings(warnings),
    },
  };
}

function buildSimulationWarnings(params: {
  importedWarnings: string[];
  input: PropertyInput;
  mode: string;
  strategy: string;
  totalProjectCost: number;
}) {
  const warnings = [...params.importedWarnings];

  if (params.strategy === "new_development") {
    warnings.push(
      "Development mode assumptions should be checked against the latest construction schedule, lease-up plan, and funding terms.",
    );
  }
  if (params.input.monthlyRent <= 0) {
    warnings.push("Monthly rent input is blank or zero.");
  }
  if (params.totalProjectCost <= 0) {
    warnings.push("Total project cost is blank or zero.");
  }
  if (!params.input.exitEnabled) {
    warnings.push("Exit assumptions are disabled in the current run.");
  }
  if (params.mode === "new_development" && params.input.buildingAge > 0) {
    warnings.push("Development mode bridge received a non-zero building age.");
  }

  return uniqueStrings(warnings);
}

function buildDecisionThesis(params: {
  baseSummary: ScenarioSummary;
  exitIrr: number | null;
  input: PropertyInput;
  safetyScore: number;
  year1: YearlyResult | null;
}) {
  const parts = [
    `安全スコア ${Math.round(params.safetyScore)}`,
    params.year1
      ? `年1税後CF ${Math.round(params.year1.cashFlowPostTax).toLocaleString()}円`
      : null,
    Number.isFinite(params.baseSummary.minDscr)
      ? `最低DSCR ${params.baseSummary.minDscr.toFixed(2)}`
      : null,
    params.exitIrr !== null ? `出口IRR ${(params.exitIrr * 100).toFixed(2)}%` : null,
    params.input.monthlyRent > 0
      ? `満室想定賃料 ${Math.round(params.input.monthlyRent).toLocaleString()}円/月`
      : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(" / ") : null;
}

function buildMajorRisks(params: {
  firstDeadCrossYear: number | null;
  importedWarnings: string[];
  input: PropertyInput;
  mode: string;
  strategy: string;
  summary: ScenarioSummary;
}) {
  const risks: string[] = [];

  if (params.summary.minCashFlow < 0) {
    risks.push(
      `${params.summary.minCashFlowYear}年目に税後CFがマイナス (${Math.round(
        params.summary.minCashFlow,
      ).toLocaleString()}円)。`,
    );
  }
  if (params.firstDeadCrossYear !== null) {
    risks.push(`${params.firstDeadCrossYear}年目にデッドクロスが発生します。`);
  }
  if (params.input.monthlyRent <= 0) {
    risks.push("賃料前提が未入力です。");
  }
  if (params.strategy === "new_development") {
    risks.push("新築開発案件のため、工期ずれ・リーシング遅延・建築費増額が初期CFを押し下げる可能性があります。");
  }
  risks.push(...params.importedWarnings.slice(0, 3));

  return uniqueStrings(risks).slice(0, 6);
}

function buildUpsidePoints(params: {
  additionalInfoScore: AdditionalScoringSummary;
  exitIrr: number | null;
  investmentScore: ScoringSummary;
  safetyScore: number;
  summary: ScenarioSummary;
  year1: YearlyResult | null;
}) {
  const points: string[] = [];

  if (params.year1 && params.year1.cashFlowPostTax > 0) {
    points.push(`年1の税後CFがプラスです (${Math.round(params.year1.cashFlowPostTax).toLocaleString()}円)。`);
  }
  if (Number.isFinite(params.summary.minDscr) && params.summary.minDscr >= 1.2) {
    points.push(`最低DSCRが ${params.summary.minDscr.toFixed(2)} と比較的安定しています。`);
  }
  if (params.exitIrr !== null && params.exitIrr >= 0.08) {
    points.push(`出口IRRが ${(params.exitIrr * 100).toFixed(2)}% を確保しています。`);
  }
  if (params.investmentScore.decision === "Go") {
    points.push(`投資判断スコアが ${params.investmentScore.totalScore} 点で Go 判定です。`);
  }
  if (params.additionalInfoScore.decision === "Go" || params.safetyScore >= 80) {
    points.push("追加情報・安全面のスコアが良好です。");
  }

  return uniqueStrings(points).slice(0, 5);
}

function buildRequiredFollowups(params: {
  input: PropertyInput;
  mode: string;
  strategy: string;
  warnings: string[];
}) {
  const followups: string[] = [];

  if (params.strategy === "new_development") {
    followups.push("土地決済、着工、竣工、安定稼働のスケジュールと資金繰りを最終確認する。");
  }
  if (params.input.monthlyRent <= 0) {
    followups.push("賃料査定とリーシング前提を確定する。");
  }
  if (params.input.price <= 0) {
    followups.push("総事業費または物件価格の前提を確定する。");
  }
  if (!params.input.exitEnabled) {
    followups.push("出口年・キャップレート・売却コストを設定する。");
  }
  if (params.mode === "new_development") {
    followups.push("建築中金利、元本据置期間、リーシング立ち上がりの条件を融資条件と照合する。");
  }
  if (params.warnings.length > 0) {
    followups.push("シミュレーション warning を確認し、必要な前提を手修正する。");
  }

  return uniqueStrings(followups).slice(0, 6);
}

function mapDecisionToRecommendedAction(decision: string) {
  if (decision === "Go") return "buy";
  if (decision === "Hold") return "hold";
  if (decision === "Recalculate") return "needs_review";
  return null;
}

function resolveLeadSource(sourcing: JsonObject | null) {
  const firstLeadSource = asObject(asArray(sourcing?.lead_sources)[0]);
  return (
    asString(firstLeadSource?.kind) ??
    asString(sourcing?.current_primary_source) ??
    "deal"
  );
}

function getSelectedVolumeStudyUnitMix(dealDraft: DealDocument) {
  return asObjectArray(
    getPath(
      getSelectedItem(asObject(dealDraft.volume), "selected_study_id", "studies", "study_id"),
      "output_summary",
      "draft_unit_mix",
    ),
  ).map((item) => ({
    layout: asString(item.layout),
    unit_count: asNumber(item.unit_count),
    average_area_sqm: asNumber(item.average_area_sqm),
    average_monthly_rent_jpy: asNumber(item.average_monthly_rent_jpy),
    note: asString(item.note),
  }));
}

function getSelectedVolumeStudyGrossFloorArea(dealDraft: DealDocument) {
  return chooseNumber(
    asNumber(
      getPath(
        getSelectedItem(asObject(dealDraft.volume), "selected_study_id", "studies", "study_id"),
        "output_summary",
        "estimated_total_floor_area_sqm",
      ),
    ),
    null,
  );
}

function getSelectedVolumeStudyNetArea(dealDraft: DealDocument) {
  return chooseNumber(
    asNumber(
      getPath(
        getSelectedItem(asObject(dealDraft.volume), "selected_study_id", "studies", "study_id"),
        "output_summary",
        "estimated_net_leasable_area_sqm",
      ),
    ),
    null,
  );
}

function buildFallbackUnitMix(unitCount: number, monthlyRent: number, averageAreaSqm: number | null) {
  if (!Number.isFinite(unitCount) || unitCount <= 0) {
    return [] as Array<{
      average_area_sqm: number | null;
      average_monthly_rent_jpy: number | null;
      layout: string | null;
      note: string | null;
      unit_count: number | null;
    }>;
  }

  return [
    {
      layout: null,
      unit_count: Math.round(unitCount),
      average_area_sqm: averageAreaSqm,
      average_monthly_rent_jpy:
        monthlyRent > 0 ? Math.round(monthlyRent / Math.max(unitCount, 1)) : null,
      note: "Fallback unit mix generated from simulator input.",
    },
  ];
}

function deriveMonthlyRentFromUnitMix(unitMix: JsonObject[]) {
  const total = unitMix.reduce((sum, item) => {
    const unitCount = asNumber(item.unit_count);
    const averageMonthlyRent = asNumber(item.average_monthly_rent_jpy);
    if (unitCount === null || averageMonthlyRent === null) {
      return sum;
    }
    return sum + unitCount * averageMonthlyRent;
  }, 0);
  return total > 0 ? total : null;
}

function sumUnitMixCount(unitMix: JsonObject[]) {
  const total = unitMix.reduce((sum, item) => {
    const unitCount = asNumber(item.unit_count);
    return sum + (unitCount ?? 0);
  }, 0);
  return total > 0 ? total : null;
}

function sumUnitMixArea(
  unitMix: Array<{
    average_area_sqm: number | null;
    unit_count: number | null;
  }>,
) {
  return unitMix.reduce((sum, item) => {
    if (item.average_area_sqm === null || item.unit_count === null) {
      return sum;
    }
    return sum + item.average_area_sqm * item.unit_count;
  }, 0);
}

function getSelectedItem(
  section: JsonObject | null,
  selectedIdKey: string,
  itemsKey: string,
  itemIdKey: string,
) {
  const items = asObjectArray(section?.[itemsKey]);
  const selectedId = asString(section?.[selectedIdKey]);
  if (selectedId) {
    const matched = items.find((item) => asString(item[itemIdKey]) === selectedId);
    if (matched) {
      return matched;
    }
  }
  return items[items.length - 1] ?? null;
}

function getSelectedItemId(
  section: JsonObject | null,
  selectedIdKey: string,
  itemsKey: string,
  itemIdKey: string,
) {
  return asString(getSelectedItem(section, selectedIdKey, itemsKey, itemIdKey)?.[itemIdKey]);
}

function mapDealStructureToSimulator(value: string | null): StructureType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "rc") return "RC";
  if (normalized === "src") return "SRC";
  if (normalized === "steel") return "S_HEAVY";
  if (normalized === "wood") return "WOOD";
  return null;
}

function mapSimulatorStructureToDeal(value: StructureType) {
  if (value === "RC") return "rc";
  if (value === "SRC") return "src";
  if (value === "WOOD") return "wood";
  return "steel";
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asObjectArray(value: unknown) {
  return asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is JsonObject => item !== null);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown) {
  return asArray(value)
    .map((item) => asString(item))
    .filter((item): item is string => item !== null);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getPath(root: JsonObject | null, ...keys: string[]) {
  let current: unknown = root;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonObject)[key];
  }
  return current;
}

function ensureObject(root: JsonObject, key: string) {
  const existing = asObject(root[key]);
  if (existing) {
    return existing;
  }
  const created: JsonObject = {};
  root[key] = created;
  return created;
}

function chooseNumber(...values: Array<number | null>) {
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function roundPercent(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return roundNumber(value, 2);
}

function roundInteger(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

function roundNumber(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function uniqueStrings(...groups: string[][]) {
  return Array.from(
    new Set(
      groups.flatMap((group) => group).filter((value) => value.trim().length > 0),
    ),
  );
}

function safeToken(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_");
}

function timestampToken(iso: string) {
  return iso.replace(/[^0-9]/g, "").slice(0, 14) || "local";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
