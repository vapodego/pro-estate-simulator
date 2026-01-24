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
  comparisonResults?: YearlyResult[] | null;
  isOpen?: boolean;
  onToggle?: () => void;
}

const formatTooltip = (value: number) => value.toFixed(2);

export const DscrChart: React.FC<Props> = ({
  results,
  comparisonResults = null,
  isOpen = true,
  onToggle,
}) => {
  const chartData = useMemo(() => {
    const comparisonMap = new Map(
      comparisonResults?.map((result) => [result.year, result]) ?? []
    );
    return results.map((result) => {
      const comparison = comparisonMap.get(result.year);
      const baseDscr =
        result.loanPaymentTotal > 0
          ? (result.income - result.expense - result.propertyTax - result.repairCost) /
            result.loanPaymentTotal
          : null;
      const stressDscr =
        comparison && comparison.loanPaymentTotal > 0
          ? (comparison.income - comparison.expense - comparison.propertyTax - comparison.repairCost) /
            comparison.loanPaymentTotal
          : null;
      return {
        year: result.year,
        dscr: baseDscr,
        stressDscr,
      };
    });
  }, [results, comparisonResults]);

  return (
    <div className="sheet-card chart-card dscr-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">DSCRの推移</h3>
          <p className="chart-subtitle">NOI / 年間返済額 の推移比較</p>
        </div>
        {onToggle ? (
          <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={isOpen}>
            {isOpen ? "▼ 閉じる" : "▶ 開く"}
          </button>
        ) : null}
      </div>
      {isOpen ? (
        <div className="chart-body dscr-chart-body">
          {chartData.length === 0 ? (
            <div className="empty-state">入力を更新するとグラフが表示されます。</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15, 23, 42, 0.1)" />
                <XAxis
                  dataKey="year"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#4b5563" }}
                  unit="年"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#4b5563" }}
                  domain={[0, (max: number) => Math.max(1.5, Math.ceil(max * 10) / 10)]}
                />
                <Tooltip
                  formatter={(value: number) => formatTooltip(value)}
                  labelFormatter={(label) => `${label}年目`}
                />
                <Legend verticalAlign="top" height={28} />
                <Line
                  type="monotone"
                  dataKey="dscr"
                  name="DSCR"
                  stroke="var(--accent-cool)"
                  strokeWidth={2.5}
                  dot={false}
                />
                {comparisonResults ? (
                  <Line
                    type="monotone"
                    dataKey="stressDscr"
                    name="DSCR(ストレス)"
                    stroke="var(--warn)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                ) : null}
                <ReferenceLine y={1.0} stroke="rgba(220, 38, 38, 0.6)" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : null}
    </div>
  );
};
