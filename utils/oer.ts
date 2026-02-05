import type { OerAgeBand, OerPropertyType } from "./types";

export const OER_AGE_BANDS: { label: string; value: OerAgeBand; maxAge: number }[] = [
  { label: "築浅(〜10年)", value: "NEW", maxAge: 10 },
  { label: "築10〜20年", value: "MID", maxAge: 20 },
  { label: "築20年以上", value: "OLD", maxAge: Number.POSITIVE_INFINITY },
];

export const OER_TEMPLATES: Record<OerPropertyType, Record<OerAgeBand, { exclTax: number }>> = {
  UNIT: {
    NEW: { exclTax: 16 },
    MID: { exclTax: 18 },
    OLD: { exclTax: 22 },
  },
  WOOD_APARTMENT: {
    NEW: { exclTax: 11 },
    MID: { exclTax: 16 },
    OLD: { exclTax: 24 },
  },
  STEEL_APARTMENT: {
    NEW: { exclTax: 14 },
    MID: { exclTax: 20 },
    OLD: { exclTax: 26 },
  },
  RC_APARTMENT: {
    NEW: { exclTax: 15 },
    MID: { exclTax: 21 },
    OLD: { exclTax: 29 },
  },
};

export const getOerAgeBand = (age: number): OerAgeBand => {
  const safeAge = Number.isFinite(age) ? Math.max(0, Math.floor(age)) : 0;
  const matched = OER_AGE_BANDS.find((band) => safeAge <= band.maxAge);
  return matched?.value ?? "OLD";
};

export const getOerRateForAge = (type: OerPropertyType, age: number): number => {
  const safeAge = Number.isFinite(age) ? Math.max(0, age) : 0;
  const newRate = OER_TEMPLATES[type].NEW.exclTax;
  const midRate = OER_TEMPLATES[type].MID.exclTax;
  const oldRate = OER_TEMPLATES[type].OLD.exclTax;
  if (safeAge <= 10) {
    const t = safeAge / 10;
    return newRate + (midRate - newRate) * t;
  }
  if (safeAge <= 20) {
    const t = (safeAge - 10) / 10;
    return midRate + (oldRate - midRate) * t;
  }
  return oldRate;
};
