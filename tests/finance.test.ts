import assert from "node:assert/strict";
import test from "node:test";

import { calculateIRR, calculateNPV } from "../utils/finance";

test("calculateNPV discounts cash flows from period zero", () => {
  const result = calculateNPV(0.1, [-100, 60, 60]);
  const expected = -100 + 60 / 1.1 + 60 / Math.pow(1.1, 2);

  assert.ok(Math.abs(result - expected) < 1e-9);
});

test("calculateIRR returns the expected rate for a simple positive-return deal", () => {
  const result = calculateIRR([-100, 110]);

  if (result === null) {
    throw new Error("Expected IRR to resolve for a profitable two-period cash flow.");
  }
  assert.ok(Math.abs(result - 0.1) < 1e-7);
});

test("calculateIRR returns null when cash flows never cross zero", () => {
  assert.equal(calculateIRR([100, 50, 25]), null);
});
