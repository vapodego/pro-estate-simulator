"use client";

import React, { useEffect, useState } from "react";
import { PropertyInput, StructureType, LEGAL_USEFUL_LIFE } from "../utils/types";

// 構造の選択肢定義
const STRUCTURE_OPTIONS: { label: string; value: StructureType }[] = [
  { label: "RC (鉄筋コンクリート)", value: "RC" },
  { label: "SRC (鉄骨鉄筋コンクリート)", value: "SRC" },
  { label: "重量鉄骨 (厚)", value: "S_HEAVY" },
  { label: "軽量鉄骨 (薄)", value: "S_LIGHT" },
  { label: "木造", value: "WOOD" },
];

interface Props {
  initialData: PropertyInput;
  onCalculate: (data: PropertyInput) => void;
}

export const SimulationForm: React.FC<Props> = ({ initialData, onCalculate }) => {
  const [formData, setFormData] = useState<PropertyInput>(initialData);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openPanels, setOpenPanels] = useState({
    basic: true,
    finance: true,
    initial: true,
    repair: true,
    scenario: true,
    advanced: true,
    tax: true,
  });
  const legalLife = LEGAL_USEFUL_LIFE[formData.structure];
  const miscCostRate = Number.isFinite(formData.miscCostRate)
    ? formData.miscCostRate
    : initialData.miscCostRate ?? 0;
  const waterContributionRate = Number.isFinite(formData.waterContributionRate)
    ? formData.waterContributionRate
    : initialData.waterContributionRate ?? 0.2;
  const fireInsuranceRate = Number.isFinite(formData.fireInsuranceRate)
    ? formData.fireInsuranceRate
    : initialData.fireInsuranceRate ?? 0.4;
  const loanFeeRate = Number.isFinite(formData.loanFeeRate)
    ? formData.loanFeeRate
    : initialData.loanFeeRate ?? 2.2;
  const registrationCostRate = Number.isFinite(formData.registrationCostRate)
    ? formData.registrationCostRate
    : initialData.registrationCostRate ?? 1.2;
  const acquisitionTaxRate = Number.isFinite(formData.acquisitionTaxRate)
    ? formData.acquisitionTaxRate
    : initialData.acquisitionTaxRate ?? 3;
  const acquisitionLandReductionRate = Number.isFinite(formData.acquisitionLandReductionRate)
    ? formData.acquisitionLandReductionRate
    : initialData.acquisitionLandReductionRate ?? 50;
  const landEvaluationRate = Number.isFinite(formData.landEvaluationRate)
    ? formData.landEvaluationRate
    : initialData.landEvaluationRate ?? 70;
  const buildingEvaluationRate = Number.isFinite(formData.buildingEvaluationRate)
    ? formData.buildingEvaluationRate
    : initialData.buildingEvaluationRate ?? 50;
  const landTaxReductionRate = Number.isFinite(formData.landTaxReductionRate)
    ? formData.landTaxReductionRate
    : initialData.landTaxReductionRate ?? 16.67;
  const propertyTaxRate = Number.isFinite(formData.propertyTaxRate)
    ? formData.propertyTaxRate
    : initialData.propertyTaxRate ?? 1.4;
  const equipmentUsefulLifeValue = Number.isFinite(formData.equipmentUsefulLife)
    ? formData.equipmentUsefulLife
    : initialData.equipmentUsefulLife ?? 15;
  const exitYearValue = Number.isFinite(formData.exitYear)
    ? formData.exitYear
    : initialData.exitYear ?? 10;
  const exitCapRateValue = Number.isFinite(formData.exitCapRate)
    ? formData.exitCapRate
    : initialData.exitCapRate ?? 7;
  const exitBrokerageRateValue = Number.isFinite(formData.exitBrokerageRate)
    ? formData.exitBrokerageRate
    : initialData.exitBrokerageRate ?? 3;
  const exitBrokerageFixedValue = Number.isFinite(formData.exitBrokerageFixed)
    ? formData.exitBrokerageFixed
    : initialData.exitBrokerageFixed ?? 0;
  const exitOtherCostRateValue = Number.isFinite(formData.exitOtherCostRate)
    ? formData.exitOtherCostRate
    : initialData.exitOtherCostRate ?? 0;
  const exitShortTermTaxRateValue = Number.isFinite(formData.exitShortTermTaxRate)
    ? formData.exitShortTermTaxRate
    : initialData.exitShortTermTaxRate ?? 39;
  const exitLongTermTaxRateValue = Number.isFinite(formData.exitLongTermTaxRate)
    ? formData.exitLongTermTaxRate
    : initialData.exitLongTermTaxRate ?? 20;
  const exitDiscountRateValue = Number.isFinite(formData.exitDiscountRate)
    ? formData.exitDiscountRate
    : initialData.exitDiscountRate ?? 4;
  const occupancyRateValue = Number.isFinite(formData.occupancyRate)
    ? formData.occupancyRate
    : initialData.occupancyRate ?? 100;
  const rentDeclineValue = Number.isFinite(formData.rentDeclineRate)
    ? formData.rentDeclineRate
    : initialData.rentDeclineRate ?? 0;
  const incomeTaxRate = Number.isFinite(formData.incomeTaxRate)
    ? formData.incomeTaxRate
    : initialData.incomeTaxRate ?? 20;
  const vacancyModel = formData.vacancyModel ?? initialData.vacancyModel ?? "FIXED";
  const vacancyCycleYears = Number.isFinite(formData.vacancyCycleYears)
    ? formData.vacancyCycleYears
    : initialData.vacancyCycleYears ?? 4;
  const vacancyCycleMonths = Number.isFinite(formData.vacancyCycleMonths)
    ? formData.vacancyCycleMonths
    : initialData.vacancyCycleMonths ?? 3;
  const vacancyProbability = Number.isFinite(formData.vacancyProbability)
    ? formData.vacancyProbability
    : initialData.vacancyProbability ?? 20;
  const vacancyProbabilityMonths = Number.isFinite(formData.vacancyProbabilityMonths)
    ? formData.vacancyProbabilityMonths
    : initialData.vacancyProbabilityMonths ?? 2;
  const otherIncomeValue = Number.isFinite(formData.otherIncome)
    ? formData.otherIncome
    : initialData.otherIncome ?? 0;
  const corporateMinimumTaxValue = Number.isFinite(formData.corporateMinimumTax)
    ? formData.corporateMinimumTax
    : initialData.corporateMinimumTax ?? 70000;
  const scenarioInterestShockYear = Number.isFinite(formData.scenarioInterestShockYear)
    ? formData.scenarioInterestShockYear
    : initialData.scenarioInterestShockYear ?? 5;
  const scenarioInterestShockDelta = Number.isFinite(formData.scenarioInterestShockDelta)
    ? formData.scenarioInterestShockDelta
    : initialData.scenarioInterestShockDelta ?? 1;
  const scenarioRentDeclineEarlyRate = Number.isFinite(formData.scenarioRentDeclineEarlyRate)
    ? formData.scenarioRentDeclineEarlyRate
    : initialData.scenarioRentDeclineEarlyRate ?? 1.5;
  const scenarioRentDeclineLateRate = Number.isFinite(formData.scenarioRentDeclineLateRate)
    ? formData.scenarioRentDeclineLateRate
    : initialData.scenarioRentDeclineLateRate ?? 0.5;
  const scenarioRentDeclineSwitchYear = Number.isFinite(formData.scenarioRentDeclineSwitchYear)
    ? formData.scenarioRentDeclineSwitchYear
    : initialData.scenarioRentDeclineSwitchYear ?? 10;
  const scenarioOccupancyDeclineStartYear = Number.isFinite(formData.scenarioOccupancyDeclineStartYear)
    ? formData.scenarioOccupancyDeclineStartYear
    : initialData.scenarioOccupancyDeclineStartYear ?? 10;
  const scenarioOccupancyDeclineDelta = Number.isFinite(formData.scenarioOccupancyDeclineDelta)
    ? formData.scenarioOccupancyDeclineDelta
    : initialData.scenarioOccupancyDeclineDelta ?? 5;
  const buildingPrice = Math.round((formData.price * formData.buildingRatio) / 100);
  const landPrice = Math.max(0, formData.price - buildingPrice);
  const miscCost = Math.round((formData.price * miscCostRate) / 100);
  const waterContribution = Math.round((formData.price * waterContributionRate) / 100);
  const fireInsurance = Math.round((buildingPrice * fireInsuranceRate) / 100);
  const loanFee = Math.round((formData.loanAmount * loanFeeRate) / 100);
  const registrationCost = Math.round((formData.price * registrationCostRate) / 100);
  const initialCostsTotal =
    miscCost + waterContribution + fireInsurance + loanFee + registrationCost;
  const landEvaluation = Math.round((landPrice * landEvaluationRate) / 100);
  const buildingEvaluation = Math.round((buildingPrice * buildingEvaluationRate) / 100);
  const acquisitionTaxEstimate = Math.round(
    (landEvaluation * (acquisitionLandReductionRate / 100) + buildingEvaluation) *
      (acquisitionTaxRate / 100)
  );
  const estimatedTotal = formData.price + initialCostsTotal;
  const annualFullRent = formData.monthlyRent * 12;
  const repairEvents = Array.isArray(formData.repairEvents)
    ? formData.repairEvents
    : initialData.repairEvents ?? [];

  useEffect(() => {
    const occupancyRate = Number.isFinite(formData.occupancyRate)
      ? formData.occupancyRate
      : initialData.occupancyRate ?? 100;
    const rentDeclineRate = Number.isFinite(formData.rentDeclineRate)
      ? formData.rentDeclineRate
      : initialData.rentDeclineRate ?? 0;
    const miscRate = Number.isFinite(formData.miscCostRate)
      ? formData.miscCostRate
      : initialData.miscCostRate ?? 0;
    const waterRate = Number.isFinite(formData.waterContributionRate)
      ? formData.waterContributionRate
      : initialData.waterContributionRate ?? 0.2;
    const fireRate = Number.isFinite(formData.fireInsuranceRate)
      ? formData.fireInsuranceRate
      : initialData.fireInsuranceRate ?? 0.4;
    const loanFee = Number.isFinite(formData.loanFeeRate)
      ? formData.loanFeeRate
      : initialData.loanFeeRate ?? 2.2;
    const registrationRate = Number.isFinite(formData.registrationCostRate)
      ? formData.registrationCostRate
      : initialData.registrationCostRate ?? 1.2;
    const acquisitionRate = Number.isFinite(formData.acquisitionTaxRate)
      ? formData.acquisitionTaxRate
      : initialData.acquisitionTaxRate ?? 3;
    const acquisitionLandReduction = Number.isFinite(formData.acquisitionLandReductionRate)
      ? formData.acquisitionLandReductionRate
      : initialData.acquisitionLandReductionRate ?? 50;
    const landRate = Number.isFinite(formData.landEvaluationRate)
      ? formData.landEvaluationRate
      : initialData.landEvaluationRate ?? 70;
    const buildingRate = Number.isFinite(formData.buildingEvaluationRate)
      ? formData.buildingEvaluationRate
      : initialData.buildingEvaluationRate ?? 50;
    const landReduction = Number.isFinite(formData.landTaxReductionRate)
      ? formData.landTaxReductionRate
      : initialData.landTaxReductionRate ?? 16.67;
    const taxRate = Number.isFinite(formData.propertyTaxRate)
      ? formData.propertyTaxRate
      : initialData.propertyTaxRate ?? 1.4;
    const incomeRate = Number.isFinite(formData.incomeTaxRate)
      ? formData.incomeTaxRate
      : initialData.incomeTaxRate ?? 20;
    const vacancyMode = formData.vacancyModel ?? initialData.vacancyModel ?? "FIXED";
    const cycleYears = Number.isFinite(formData.vacancyCycleYears)
      ? formData.vacancyCycleYears
      : initialData.vacancyCycleYears ?? 4;
    const cycleMonths = Number.isFinite(formData.vacancyCycleMonths)
      ? formData.vacancyCycleMonths
      : initialData.vacancyCycleMonths ?? 3;
    const probability = Number.isFinite(formData.vacancyProbability)
      ? formData.vacancyProbability
      : initialData.vacancyProbability ?? 20;
    const probabilityMonths = Number.isFinite(formData.vacancyProbabilityMonths)
      ? formData.vacancyProbabilityMonths
      : initialData.vacancyProbabilityMonths ?? 2;
    const repairList = Array.isArray(formData.repairEvents)
      ? formData.repairEvents
      : initialData.repairEvents ?? [];
    const otherIncome = Number.isFinite(formData.otherIncome)
      ? formData.otherIncome
      : initialData.otherIncome ?? 0;
    const corporateMinimumTax = Number.isFinite(formData.corporateMinimumTax)
      ? formData.corporateMinimumTax
      : initialData.corporateMinimumTax ?? 70000;
    const scenarioEnabled = typeof formData.scenarioEnabled === "boolean"
      ? formData.scenarioEnabled
      : initialData.scenarioEnabled ?? true;
    const scenarioRentCurveEnabled = typeof formData.scenarioRentCurveEnabled === "boolean"
      ? formData.scenarioRentCurveEnabled
      : initialData.scenarioRentCurveEnabled ?? true;
    const scenarioOccupancyDeclineEnabled = typeof formData.scenarioOccupancyDeclineEnabled === "boolean"
      ? formData.scenarioOccupancyDeclineEnabled
      : initialData.scenarioOccupancyDeclineEnabled ?? true;
    const scenarioShockYear = Number.isFinite(formData.scenarioInterestShockYear)
      ? formData.scenarioInterestShockYear
      : initialData.scenarioInterestShockYear ?? 5;
    const scenarioShockDelta = Number.isFinite(formData.scenarioInterestShockDelta)
      ? formData.scenarioInterestShockDelta
      : initialData.scenarioInterestShockDelta ?? 1;
    const scenarioEarlyRate = Number.isFinite(formData.scenarioRentDeclineEarlyRate)
      ? formData.scenarioRentDeclineEarlyRate
      : initialData.scenarioRentDeclineEarlyRate ?? 1.5;
    const scenarioLateRate = Number.isFinite(formData.scenarioRentDeclineLateRate)
      ? formData.scenarioRentDeclineLateRate
      : initialData.scenarioRentDeclineLateRate ?? 0.5;
    const scenarioSwitchYear = Number.isFinite(formData.scenarioRentDeclineSwitchYear)
      ? formData.scenarioRentDeclineSwitchYear
      : initialData.scenarioRentDeclineSwitchYear ?? 10;
    const scenarioOccupancyStart = Number.isFinite(formData.scenarioOccupancyDeclineStartYear)
      ? formData.scenarioOccupancyDeclineStartYear
      : initialData.scenarioOccupancyDeclineStartYear ?? 10;
    const scenarioOccupancyDelta = Number.isFinite(formData.scenarioOccupancyDeclineDelta)
      ? formData.scenarioOccupancyDeclineDelta
      : initialData.scenarioOccupancyDeclineDelta ?? 5;
    const equipmentUsefulLife = Number.isFinite(formData.equipmentUsefulLife)
      ? formData.equipmentUsefulLife
      : initialData.equipmentUsefulLife ?? 15;
    const exitYear = Number.isFinite(formData.exitYear)
      ? formData.exitYear
      : initialData.exitYear ?? 10;
    const exitCapRate = Number.isFinite(formData.exitCapRate)
      ? formData.exitCapRate
      : initialData.exitCapRate ?? 7;
    const exitBrokerageRate = Number.isFinite(formData.exitBrokerageRate)
      ? formData.exitBrokerageRate
      : initialData.exitBrokerageRate ?? 3;
    const exitBrokerageFixed = Number.isFinite(formData.exitBrokerageFixed)
      ? formData.exitBrokerageFixed
      : initialData.exitBrokerageFixed ?? 0;
    const exitOtherCostRate = Number.isFinite(formData.exitOtherCostRate)
      ? formData.exitOtherCostRate
      : initialData.exitOtherCostRate ?? 0;
    const exitShortTermTaxRate = Number.isFinite(formData.exitShortTermTaxRate)
      ? formData.exitShortTermTaxRate
      : initialData.exitShortTermTaxRate ?? 39;
    const exitLongTermTaxRate = Number.isFinite(formData.exitLongTermTaxRate)
      ? formData.exitLongTermTaxRate
      : initialData.exitLongTermTaxRate ?? 20;
    const exitDiscountRate = Number.isFinite(formData.exitDiscountRate)
      ? formData.exitDiscountRate
      : initialData.exitDiscountRate ?? 4;
    if (
      occupancyRate === formData.occupancyRate &&
      rentDeclineRate === formData.rentDeclineRate &&
      miscRate === formData.miscCostRate &&
      waterRate === formData.waterContributionRate &&
      fireRate === formData.fireInsuranceRate &&
      loanFee === formData.loanFeeRate &&
      registrationRate === formData.registrationCostRate &&
      acquisitionRate === formData.acquisitionTaxRate &&
      acquisitionLandReduction === formData.acquisitionLandReductionRate &&
      landRate === formData.landEvaluationRate &&
      buildingRate === formData.buildingEvaluationRate &&
      landReduction === formData.landTaxReductionRate &&
      taxRate === formData.propertyTaxRate &&
      incomeRate === formData.incomeTaxRate &&
      vacancyMode === formData.vacancyModel &&
      cycleYears === formData.vacancyCycleYears &&
      cycleMonths === formData.vacancyCycleMonths &&
      probability === formData.vacancyProbability &&
      probabilityMonths === formData.vacancyProbabilityMonths &&
      repairList === formData.repairEvents &&
      otherIncome === formData.otherIncome &&
      corporateMinimumTax === formData.corporateMinimumTax &&
      scenarioEnabled === formData.scenarioEnabled &&
      scenarioRentCurveEnabled === formData.scenarioRentCurveEnabled &&
      scenarioOccupancyDeclineEnabled === formData.scenarioOccupancyDeclineEnabled &&
      scenarioShockYear === formData.scenarioInterestShockYear &&
      scenarioShockDelta === formData.scenarioInterestShockDelta &&
      scenarioEarlyRate === formData.scenarioRentDeclineEarlyRate &&
      scenarioLateRate === formData.scenarioRentDeclineLateRate &&
      scenarioSwitchYear === formData.scenarioRentDeclineSwitchYear &&
      scenarioOccupancyStart === formData.scenarioOccupancyDeclineStartYear &&
      scenarioOccupancyDelta === formData.scenarioOccupancyDeclineDelta &&
      equipmentUsefulLife === formData.equipmentUsefulLife &&
      exitYear === formData.exitYear &&
      exitCapRate === formData.exitCapRate &&
      exitBrokerageRate === formData.exitBrokerageRate &&
      exitBrokerageFixed === formData.exitBrokerageFixed &&
      exitOtherCostRate === formData.exitOtherCostRate &&
      exitShortTermTaxRate === formData.exitShortTermTaxRate &&
      exitLongTermTaxRate === formData.exitLongTermTaxRate &&
      exitDiscountRate === formData.exitDiscountRate
    ) {
      return;
    }
    const patched = {
      ...formData,
      occupancyRate,
      rentDeclineRate,
      miscCostRate: miscRate,
      waterContributionRate: waterRate,
      fireInsuranceRate: fireRate,
      loanFeeRate: loanFee,
      registrationCostRate: registrationRate,
      acquisitionTaxRate: acquisitionRate,
      acquisitionLandReductionRate: acquisitionLandReduction,
      landEvaluationRate: landRate,
      buildingEvaluationRate: buildingRate,
      landTaxReductionRate: landReduction,
      propertyTaxRate: taxRate,
      incomeTaxRate: incomeRate,
      vacancyModel: vacancyMode,
      vacancyCycleYears: cycleYears,
      vacancyCycleMonths: cycleMonths,
      vacancyProbability: probability,
      vacancyProbabilityMonths: probabilityMonths,
      repairEvents: repairList,
      otherIncome,
      corporateMinimumTax,
      scenarioEnabled,
      scenarioRentCurveEnabled,
      scenarioOccupancyDeclineEnabled,
      scenarioInterestShockYear: scenarioShockYear,
      scenarioInterestShockDelta: scenarioShockDelta,
      scenarioRentDeclineEarlyRate: scenarioEarlyRate,
      scenarioRentDeclineLateRate: scenarioLateRate,
      scenarioRentDeclineSwitchYear: scenarioSwitchYear,
      scenarioOccupancyDeclineStartYear: scenarioOccupancyStart,
      scenarioOccupancyDeclineDelta: scenarioOccupancyDelta,
      equipmentUsefulLife,
      exitYear,
      exitCapRate,
      exitBrokerageRate,
      exitBrokerageFixed,
      exitOtherCostRate,
      exitShortTermTaxRate,
      exitLongTermTaxRate,
      exitDiscountRate,
    };
    setFormData(patched);
    onCalculate(patched);
  }, [formData, initialData, onCalculate]);

  // 入力が変わるたびに状態を更新し、親へ通知（リアルタイム計算用）
  const handleChange = (key: keyof PropertyInput, value: any) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    onCalculate(newData);
  };

  const addRepairEvent = () => {
    const nextYear = repairEvents.length > 0 ? repairEvents[repairEvents.length - 1].year + 1 : 10;
    const nextEvent = { year: Math.max(1, Math.min(35, nextYear)), amount: 1000000, label: "" };
    handleChange("repairEvents", [...repairEvents, nextEvent]);
  };

  const updateRepairEvent = (index: number, key: "year" | "amount" | "label", value: any) => {
    const next = repairEvents.map((event, idx) =>
      idx === index ? { ...event, [key]: value } : event
    );
    handleChange("repairEvents", next);
  };

  const removeRepairEvent = (index: number) => {
    const next = repairEvents.filter((_, idx) => idx !== index);
    handleChange("repairEvents", next);
  };

  const togglePanel = (key: keyof typeof openPanels) => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="sheet-card form-card">
      <div className="form-header">
        <h2 className="form-title">物件・融資条件設定</h2>
        <button
          type="button"
          className="section-toggle"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? "▶ 開く" : "▼ 閉じる"}
        </button>
      </div>

      {isCollapsed ? null : (
        <div className="form-scroll">
          <div className="form-row">
            {/* --- 1. 基本情報セクション --- */}
            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">基本情報</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("basic")}
                  aria-expanded={openPanels.basic}
                >
                  {openPanels.basic ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.basic ? (
                <>
                  <div className="form-grid two-col">
                    <div>
                      <label>物件価格 (建物+土地/万円)</label>
                      <input
                        type="number"
                        value={formData.price / 10000} // 表示は万円単位
                        onChange={(e) => handleChange("price", Number(e.target.value) * 10000)}
                      />
                    </div>
                    <div>
                      <label>建物比率 (%)</label>
                      <input
                        type="number"
                        value={formData.buildingRatio}
                        onChange={(e) => handleChange("buildingRatio", Number(e.target.value))}
                      />
                      <p className="form-note">
                        建物価格:{" "}
                        {((formData.price * formData.buildingRatio) / 100 / 10000).toLocaleString()} 万円
                      </p>
                    </div>
                  </div>

                  <div className="form-grid two-col">
                    <div>
                      <label>構造</label>
                      <select
                        value={formData.structure}
                        onChange={(e) => handleChange("structure", e.target.value as StructureType)}
                      >
                        {STRUCTURE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="form-note">法定耐用年数: {legalLife} 年</p>
                    </div>
                    <div>
                      <label>築年数 (年)</label>
                      <input
                        type="number"
                        value={formData.buildingAge}
                        onChange={(e) => handleChange("buildingAge", Number(e.target.value))}
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* --- 2. 融資・収支セクション --- */}
            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">融資・収支設定</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("finance")}
                  aria-expanded={openPanels.finance}
                >
                  {openPanels.finance ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.finance ? (
                <>
                  <div className="form-grid">
                    <div>
                      <label>借入金額 (万円)</label>
                      <input
                        type="number"
                        value={formData.loanAmount / 10000}
                        onChange={(e) => handleChange("loanAmount", Number(e.target.value) * 10000)}
                      />
                    </div>
                    <div>
                      <label>金利 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.interestRate}
                        onChange={(e) => handleChange("interestRate", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label>期間 (年)</label>
                      <input
                        type="number"
                        value={formData.loanDuration}
                        onChange={(e) => handleChange("loanDuration", Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="form-grid two-col">
                    <div>
                      <label>月額賃料 (満室想定/万円)</label>
                      <input
                        type="number"
                        value={formData.monthlyRent / 10000}
                        onChange={(e) => handleChange("monthlyRent", Number(e.target.value) * 10000)}
                      />
                      <p className="form-note">
                        年間賃貸料: {(annualFullRent / 10000).toLocaleString()} 万円
                      </p>
                    </div>
                    <div>
                      <label>家賃下落率 (2年ごと/%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={rentDeclineValue}
                        onChange={(e) => handleChange("rentDeclineRate", Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="form-grid three-col">
                    <div>
                      <label>運営経費率 (%)</label>
                      <input
                        type="number"
                        value={formData.operatingExpenseRate}
                        onChange={(e) =>
                          handleChange("operatingExpenseRate", Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">初期費用設定（購入時）</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("initial")}
                  aria-expanded={openPanels.initial}
                >
                  {openPanels.initial ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.initial ? (
                <>
                  <div className="form-grid three-col">
                    <div>
                      <label>水道分担金率 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={waterContributionRate}
                        onChange={(e) => handleChange("waterContributionRate", Number(e.target.value))}
                      />
                      <p className="form-note">{(waterContribution / 10000).toLocaleString()} 万円</p>
                    </div>
                    <div>
                      <label>火災保険率 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={fireInsuranceRate}
                        onChange={(e) => handleChange("fireInsuranceRate", Number(e.target.value))}
                      />
                      <p className="form-note">{(fireInsurance / 10000).toLocaleString()} 万円</p>
                    </div>
                    <div>
                      <label>登記費用率 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={registrationCostRate}
                        onChange={(e) => handleChange("registrationCostRate", Number(e.target.value))}
                      />
                      <p className="form-note">{(registrationCost / 10000).toLocaleString()} 万円</p>
                    </div>
                  </div>
                  <div className="form-grid three-col">
                    <div>
                      <label>融資手数料率 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={loanFeeRate}
                        onChange={(e) => handleChange("loanFeeRate", Number(e.target.value))}
                      />
                      <p className="form-note">{(loanFee / 10000).toLocaleString()} 万円</p>
                    </div>
                    <div>
                      <label>その他諸費用率 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={miscCostRate}
                        onChange={(e) => handleChange("miscCostRate", Number(e.target.value))}
                      />
                      <p className="form-note">{(miscCost / 10000).toLocaleString()} 万円</p>
                    </div>
                  </div>
                  <p className="form-note">
                    初期費用合計: {(initialCostsTotal / 10000).toLocaleString()} 万円 / 購入総額:{" "}
                    {(estimatedTotal / 10000).toLocaleString()} 万円
                  </p>
                  <div className="form-grid two-col">
                    <div>
                      <label>不動産取得税率 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={acquisitionTaxRate}
                        onChange={(e) => handleChange("acquisitionTaxRate", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label>土地評価圧縮率 (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={acquisitionLandReductionRate}
                        onChange={(e) =>
                          handleChange("acquisitionLandReductionRate", Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                  <p className="form-note">
                    不動産取得税（翌年計上）: {(acquisitionTaxEstimate / 10000).toLocaleString()} 万円
                  </p>
                </>
              ) : null}
            </div>

            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">修繕・空室設定</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("repair")}
                  aria-expanded={openPanels.repair}
                >
                  {openPanels.repair ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.repair ? (
                <>
                  <div className="form-grid two-col">
                    <div>
                      <label>空室モデル</label>
                      <select
                        value={vacancyModel}
                        onChange={(e) => handleChange("vacancyModel", e.target.value)}
                      >
                        <option value="FIXED">固定（入居率のみ）</option>
                        <option value="CYCLE">周期モデル</option>
                        <option value="PROBABILITY">確率モデル</option>
                      </select>
                    </div>
                    <div>
                      <label>入居率 (%)</label>
                      <input
                        type="number"
                        value={occupancyRateValue}
                        onChange={(e) => handleChange("occupancyRate", Number(e.target.value))}
                      />
                      <p className="form-note">空室モデルは入居率に上乗せで反映</p>
                    </div>
                  </div>
                  {vacancyModel === "CYCLE" ? (
                    <div className="form-grid two-col">
                      <div>
                        <label>空室周期 (年)</label>
                        <input
                          type="number"
                          value={vacancyCycleYears}
                          onChange={(e) => handleChange("vacancyCycleYears", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label>空室月数</label>
                        <input
                          type="number"
                          value={vacancyCycleMonths}
                          onChange={(e) =>
                            handleChange("vacancyCycleMonths", Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  {vacancyModel === "PROBABILITY" ? (
                    <div className="form-grid two-col">
                      <div>
                        <label>年間空室確率 (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={vacancyProbability}
                          onChange={(e) =>
                            handleChange("vacancyProbability", Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <label>空室月数</label>
                        <input
                          type="number"
                          value={vacancyProbabilityMonths}
                          onChange={(e) =>
                            handleChange("vacancyProbabilityMonths", Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="repair-block">
                    <div className="inline-toggle form-split-row">
                      <label>修繕イベント</label>
                      <button type="button" className="section-toggle" onClick={addRepairEvent}>
                        追加
                      </button>
                    </div>
                    {repairEvents.length === 0 ? (
                      <p className="form-note">修繕イベントが未登録です。</p>
                    ) : (
                      repairEvents.map((event, index) => (
                        <div key={`${event.year}-${index}`} className="repair-row">
                          <div className="form-grid three-col">
                            <div>
                              <label>年</label>
                              <input
                                type="number"
                                value={event.year}
                                onChange={(e) =>
                                  updateRepairEvent(index, "year", Number(e.target.value))
                                }
                              />
                            </div>
                            <div>
                              <label>金額 (万円)</label>
                              <input
                                type="number"
                                value={event.amount / 10000}
                                onChange={(e) =>
                                  updateRepairEvent(index, "amount", Number(e.target.value) * 10000)
                                }
                              />
                            </div>
                            <div>
                              <label>内容</label>
                              <input
                                type="text"
                                value={event.label ?? ""}
                                onChange={(e) => updateRepairEvent(index, "label", e.target.value)}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="section-toggle"
                            onClick={() => removeRepairEvent(index)}
                          >
                            削除
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">リスクシナリオ比較</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("scenario")}
                  aria-expanded={openPanels.scenario}
                >
                  {openPanels.scenario ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.scenario ? (
                <>
                  <div className="inline-toggle form-split-row">
                    <div className="inline-toggle">
                      <input
                        type="checkbox"
                        id="scenarioEnabled"
                        checked={formData.scenarioEnabled}
                        onChange={(e) => handleChange("scenarioEnabled", e.target.checked)}
                      />
                      <label htmlFor="scenarioEnabled" className="inline-label">
                        有効にする
                      </label>
                    </div>
                  </div>
                  <p className="form-note">
                    金利上昇・家賃下落カーブ・入居率悪化を組み合わせたストレスシナリオを比較します。
                  </p>
                  {formData.scenarioEnabled ? (
                    <>
                      <div className="form-grid three-col">
                        <div>
                          <label>金利上昇年</label>
                          <input
                            type="number"
                            value={scenarioInterestShockYear}
                            onChange={(e) =>
                              handleChange("scenarioInterestShockYear", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          <label>金利上昇幅 (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={scenarioInterestShockDelta}
                            onChange={(e) =>
                              handleChange("scenarioInterestShockDelta", Number(e.target.value))
                            }
                          />
                        </div>
                        <div>
                          <label>家賃下落カーブ</label>
                          <div className="inline-toggle">
                            <input
                              type="checkbox"
                              id="scenarioRentCurve"
                              checked={formData.scenarioRentCurveEnabled}
                              onChange={(e) =>
                                handleChange("scenarioRentCurveEnabled", e.target.checked)
                              }
                            />
                            <label htmlFor="scenarioRentCurve" className="inline-label">
                              有効
                            </label>
                          </div>
                        </div>
                      </div>
                      {formData.scenarioRentCurveEnabled ? (
                        <div className="form-grid three-col">
                          <div>
                            <label>初期下落率 (2年ごと/%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={scenarioRentDeclineEarlyRate}
                              onChange={(e) =>
                                handleChange("scenarioRentDeclineEarlyRate", Number(e.target.value))
                              }
                            />
                          </div>
                          <div>
                            <label>後半下落率 (2年ごと/%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={scenarioRentDeclineLateRate}
                              onChange={(e) =>
                                handleChange("scenarioRentDeclineLateRate", Number(e.target.value))
                              }
                            />
                          </div>
                          <div>
                            <label>切替年</label>
                            <input
                              type="number"
                              value={scenarioRentDeclineSwitchYear}
                              onChange={(e) =>
                                handleChange("scenarioRentDeclineSwitchYear", Number(e.target.value))
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="form-grid three-col">
                        <div>
                          <label>入居率悪化</label>
                          <div className="inline-toggle">
                            <input
                              type="checkbox"
                              id="scenarioOccupancy"
                              checked={formData.scenarioOccupancyDeclineEnabled}
                              onChange={(e) =>
                                handleChange("scenarioOccupancyDeclineEnabled", e.target.checked)
                              }
                            />
                            <label htmlFor="scenarioOccupancy" className="inline-label">
                              有効
                            </label>
                          </div>
                        </div>
                        <div>
                          <label>悪化開始年</label>
                          <input
                            type="number"
                            value={scenarioOccupancyDeclineStartYear}
                            onChange={(e) =>
                              handleChange(
                                "scenarioOccupancyDeclineStartYear",
                                Number(e.target.value)
                              )
                            }
                          />
                        </div>
                        <div>
                          <label>入居率低下幅 (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={scenarioOccupancyDeclineDelta}
                            onChange={(e) =>
                              handleChange("scenarioOccupancyDeclineDelta", Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            {/* --- 3. 高度な設定（アコーディオン） --- */}
            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">高度な設定</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("advanced")}
                  aria-expanded={openPanels.advanced}
                >
                  {openPanels.advanced ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.advanced ? (
                <>
                  <div className="form-advanced-head">
                    <span className="form-section-title">詳細設定</span>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="form-toggle"
                    >
                      {showAdvanced
                        ? "▼ シンプル表示に戻す"
                        : "▶ 高度な設定を表示 (設備分離・税務など)"}
                    </button>
                  </div>

                  {showAdvanced ? (
                    <div className="form-advanced">
              
              {/* 設備分離設定 [cite: 666-667] */}
              <div className="form-advanced-block">
                <div className="inline-toggle form-split-row">
                  <label>減価償却の設備分離</label>
                  <div className="inline-toggle">
                    <input
                      type="checkbox"
                      id="equipmentSplit"
                      checked={formData.enableEquipmentSplit}
                      onChange={(e) => handleChange("enableEquipmentSplit", e.target.checked)}
                    />
                    <label htmlFor="equipmentSplit" className="inline-label">
                      有効にする
                    </label>
                  </div>
                </div>
                <p className="form-note">
                  建物価格の一部を「設備（耐用年数15年）」として計算し、初期の節税効果を高めます。
                </p>
                
                {formData.enableEquipmentSplit && (
                  <>
                    <div className="form-grid two-col">
                      <div>
                        <label>設備比率 (%)</label>
                        <input
                          type="number"
                          value={formData.equipmentRatio}
                          onChange={(e) => handleChange("equipmentRatio", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label>設備耐用年数 (年)</label>
                        <input
                          type="number"
                          value={equipmentUsefulLifeValue}
                          onChange={(e) =>
                            handleChange("equipmentUsefulLife", Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                    <div className="form-note">推奨値: RCなら20〜30%、設備は15年目安</div>
                  </>
                )}
              </div>

              {/* 税務設定 [cite: 670-671] */}
              <div>
                <label>税務モード</label>
                <div className="form-grid two-col">
                  <label className="inline-label">
                    <input
                      type="radio"
                      name="taxType"
                      value="INDIVIDUAL"
                      checked={formData.taxType === "INDIVIDUAL"}
                      onChange={() => handleChange("taxType", "INDIVIDUAL")}
                    />
                    <span>個人 (累進課税)</span>
                  </label>
                  <label className="inline-label">
                    <input
                      type="radio"
                      name="taxType"
                      value="CORPORATE"
                      checked={formData.taxType === "CORPORATE"}
                      onChange={() => handleChange("taxType", "CORPORATE")}
                    />
                    <span>法人 (実効税率+均等割)</span>
                  </label>
                </div>

                <div className="form-grid two-col">
                  <div>
                    <label>他所得 (給与など/万円)</label>
                    <input
                      type="number"
                      value={otherIncomeValue / 10000}
                      onChange={(e) => handleChange("otherIncome", Number(e.target.value) * 10000)}
                    />
                    <p className="form-note">累進課税 + 住民税10%で計算</p>
                  </div>
                  <div>
                    <label>法人均等割 (万円/年)</label>
                    <input
                      type="number"
                      value={corporateMinimumTaxValue / 10000}
                      onChange={(e) =>
                        handleChange("corporateMinimumTax", Number(e.target.value) * 10000)
                      }
                    />
                    <p className="form-note">※法人モードのみ適用</p>
                  </div>
                </div>
              </div>

              {/* 出口戦略（売却） */}
              <div className="form-advanced-block">
                <div className="inline-toggle form-split-row">
                  <label>出口戦略（売却）</label>
                  <div className="inline-toggle">
                    <input
                      type="checkbox"
                      id="exitEnabled"
                      checked={formData.exitEnabled}
                      onChange={(e) => handleChange("exitEnabled", e.target.checked)}
                    />
                    <label htmlFor="exitEnabled" className="inline-label">
                      有効にする
                    </label>
                  </div>
                </div>
                <p className="form-note">売却年のNOIをキャップレートで割り戻して価格を算出します。</p>

                {formData.exitEnabled ? (
                  <>
                    <div className="form-grid two-col">
                      <div>
                        <label>売却年数 (年)</label>
                        <input
                          type="number"
                          value={exitYearValue}
                          onChange={(e) => handleChange("exitYear", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label>想定キャップレート (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={exitCapRateValue}
                          onChange={(e) => handleChange("exitCapRate", Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="form-grid two-col">
                      <div>
                        <label>仲介手数料率 (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={exitBrokerageRateValue}
                          onChange={(e) => handleChange("exitBrokerageRate", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label>仲介手数料 (定額/万円)</label>
                        <input
                          type="number"
                          value={exitBrokerageFixedValue / 10000}
                          onChange={(e) =>
                            handleChange("exitBrokerageFixed", Number(e.target.value) * 10000)
                          }
                        />
                      </div>
                    </div>
                    <div className="form-grid two-col">
                      <div>
                        <label>その他売却コスト率 (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={exitOtherCostRateValue}
                          onChange={(e) => handleChange("exitOtherCostRate", Number(e.target.value))}
                        />
                        <p className="form-note">修繕・測量・登記などの概算</p>
                      </div>
                      <div>
                        <label>NPV割引率 (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={exitDiscountRateValue}
                          onChange={(e) => handleChange("exitDiscountRate", Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="form-grid two-col">
                      <div>
                        <label>短期譲渡税率 (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={exitShortTermTaxRateValue}
                          onChange={(e) => handleChange("exitShortTermTaxRate", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label>長期譲渡税率 (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={exitLongTermTaxRateValue}
                          onChange={(e) => handleChange("exitLongTermTaxRate", Number(e.target.value))}
                        />
                        <p className="form-note">5年超で長期を適用</p>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

            </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="form-section form-panel">
              <div className="form-panel-head">
                <h3 className="form-section-title">固定資産税パラメータ</h3>
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => togglePanel("tax")}
                  aria-expanded={openPanels.tax}
                >
                  {openPanels.tax ? "▼ 閉じる" : "▶ 開く"}
                </button>
              </div>
              {openPanels.tax ? (
                <div className="form-grid two-col">
                  <div>
                    <label>土地評価率 (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={landEvaluationRate}
                      onChange={(e) => handleChange("landEvaluationRate", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label>建物評価率 (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={buildingEvaluationRate}
                      onChange={(e) => handleChange("buildingEvaluationRate", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label>住宅用地特例 (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={landTaxReductionRate}
                      onChange={(e) => handleChange("landTaxReductionRate", Number(e.target.value))}
                    />
                    <p className="form-note">※1/6なら16.67%</p>
                  </div>
                  <div>
                    <label>固定資産税率 (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={propertyTaxRate}
                      onChange={(e) => handleChange("propertyTaxRate", Number(e.target.value))}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
