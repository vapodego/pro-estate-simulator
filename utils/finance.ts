export const calculateNPV = (rate: number, cashFlows: number[]): number => {
  const safeRate = Number.isFinite(rate) ? rate : 0;
  return cashFlows.reduce((sum, cashFlow, index) => {
    return sum + cashFlow / Math.pow(1 + safeRate, index);
  }, 0);
};

export const calculateIRR = (cashFlows: number[], guess = 0.1): number | null => {
  let rate = Number.isFinite(guess) ? guess : 0.1;
  const maxIterations = 100;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dNpv = 0;

    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashFlows[t] / denom;
      if (t > 0) {
        dNpv += (-t * cashFlows[t]) / (denom * (1 + rate));
      }
    }

    if (Math.abs(npv) < tolerance) return rate;
    if (dNpv === 0) break;

    rate -= npv / dNpv;
    if (!Number.isFinite(rate) || rate <= -0.9999) {
      return null;
    }
  }

  return null;
};
