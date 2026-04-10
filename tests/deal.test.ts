import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDealSimulationExportFilename,
  buildDealWithSimulationArrival,
  buildDealWithSimulationRun,
  parseDealForSimulation,
} from "../utils/deal";
import { calculateSimulation } from "../utils/simulation";
import {
  createBaseDealDraft,
  createBasePropertyInput,
  summarizeResults,
} from "./helpers";

test("parseDealForSimulation imports selected study values into the simulator patch", () => {
  const { patch, summary } = parseDealForSimulation(
    JSON.stringify(createBaseDealDraft()),
  );

  assert.equal(summary.dealId, "deal-577");
  assert.equal(summary.source, "nifty");
  assert.equal(summary.strategy, "existing_asset");
  assert.equal(summary.title, "No.577 東京都足立区梅田");
  assert.equal(patch.price, 284_000_000);
  assert.equal(patch.buildingRatio, 73.24);
  assert.equal(patch.miscCostRate, 0);
  assert.equal(patch.structure, "RC");
  assert.equal(patch.monthlyRent, 1_005_000);
  assert.equal(patch.occupancyRate, 97);
  assert.equal(patch.unitCount, 10);
  assert.equal(patch.interestRate, 2);
  assert.equal(patch.loanDuration, 35);
  assert.equal(patch.equityRatio, 20);
  assert.equal(patch.loanAmount, 227_200_000);
  assert.equal(patch.exitEnabled, true);
  assert.equal(patch.exitYear, 10);
  assert.equal(patch.exitCapRate, 5);
  assert.ok(
    summary.warnings.some((warning) =>
      warning.includes("総事業費を simulator の価格欄へ流し込みました"),
    ),
  );
});

test("buildDealWithSimulationArrival advances workflow for simulator review", () => {
  const nextDeal = buildDealWithSimulationArrival(createBaseDealDraft()) as Record<
    string,
    unknown
  >;
  const metadata = nextDeal.metadata as Record<string, unknown>;
  const workflow = nextDeal.workflow as Record<string, unknown>;
  const simulation = nextDeal.simulation as Record<string, unknown>;

  assert.ok(typeof nextDeal.updated_at === "string");
  assert.ok((metadata.tags as string[]).includes("tool:pro-estate-simulator"));
  assert.equal(simulation.status, "in_progress");
  assert.equal(workflow.simulation_status, "in_progress");
  assert.equal(workflow.pipeline_stage, "simulation_ready");
  assert.equal(workflow.volume_status, "complete");
  assert.match(
    String(workflow.next_action),
    /run the investment simulation/i,
  );
});

test("buildDealSimulationExportFilename sanitizes the deal id", () => {
  assert.equal(
    buildDealSimulationExportFilename({ deal_id: "deal 577 / tokyo" }),
    "deal_577_tokyo__simulation-run.json",
  );
});

test("buildDealWithSimulationRun writes a complete simulation snapshot back to the deal", () => {
  const dealDraft = createBaseDealDraft();
  const input = createBasePropertyInput({
    price: 284_000_000,
    buildingRatio: 73.24,
    miscCostRate: 0,
    buildingAge: 0,
    loanAmount: 227_200_000,
    interestRate: 2,
    loanDuration: 35,
    monthlyRent: 1_005_000,
    occupancyRate: 97,
    unitCount: 10,
    loanFeeRate: 2,
    registrationCostRate: 2,
    acquisitionTaxRate: 3,
    waterContributionRate: 0.5,
    exitEnabled: true,
    exitYear: 10,
    exitCapRate: 5,
    exitDiscountRate: 6,
    taxType: "CORPORATE",
  });
  const results = calculateSimulation(input);
  const baseSummary = summarizeResults(results);

  const nextDeal = buildDealWithSimulationRun({
    additionalInfoScore: {
      decision: "Go",
      grade: "A",
      totalScore: 85,
      memoRiskFlags: [],
    },
    baseEquityMultiple: 1.42,
    baseSummary,
    dealDraft,
    exitIrr: 0.083,
    exitNpv: 5_000_000,
    exitSalePrice: 300_000_000,
    firstDeadCrossYear: null,
    importedWarnings: ["Volume study requires manual height district review."],
    input,
    investmentScore: {
      decision: "Go",
      grade: "A",
      totalScore: 82,
    },
    results,
    safetyScore: 84,
    totalProjectCost: 284_000_000,
  }) as Record<string, unknown>;

  const workflow = nextDeal.workflow as Record<string, unknown>;
  const rent = nextDeal.rent as Record<string, unknown>;
  const costs = nextDeal.costs as Record<string, unknown>;
  const finance = nextDeal.finance as Record<string, unknown>;
  const simulation = nextDeal.simulation as Record<string, unknown>;
  const decision = nextDeal.decision as Record<string, unknown>;
  const runs = simulation.runs as Array<Record<string, unknown>>;
  const run = runs[0];
  const summary = run.summary as Record<string, unknown>;

  assert.equal(rent.status, "complete");
  assert.ok(typeof rent.selected_study_id === "string");
  assert.equal(costs.status, "complete");
  assert.ok(typeof costs.selected_study_id === "string");
  assert.ok(typeof finance.selected_assumption_id === "string");
  assert.equal(simulation.status, "complete");
  assert.ok(typeof simulation.selected_run_id === "string");
  assert.equal(runs.length, 1);
  assert.equal(run.mode, "existing_asset");
  assert.equal(summary.total_project_cost_jpy, 284_000_000);
  assert.equal(workflow.simulation_status, "complete");
  assert.equal(workflow.pipeline_stage, "simulated");
  assert.equal(workflow.volume_status, "complete");
  assert.equal(decision.recommended_action, "buy");
  assert.ok(Array.isArray(decision.required_followups));
});
