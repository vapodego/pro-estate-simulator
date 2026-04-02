import type { PropertyInput } from "./types";

export type DevelopmentCostSummary = {
  landPrice: number;
  constructionCost: number;
  softCost: number;
  otherCost: number;
  contingencyCost: number;
  hardCostTotal: number;
  projectCostBeforeFinancing: number;
};

const safeNumber = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

export const isDevelopmentMode = (input: PropertyInput) =>
  input.investmentMode === "NEW_DEVELOPMENT";

export const getDevelopmentCostSummary = (
  input: Pick<
    PropertyInput,
    | "developmentLandPrice"
    | "developmentConstructionCost"
    | "developmentSoftCost"
    | "developmentOtherCost"
    | "developmentContingencyRate"
  >,
): DevelopmentCostSummary => {
  const landPrice = Math.max(0, safeNumber(input.developmentLandPrice));
  const constructionCost = Math.max(0, safeNumber(input.developmentConstructionCost));
  const softCost = Math.max(0, safeNumber(input.developmentSoftCost));
  const otherCost = Math.max(0, safeNumber(input.developmentOtherCost));
  const contingencyRate = Math.max(0, safeNumber(input.developmentContingencyRate));
  const contingencyCost = Math.round(
    (constructionCost + softCost + otherCost) * (contingencyRate / 100),
  );
  const hardCostTotal = landPrice + constructionCost;
  const projectCostBeforeFinancing =
    hardCostTotal + softCost + otherCost + contingencyCost;

  return {
    landPrice,
    constructionCost,
    softCost,
    otherCost,
    contingencyCost,
    hardCostTotal,
    projectCostBeforeFinancing,
  };
};

export const syncDevelopmentDerivedInput = (input: PropertyInput): PropertyInput => {
  if (!isDevelopmentMode(input)) {
    return input;
  }

  const summary = getDevelopmentCostSummary(input);
  const buildingRatio =
    summary.hardCostTotal > 0
      ? (summary.constructionCost / summary.hardCostTotal) * 100
      : 0;
  const miscCostRate =
    summary.hardCostTotal > 0
      ? ((summary.softCost + summary.otherCost + summary.contingencyCost) /
          summary.hardCostTotal) *
        100
      : 0;

  return {
    ...input,
    price: Math.round(summary.hardCostTotal),
    buildingRatio: Number(buildingRatio.toFixed(2)),
    miscCostRate: Number(miscCostRate.toFixed(2)),
    buildingAge: 0,
    newBuildTaxReductionEnabled: true,
  };
};
