export type OccupancyDetailRates = {
  occupancyRate: number | null | undefined;
  occupancyRateYear1to2?: number | null;
  occupancyRateYear3to10?: number | null;
  occupancyRateYear11to20?: number | null;
  occupancyRateYear20to30?: number | null;
  occupancyRateYear30to40?: number | null;
};

const pickRate = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value as number) ? (value as number) : fallback;

export const getOccupancyRateForAge = (
  age: number,
  detailEnabled: boolean,
  rates: OccupancyDetailRates
): number => {
  const base = Number.isFinite(rates.occupancyRate as number)
    ? (rates.occupancyRate as number)
    : 100;
  if (!detailEnabled) return base;
  const safeAge = Number.isFinite(age) ? Math.max(0, Math.floor(age)) : 0;
  if (safeAge <= 2) return pickRate(rates.occupancyRateYear1to2, base);
  if (safeAge <= 10) return pickRate(rates.occupancyRateYear3to10, base);
  if (safeAge <= 20) return pickRate(rates.occupancyRateYear11to20, base);
  if (safeAge <= 30) return pickRate(rates.occupancyRateYear20to30, base);
  return pickRate(rates.occupancyRateYear30to40, base);
};
