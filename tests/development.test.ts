import assert from "node:assert/strict";
import test from "node:test";

import {
  getDevelopmentCostSummary,
  syncDevelopmentDerivedInput,
} from "../utils/development";
import { createBasePropertyInput } from "./helpers";

test("getDevelopmentCostSummary aggregates project costs and contingency", () => {
  const summary = getDevelopmentCostSummary({
    developmentLandPrice: 80_000_000,
    developmentConstructionCost: 150_000_000,
    developmentSoftCost: 15_000_000,
    developmentOtherCost: 5_000_000,
    developmentContingencyRate: 10,
  });

  assert.deepEqual(summary, {
    landPrice: 80_000_000,
    constructionCost: 150_000_000,
    softCost: 15_000_000,
    otherCost: 5_000_000,
    contingencyCost: 17_000_000,
    hardCostTotal: 230_000_000,
    projectCostBeforeFinancing: 267_000_000,
  });
});

test("syncDevelopmentDerivedInput leaves existing-asset inputs untouched", () => {
  const input = createBasePropertyInput();

  assert.deepEqual(syncDevelopmentDerivedInput(input), input);
});

test("syncDevelopmentDerivedInput derives simulator fields for development mode", () => {
  const input = createBasePropertyInput({
    investmentMode: "NEW_DEVELOPMENT",
    buildingAge: 12,
    newBuildTaxReductionEnabled: false,
    developmentLandPrice: 80_000_000,
    developmentConstructionCost: 150_000_000,
    developmentSoftCost: 15_000_000,
    developmentOtherCost: 5_000_000,
    developmentContingencyRate: 10,
  });

  const synced = syncDevelopmentDerivedInput(input);

  assert.equal(synced.price, 230_000_000);
  assert.equal(synced.buildingRatio, 65.22);
  assert.equal(synced.miscCostRate, 16.09);
  assert.equal(synced.buildingAge, 0);
  assert.equal(synced.newBuildTaxReductionEnabled, true);
});
