import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePMT,
  calculateSimulation,
  calculateUsefulLife,
} from "../utils/simulation";
import { createBasePropertyInput } from "./helpers";

test("calculateUsefulLife uses the simplified formula within legal life", () => {
  assert.equal(calculateUsefulLife("RC", 10), 39);
});

test("calculateUsefulLife falls back to 20 percent of legal life after expiry", () => {
  assert.equal(calculateUsefulLife("WOOD", 30), 4);
});

test("calculatePMT returns a monthly principal payment for zero-rate loans", () => {
  assert.equal(calculatePMT(0, 10, 12_000_000), 100_000);
});

test("calculatePMT matches a known amortization reference point", () => {
  const result = calculatePMT(2, 35, 100_000_000);

  assert.ok(Math.abs(result - 331_262.7697) < 0.01);
});

test("calculateSimulation produces a stable first-year snapshot for a base case", () => {
  const results = calculateSimulation(
    createBasePropertyInput({
      price: 100_000_000,
      buildingRatio: 70,
      miscCostRate: 0,
      buildingAge: 0,
      loanAmount: 80_000_000,
      interestRate: 2,
      loanDuration: 35,
      monthlyRent: 1_000_000,
      occupancyRate: 95,
      rentDeclineRate: 0,
      operatingExpenseRate: 20,
      unitCount: 10,
      landEvaluationRate: 70,
      buildingEvaluationRate: 50,
      landTaxReductionRate: 16.67,
      propertyTaxRate: 1.7,
      registrationCostRate: 0,
      acquisitionTaxRate: 0,
      waterContributionRate: 0,
      fireInsuranceRate: 0,
      loanFeeRate: 0,
      corporateMinimumTax: 0,
      exitEnabled: false,
    }),
  );

  assert.equal(results.length, 35);
  assert.equal(results[0].year, 1);
  assert.equal(results[0].grossPotentialRent, 12_000_000);
  assert.equal(results[0].income, 11_400_000);
  assert.ok(results[0].loanPaymentTotal > 0);
  assert.ok(results[0].loanBalance < 80_000_000);
});
