"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { YearlyResult } from "../utils/types";

interface Props {
  results: YearlyResult[];
  selectedYear?: number;
  onSelectYear?: (year: number) => void;
  isOpen?: boolean;
  onToggle?: () => void;
  deadCrossYear?: number | null;
  comparisonResults?: YearlyResult[] | null;
}

const formatAxis = (value: number) => `${Math.round(value / 10000).toLocaleString()}万`;
const formatTooltip = (value: number) => `${Math.round(value).toLocaleString()} 円`;

export const SimulationChart: React.FC<Props> = ({
  results,
  selectedYear,
  onSelectYear,
  isOpen = true,
  onToggle,
  deadCrossYear = null,
  comparisonResults = null,
}) => {
  const chartData = useMemo(() => {
    const comparisonMap = new Map(
      comparisonResults?.map((result) => [result.year, result]) ?? []
    );
    return results.map((result) => {
      const comparison = comparisonMap.get(result.year);
      return {
        ...result,
        totalOutflow:
          result.expense +
          result.loanPaymentTotal +
          (result.propertyTax ?? 0) +
          (result.repairCost ?? 0) +
          (result.acquisitionTax ?? 0),
        comparisonCashFlowPreTax: comparison?.cashFlowPreTax ?? null,
      };
    });
  }, [results, comparisonResults]);

  const handleClick = (state: any) => {
    if (!onSelectYear) return;
    const active = state?.activeLabel;
    if (typeof active === "number") {
      onSelectYear(active);
    }
  };

  return (
    <div className="sheet-card chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">年間収支の推移</h3>
          <p className="chart-subtitle">家賃収入・支出合計・年収支のライン比較</p>
        </div>
        <div className="header-actions">
          {selectedYear ? <div className="chart-pill">選択: {selectedYear}年目</div> : null}
          {onToggle ? (
            <button
              type="button"
              className="section-toggle"
              onClick={onToggle}
              aria-expanded={isOpen}
            >
              {isOpen ? "▼ 閉じる" : "▶ 開く"}
            </button>
          ) : null}
        </div>
      </div>
      {isOpen ? (
        <div className="chart-body">
          {chartData.length === 0 ? (
            <div className="empty-state">入力を更新するとグラフが表示されます。</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                onClick={handleClick}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15, 23, 42, 0.1)" />
                <XAxis
                  dataKey="year"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#4b5563" }}
                  unit="年"
                />
                <YAxis
                  tickFormatter={formatAxis}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#4b5563" }}
                />
                <Tooltip
                  formatter={(value: number) => formatTooltip(value)}
                  labelFormatter={(label) => `${label}年目`}
                />
                <Legend verticalAlign="top" height={28} />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="家賃収入"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="totalOutflow"
                  name="支出合計"
                  stroke="var(--accent-warm)"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cashFlowPreTax"
                  name="年収支（税引前）"
                  stroke="var(--accent-cool)"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cashFlowPostTax"
                  name="年収支（税引後）"
                  stroke="#16a34a"
                  strokeWidth={3}
                  dot={false}
                />
                {comparisonResults ? (
                  <Line
                    type="monotone"
                    dataKey="comparisonCashFlowPreTax"
                    name="年収支(ストレス)"
                    stroke="var(--warn)"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                ) : null}
                {deadCrossYear ? (
                  <ReferenceLine
                    x={deadCrossYear}
                    stroke="#dc2626"
                    strokeDasharray="6 6"
                    label={{
                      value: "デッドクロス",
                      position: "top",
                      fill: "#dc2626",
                      fontSize: 10,
                    }}
                  />
                ) : null}
                {selectedYear ? (
                  <ReferenceLine x={selectedYear} stroke="rgba(15, 23, 42, 0.4)" strokeDasharray="4 4" />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : null}
    </div>
  );
};
