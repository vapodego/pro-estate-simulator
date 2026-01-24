"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SimulationForm } from "../components/SimulationForm";
import { SimulationChart } from "../components/SimulationChart";
import { DscrChart } from "../components/DscrChart";
import { RakumachiImporter, ImportHistoryItem } from "../components/RakumachiImporter";
import { calculateNPV, calculateIRR } from "../utils/finance";
import { calculateSimulation, calculatePMT, calculateUsefulLife } from "../utils/simulation";
import { PropertyInput, ScenarioConfig, YearlyResult } from "../utils/types";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db, googleProvider } from "../utils/firebase";
import { Building2, Calculator, Save, UserCircle } from "lucide-react";
import { applyEstimatedDefaultsWithMeta } from "../utils/estimates";

// デフォルトの初期値（空の状態）
const DEFAULT_INPUT: PropertyInput = {
  price: 0,
  buildingRatio: 0,
  miscCostRate: 0,
  landEvaluationRate: 0,
  buildingEvaluationRate: 0,
  landTaxReductionRate: 0,
  propertyTaxRate: 0,
  structure: "RC",
  buildingAge: 0,
  enableEquipmentSplit: false,
  equipmentRatio: 0,
  equipmentUsefulLife: 0,
  waterContributionRate: 0,
  fireInsuranceRate: 0,
  loanFeeRate: 0,
  registrationCostRate: 0,
  acquisitionTaxRate: 0,
  acquisitionLandReductionRate: 0,
  loanAmount: 0,
  interestRate: 0,
  loanDuration: 0,
  monthlyRent: 0,
  occupancyRate: 0,
  rentDeclineRate: 0,
  operatingExpenseRate: 0,
  repairEvents: [], // 修繕イベント
  vacancyModel: "FIXED",
  vacancyCycleYears: 0,
  vacancyCycleMonths: 0,
  vacancyProbability: 0,
  vacancyProbabilityMonths: 0,
  taxType: "INDIVIDUAL",
  incomeTaxRate: 0,
  otherIncome: 0,
  corporateMinimumTax: 0,
  exitEnabled: false,
  exitYear: 0,
  exitCapRate: 0,
  exitBrokerageRate: 0,
  exitBrokerageFixed: 0,
  exitOtherCostRate: 0,
  exitShortTermTaxRate: 0,
  exitLongTermTaxRate: 0,
  exitDiscountRate: 0,
  scenarioEnabled: false,
  scenarioInterestShockYear: 0,
  scenarioInterestShockDelta: 0,
  scenarioRentCurveEnabled: false,
  scenarioRentDeclineEarlyRate: 0,
  scenarioRentDeclineLateRate: 0,
  scenarioRentDeclineSwitchYear: 0,
  scenarioOccupancyDeclineEnabled: false,
  scenarioOccupancyDeclineStartYear: 0,
  scenarioOccupancyDeclineDelta: 0,
};

const DEFAULT_LEFT_ORDER = [
  "tip",
  "breakdownPrice",
  "breakdownInitial",
  "breakdownTax",
  "breakdownDep",
  "breakdownLoan",
];
const DEFAULT_RIGHT_ORDER = [
  "cashflow",
  "exit",
  "deadcross",
  "scenario",
  "simulation",
  "repayment",
  "charts",
  "dscr",
];

type TableRow = {
  label: string;
  value: (result: YearlyResult) => number;
  tone?: "negative" | "subtle" | "highlight" | "highlight-strong";
  outflow?: boolean;
  rowHighlight?: boolean;
  format?: "yen" | "percent" | "ratio";
};

type TableSection = {
  title: string;
  rows: TableRow[];
};

type SavedSimulation = {
  id: string;
  name: string;
  createdAt: Date | null;
  input: PropertyInput;
};

type SortableCardProps = {
  id: string;
  children: ReactNode;
};

const SortableCard = ({ id, children }: SortableCardProps) => {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={`sortable-item${isDragging ? " is-dragging" : ""}`}>
      <div className="sortable-content">
        <button
          type="button"
          className="drag-band"
          ref={setActivatorNodeRef}
          aria-label="並び替え"
          {...listeners}
          {...attributes}
        />
        {children}
      </div>
    </div>
  );
};

const formatCell = (
  value: number,
  outflow?: boolean,
  format: "yen" | "percent" | "ratio" = "yen"
) => {
  if (!Number.isFinite(value)) return "-";
  if (format === "percent") {
    return `${value.toFixed(2)}%`;
  }
  if (format === "ratio") {
    return value.toFixed(2);
  }
  const abs = Math.round(Math.abs(value));
  let prefix = "";
  if (outflow) {
    prefix = "▲";
  } else if (value < 0) {
    prefix = "-";
  }
  return `${prefix}${abs.toLocaleString()}円`;
};

const formatYen = (value: number) => `${Math.round(value).toLocaleString()}円`;
const formatPercent = (value: number) => `${value.toFixed(2)}%`;
const formatMultiple = (value: number) => `${value.toFixed(2)}x`;
const formatFirebaseError = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "code" in error) {
    const { code, message } = error as FirebaseError;
    return `${fallback} (${code}${message ? `: ${message}` : ""})`;
  }
  return fallback;
};

export default function Home() {
  const [inputData, setInputData] = useState<PropertyInput>(DEFAULT_INPUT);
  const [autoFilledKeys, setAutoFilledKeys] = useState<(keyof PropertyInput)[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [hasImportResult, setHasImportResult] = useState(false);
  const [hasUserAdjusted, setHasUserAdjusted] = useState(false);
  const [hasViewedResults, setHasViewedResults] = useState(false);
  const [selectedYear, setSelectedYear] = useState(1);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [savedItems, setSavedItems] = useState<SavedSimulation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [leftOrder, setLeftOrder] = useState(DEFAULT_LEFT_ORDER);
  const [rightOrder, setRightOrder] = useState(DEFAULT_RIGHT_ORDER);
  const [formVersion, setFormVersion] = useState(0);
  const resultsRef = useRef<HTMLElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [openSections, setOpenSections] = useState({
    cashflow: true,
    simulation: true,
    repayment: true,
    chart: true,
    detail: true,
    exit: true,
    scenario: true,
    dscrChart: true,
    breakdownPrice: true,
    breakdownInitial: true,
    breakdownTax: true,
    breakdownDep: true,
    breakdownLoan: true,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleReorder = (
    event: DragEndEvent,
    setOrder: Dispatch<SetStateAction<string[]>>
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((items) => {
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (accountOpen && accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountOpen(false);
      }
      if (saveOpen && saveMenuRef.current && !saveMenuRef.current.contains(target)) {
        setSaveOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [accountOpen, saveOpen]);

  useEffect(() => {
    if (!user) {
      setSavedItems([]);
      return;
    }
    const q = query(
      collection(db, "simulations"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextItems: SavedSimulation[] = snapshot.docs.map((doc) => {
          const data = doc.data() as {
            name?: string;
            input?: PropertyInput;
            createdAt?: { toDate?: () => Date };
          };
          return {
            id: doc.id,
            name: data.name ?? "無題",
            input: { ...DEFAULT_INPUT, ...(data.input ?? {}) },
            createdAt: data.createdAt?.toDate?.() ?? null,
          };
        });
        setSavedItems(nextItems);
      },
      (error) =>
        setAuthError(formatFirebaseError(error, "保存済みデータの取得に失敗しました。"))
    );
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(formatFirebaseError(error, "ログインに失敗しました。"));
    }
  };

  const handleLogout = async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (error) {
      setAuthError(formatFirebaseError(error, "ログアウトに失敗しました。"));
    }
  };

  const handleSave = async () => {
    if (!user) {
      setAuthError("保存にはログインが必要です。");
      return;
    }
    const name = saveName.trim() || "シミュレーション";
    setIsSaving(true);
    try {
      await addDoc(collection(db, "simulations"), {
        userId: user.uid,
        name,
        input: inputData,
        createdAt: serverTimestamp(),
      });
      setSaveName("");
    } catch (error) {
      setAuthError(formatFirebaseError(error, "保存に失敗しました。"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (item: SavedSimulation) => {
    setInputData({ ...DEFAULT_INPUT, ...item.input });
    setAutoFilledKeys([]);
    setSelectedImportId(null);
    setHasUserAdjusted(false);
    setHasViewedResults(false);
    setSelectedYear(1);
    setFormVersion((prev) => prev + 1);
  };

  const handleImportApply = (payload: {
    patch: Partial<PropertyInput>;
    listing: ImportHistoryItem["listing"];
    url: string;
  }) => {
    const merged = { ...inputData, ...payload.patch };
    const { data, autoFilled } = applyEstimatedDefaultsWithMeta(merged);
    setInputData(data);
    setAutoFilledKeys(autoFilled);
    if (payload.url) {
      const id = payload.url;
      setImportHistory((prev) => {
        const nextItem: ImportHistoryItem = {
          id,
          url: payload.url,
          listing: payload.listing ?? null,
          input: data,
          autoFilled,
          createdAt: Date.now(),
        };
        const existingIndex = prev.findIndex((item) => item.id === id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next.splice(existingIndex, 1, nextItem);
          return next;
        }
        return [nextItem, ...prev].slice(0, 5);
      });
      setSelectedImportId(id);
    }
    setHasUserAdjusted(true);
    setHasViewedResults(false);
    setSelectedYear(1);
    setFormVersion((prev) => prev + 1);
  };

  const handleImportSelect = (id: string) => {
    const item = importHistory.find((entry) => entry.id === id);
    if (!item) return;
    setInputData(item.input);
    setAutoFilledKeys(item.autoFilled);
    setSelectedImportId(id);
    setHasUserAdjusted(false);
    setHasViewedResults(false);
    setSelectedYear(1);
    setFormVersion((prev) => prev + 1);
  };

  const handleImportClear = () => {
    setImportHistory([]);
    setSelectedImportId(null);
    setHasUserAdjusted(false);
    setHasViewedResults(false);
  };

  const handleImportResultChange = (hasResult: boolean) => {
    setHasImportResult(hasResult);
    if (!hasResult) {
      setHasUserAdjusted(false);
      setHasViewedResults(false);
    }
  };

  const selectedImport = useMemo(
    () => (selectedImportId ? importHistory.find((item) => item.id === selectedImportId) ?? null : null),
    [importHistory, selectedImportId]
  );

  const handleFieldTouch = (key: keyof PropertyInput) => {
    setAutoFilledKeys((prev) => prev.filter((item) => item !== key));
    setHasUserAdjusted(true);
  };

  const currentStep = useMemo(() => {
    if (!hasImportResult) return 1;
    if (!hasUserAdjusted) return 2;
    if (!hasViewedResults) return 3;
    return 4;
  }, [hasImportResult, hasUserAdjusted, hasViewedResults]);

  useEffect(() => {
    const element = resultsRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasViewedResults(true);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scenarioConfig: ScenarioConfig = {
    interestRateShockEnabled: inputData.scenarioEnabled,
    interestRateShockYear: inputData.scenarioInterestShockYear,
    interestRateShockDelta: inputData.scenarioInterestShockDelta,
    rentCurveEnabled: inputData.scenarioRentCurveEnabled,
    rentDeclineEarlyRate: inputData.scenarioRentDeclineEarlyRate,
    rentDeclineLateRate: inputData.scenarioRentDeclineLateRate,
    rentDeclineSwitchYear: inputData.scenarioRentDeclineSwitchYear,
    occupancyDeclineEnabled: inputData.scenarioOccupancyDeclineEnabled,
    occupancyDeclineStartYear: inputData.scenarioOccupancyDeclineStartYear,
    occupancyDeclineDelta: inputData.scenarioOccupancyDeclineDelta,
  };

  const results = useMemo(() => calculateSimulation(inputData), [inputData]);
  const stressResults = useMemo(
    () => (inputData.scenarioEnabled ? calculateSimulation(inputData, scenarioConfig) : null),
    [inputData]
  );
  const visibleResults = results.slice(0, 35);
  const selectedResult = results.find((result) => result.year === selectedYear);
  const loanResults = results.filter((result) => result.year <= inputData.loanDuration);
  const visibleLoanResults = results.slice(0, 35);
  const basePrice = inputData.price;
  const buildingPrice = Math.round(basePrice * (inputData.buildingRatio / 100));
  const landPrice = Math.max(0, basePrice - buildingPrice);
  const equipmentPrice = inputData.enableEquipmentSplit
    ? Math.round(buildingPrice * (inputData.equipmentRatio / 100))
    : 0;
  const bodyPrice = Math.max(0, buildingPrice - equipmentPrice);
  const miscCost = Math.round(basePrice * (inputData.miscCostRate / 100));
  const waterContribution = Math.round(basePrice * (inputData.waterContributionRate / 100));
  const fireInsurance = Math.round(buildingPrice * (inputData.fireInsuranceRate / 100));
  const loanFee = Math.round(inputData.loanAmount * (inputData.loanFeeRate / 100));
  const registrationCost = Math.round(basePrice * (inputData.registrationCostRate / 100));
  const totalInitialCosts =
    miscCost + waterContribution + fireInsurance + loanFee + registrationCost;
  const totalPrice = basePrice + totalInitialCosts;
  const landEvaluation = Math.round(landPrice * (inputData.landEvaluationRate / 100));
  const buildingEvaluation = Math.round(buildingPrice * (inputData.buildingEvaluationRate / 100));
  const propertyTaxEstimate = Math.round(
    (landEvaluation * (inputData.landTaxReductionRate / 100) + buildingEvaluation) *
      (inputData.propertyTaxRate / 100)
  );
  const acquisitionTaxEstimate = Math.round(
    (landEvaluation * (inputData.acquisitionLandReductionRate / 100) + buildingEvaluation) *
      (inputData.acquisitionTaxRate / 100)
  );
  const depreciationYears = Math.max(1, calculateUsefulLife(inputData.structure, inputData.buildingAge));
  const equipmentLife = inputData.enableEquipmentSplit
    ? Math.max(1, Math.round(inputData.equipmentUsefulLife || 15))
    : 0;
  const bodyDepreciation = Math.round(bodyPrice / depreciationYears);
  const equipmentDepreciation = inputData.enableEquipmentSplit
    ? Math.round(equipmentPrice / equipmentLife)
    : 0;
  const totalDepreciation = bodyDepreciation + equipmentDepreciation;
  const monthlyPayment =
    inputData.loanAmount > 0 && inputData.loanDuration > 0
      ? calculatePMT(inputData.interestRate, inputData.loanDuration, inputData.loanAmount)
      : 0;
  const annualPayment = Math.round(monthlyPayment * 12);
  const totalRepayment = loanResults.reduce((sum, result) => sum + result.loanPaymentTotal, 0);
  const equity = totalPrice - inputData.loanAmount;
  const exitYear = Math.min(Math.max(1, Math.round(inputData.exitYear)), results.length || 35);
  const exitResult = results.find((result) => result.year === exitYear);
  const accumulatedBodyDep = results
    .slice(0, exitYear)
    .reduce((sum, result) => sum + result.depreciationBody, 0);
  const accumulatedEquipmentDep = results
    .slice(0, exitYear)
    .reduce((sum, result) => sum + result.depreciationEquipment, 0);
  const remainingBasis =
    landPrice +
    Math.max(0, bodyPrice - accumulatedBodyDep) +
    Math.max(0, equipmentPrice - accumulatedEquipmentDep) +
    totalInitialCosts +
    acquisitionTaxEstimate;
  const exitCapRate = inputData.exitCapRate / 100;
  const exitNoi = exitResult
    ? exitResult.income - exitResult.expense - exitResult.propertyTax
    : 0;
  const exitSalePrice = exitCapRate > 0 ? Math.round(exitNoi / exitCapRate) : 0;
  const exitBrokerage = Math.round(
    exitSalePrice * (inputData.exitBrokerageRate / 100) + inputData.exitBrokerageFixed
  );
  const exitOtherCosts = Math.round(exitSalePrice * (inputData.exitOtherCostRate / 100));
  const taxableGain = exitSalePrice - exitBrokerage - exitOtherCosts - remainingBasis;
  const exitTaxRate =
    exitYear <= 5 ? inputData.exitShortTermTaxRate : inputData.exitLongTermTaxRate;
  const exitTax = taxableGain > 0 ? Math.round(taxableGain * (exitTaxRate / 100)) : 0;
  const exitLoanBalance = exitResult ? exitResult.loanBalance : 0;
  const exitNetProceeds = inputData.exitEnabled
    ? Math.round(exitSalePrice - exitBrokerage - exitOtherCosts - exitTax - exitLoanBalance)
    : 0;
  const exitCashFlows = inputData.exitEnabled
    ? [
        -equity,
        ...results.slice(0, exitYear).map((result) => result.cashFlowPostTax),
      ]
    : [];
  if (inputData.exitEnabled && exitCashFlows.length > exitYear) {
    exitCashFlows[exitYear] += exitNetProceeds;
  }
  const exitIrr = inputData.exitEnabled ? calculateIRR(exitCashFlows) : null;
  const exitNpv = inputData.exitEnabled
    ? calculateNPV(inputData.exitDiscountRate / 100, exitCashFlows)
    : null;
  const baseEquityMultiple = inputData.exitEnabled && equity > 0
    ? exitCashFlows.slice(1).reduce((sum, cashFlow) => sum + cashFlow, 0) / equity
    : null;
  const stressExit =
    inputData.exitEnabled && stressResults
      ? (() => {
          const stressExitResult = stressResults.find((result) => result.year === exitYear);
          const stressNoi = stressExitResult
            ? stressExitResult.income -
              stressExitResult.expense -
              stressExitResult.propertyTax
            : 0;
          const stressSalePrice = exitCapRate > 0 ? Math.round(stressNoi / exitCapRate) : 0;
          const stressBrokerage = Math.round(
            stressSalePrice * (inputData.exitBrokerageRate / 100) + inputData.exitBrokerageFixed
          );
          const stressOtherCosts = Math.round(
            stressSalePrice * (inputData.exitOtherCostRate / 100)
          );
          const stressTaxableGain = stressSalePrice - stressBrokerage - stressOtherCosts - remainingBasis;
          const stressTax = stressTaxableGain > 0 ? Math.round(stressTaxableGain * (exitTaxRate / 100)) : 0;
          const stressLoanBalance = stressExitResult ? stressExitResult.loanBalance : 0;
          const stressNetProceeds = Math.round(
            stressSalePrice - stressBrokerage - stressOtherCosts - stressTax - stressLoanBalance
          );
          const stressCashFlows = [
            -equity,
            ...stressResults.slice(0, exitYear).map((result) => result.cashFlowPostTax),
          ];
          if (stressCashFlows.length > exitYear) {
            stressCashFlows[exitYear] += stressNetProceeds;
          }
          return {
            salePrice: stressSalePrice,
            netProceeds: stressNetProceeds,
            irr: calculateIRR(stressCashFlows),
            npv: calculateNPV(inputData.exitDiscountRate / 100, stressCashFlows),
            equityMultiple:
              equity > 0
                ? stressCashFlows.slice(1).reduce((sum, cashFlow) => sum + cashFlow, 0) / equity
                : null,
          };
        })()
      : null;
  const deadCrossYears = results.filter((result) => result.isDeadCross).map((result) => result.year);
  const firstDeadCrossYear = deadCrossYears.length > 0 ? deadCrossYears[0] : null;
  const deadCrossCount = deadCrossYears.length;
  const summarizeScenario = (scenarioResults: YearlyResult[]) => {
    const totalCashFlow = scenarioResults.reduce(
      (sum, result) => sum + result.cashFlowPostTax,
      0
    );
    let minCashFlow = Number.POSITIVE_INFINITY;
    let minCashFlowYear = 1;
    let minDscr = Number.POSITIVE_INFINITY;
    scenarioResults.forEach((result) => {
      if (result.cashFlowPostTax < minCashFlow) {
        minCashFlow = result.cashFlowPostTax;
        minCashFlowYear = result.year;
      }
      if (result.loanPaymentTotal > 0) {
        const noi = result.income - result.expense - result.propertyTax - result.repairCost;
        const dscr = noi / result.loanPaymentTotal;
        if (dscr < minDscr) minDscr = dscr;
      }
    });
    return {
      totalCashFlow,
      minCashFlow,
      minCashFlowYear,
      minDscr: Number.isFinite(minDscr) ? minDscr : NaN,
    };
  };
  const baseSummary = summarizeScenario(results);
  const stressSummary = stressResults ? summarizeScenario(stressResults) : null;

  const tableSections: TableSection[] = [
    {
      title: "収入・支出",
      rows: [
        { label: "家賃収入", value: (r) => r.income },
        { label: "減価償却費", value: (r) => r.depreciationTotal },
        { label: "固定資産税", value: (r) => r.propertyTax, outflow: true, tone: "negative" },
        { label: "修繕費", value: (r) => r.repairCost, outflow: true, tone: "negative" },
        { label: "管理費等経費", value: (r) => r.expense, outflow: true, tone: "negative" },
        { label: "返済利息", value: (r) => r.loanInterest, outflow: true, tone: "subtle" },
        {
          label: "経費計",
          value: (r) =>
            r.depreciationTotal + r.propertyTax + r.repairCost + r.expense + r.loanInterest,
          outflow: true,
          tone: "highlight",
        },
        { label: "所得概算", value: (r) => r.taxableIncome, tone: "highlight" },
        { label: "所得税概算", value: (r) => r.taxAmount, outflow: true, tone: "negative" },
      ],
    },
    {
      title: "返済計画",
      rows: [
        { label: "借入残高", value: (r) => r.loanBalance },
        { label: "年間返済元金", value: (r) => r.loanPrincipal, outflow: true, tone: "subtle" },
        { label: "年間返済利息", value: (r) => r.loanInterest, outflow: true, tone: "subtle" },
        { label: "年間返済計", value: (r) => r.loanPaymentTotal, outflow: true, tone: "highlight" },
      ],
    },
    {
      title: "指標",
      rows: [
        {
          label: "返済比率",
          value: (r) => (r.income > 0 ? (r.loanPaymentTotal / r.income) * 100 : NaN),
          format: "percent",
        },
        {
          label: "DSCR",
          value: (r) =>
            r.loanPaymentTotal > 0
              ? ((r.income - r.expense - r.propertyTax - r.repairCost) / r.loanPaymentTotal)
              : NaN,
          format: "ratio",
        },
        {
          label: "純利回り",
          value: (r) =>
            totalPrice > 0 ? ((r.income - r.expense - r.propertyTax) / totalPrice) * 100 : NaN,
          format: "percent",
        },
        {
          label: "CCR",
          value: (r) => (equity > 0 ? (r.cashFlowPostTax / equity) * 100 : NaN),
          format: "percent",
        },
      ],
    },
  ];

  useEffect(() => {
    if (!results.length) return;
    if (selectedYear > results.length) {
      setSelectedYear(results.length);
    }
  }, [results, selectedYear]);

  const leftPanels: Record<string, ReactNode> = {
    tip: (
      <div className="tip-card">
        <Calculator size={18} />
        <span>
          数値を変更するとリアルタイムで更新されます。
          <br />
          「高度な設定」で設備分離・税務条件も切り替え可能です。
        </span>
      </div>
    ),
    breakdownPrice: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">物件価格 内訳</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownPrice")}
              aria-expanded={openSections.breakdownPrice}
            >
              {openSections.breakdownPrice ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownPrice ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">物件価格 (本体)</td>
                  <td className="value calc total">{formatYen(basePrice)}</td>
                </tr>
                <tr>
                  <td className="label">建物価格 (概算)</td>
                  <td className="value input">{formatYen(buildingPrice)}</td>
                </tr>
                <tr>
                  <td className="label">土地価格 (概算)</td>
                  <td className="value input">{formatYen(landPrice)}</td>
                </tr>
                <tr>
                  <td className="label">初期費用合計</td>
                  <td className="value calc">{formatYen(totalInitialCosts)}</td>
                </tr>
                <tr>
                  <td className="label">購入総額 (本体+初期費用)</td>
                  <td className="value calc total">{formatYen(totalPrice)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">※建物比率と初期費用設定から自動算出</div>
          </>
        ) : null}
      </div>
    ),
    breakdownInitial: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">初期費用 内訳</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownInitial")}
              aria-expanded={openSections.breakdownInitial}
            >
              {openSections.breakdownInitial ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownInitial ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">水道分担金 ({inputData.waterContributionRate}%)</td>
                  <td className="value calc">{formatYen(waterContribution)}</td>
                </tr>
                <tr>
                  <td className="label">火災保険 (5年一括)</td>
                  <td className="value calc">{formatYen(fireInsurance)}</td>
                </tr>
                <tr>
                  <td className="label">融資手数料 ({inputData.loanFeeRate}%)</td>
                  <td className="value calc">{formatYen(loanFee)}</td>
                </tr>
                <tr>
                  <td className="label">登記費用 ({inputData.registrationCostRate}%)</td>
                  <td className="value calc">{formatYen(registrationCost)}</td>
                </tr>
                <tr>
                  <td className="label">その他諸費用 ({inputData.miscCostRate}%)</td>
                  <td className="value calc">{formatYen(miscCost)}</td>
                </tr>
                <tr>
                  <td className="label">初期費用合計</td>
                  <td className="value calc total">{formatYen(totalInitialCosts)}</td>
                </tr>
                <tr>
                  <td className="label">不動産取得税 (翌年)</td>
                  <td className="value calc">{formatYen(acquisitionTaxEstimate)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">※不動産取得税は購入翌年に支払い</div>
          </>
        ) : null}
      </div>
    ),
    breakdownTax: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">固定資産税計算用</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算値</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownTax")}
              aria-expanded={openSections.breakdownTax}
            >
              {openSections.breakdownTax ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownTax ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">土地の評価額 (土地×{inputData.landEvaluationRate}%)</td>
                  <td className="value calc">{formatYen(landEvaluation)}</td>
                </tr>
                <tr>
                  <td className="label">建物評価額 (建物×{inputData.buildingEvaluationRate}%)</td>
                  <td className="value calc">{formatYen(buildingEvaluation)}</td>
                </tr>
                <tr>
                  <td className="label">固定資産税概算額</td>
                  <td className="value calc total">{formatYen(propertyTaxEstimate)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">
              ※住宅用地特例({inputData.landTaxReductionRate}%適用)・税率
              {inputData.propertyTaxRate}%で概算
            </div>
          </>
        ) : null}
      </div>
    ),
    breakdownDep: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">減価償却計算用</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算値</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownDep")}
              aria-expanded={openSections.breakdownDep}
            >
              {openSections.breakdownDep ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownDep ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">躯体減価償却費 (年間)</td>
                  <td className="value calc">{formatYen(bodyDepreciation)}</td>
                </tr>
                {inputData.enableEquipmentSplit ? (
                  <tr>
                    <td className="label">設備減価償却費 (年間)</td>
                    <td className="value calc">{formatYen(equipmentDepreciation)}</td>
                  </tr>
                ) : null}
                {inputData.enableEquipmentSplit ? (
                  <tr>
                    <td className="label">設備耐用年数</td>
                    <td className="value calc">{equipmentLife}年</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="label">残存償却年数</td>
                  <td className="value calc total">{depreciationYears}年</td>
                </tr>
                {inputData.enableEquipmentSplit ? (
                  <tr>
                    <td className="label">減価償却費 合計</td>
                    <td className="value calc total">{formatYen(totalDepreciation)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="breakdown-foot">※簡便法での耐用年数を使用</div>
          </>
        ) : null}
      </div>
    ),
    breakdownLoan: (
      <div className="sheet-card breakdown-card">
        <div className="breakdown-head">
          <h3 className="breakdown-title">借入・返済試算用</h3>
          <div className="header-actions">
            <span className="breakdown-pill">概算値</span>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("breakdownLoan")}
              aria-expanded={openSections.breakdownLoan}
            >
              {openSections.breakdownLoan ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.breakdownLoan ? (
          <>
            <table className="breakdown-table">
              <tbody>
                <tr>
                  <td className="label">自己資金</td>
                  <td className="value calc">{formatYen(equity)}</td>
                </tr>
                <tr>
                  <td className="label">借入額</td>
                  <td className="value input">{formatYen(inputData.loanAmount)}</td>
                </tr>
                <tr>
                  <td className="label">金利</td>
                  <td className="value input">{formatPercent(inputData.interestRate)}</td>
                </tr>
                <tr>
                  <td className="label">返済期間 (年)</td>
                  <td className="value input">{inputData.loanDuration}年</td>
                </tr>
                <tr>
                  <td className="label">月次返済額</td>
                  <td className="value calc">{formatYen(monthlyPayment)}</td>
                </tr>
                <tr>
                  <td className="label">年間返済額</td>
                  <td className="value calc total">{formatYen(annualPayment)}</td>
                </tr>
              </tbody>
            </table>
            <div className="breakdown-foot">※元利均等返済で概算</div>
          </>
        ) : null}
      </div>
    ),
  };

  const rightPanels: Record<string, ReactNode> = {
    cashflow: (
      <div className="sheet-card table-card">
        <div className="table-head">
          <h2 className="table-title">キャッシュフロー</h2>
          <div className="table-actions">
            <div className="table-controls">家賃収入と支払の年間収支</div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("cashflow")}
              aria-expanded={openSections.cashflow}
            >
              {openSections.cashflow ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.cashflow ? (
          <div className="table-scroll">
            {visibleResults.length === 0 ? (
              <div className="empty-state">入力を更新するとキャッシュフローが表示されます。</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="row-title">項目</th>
                    {visibleResults.map((result) => (
                      <th key={`cf-year-${result.year}`} className="year-cell">
                        {result.year}年
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="section-row">
                    <td colSpan={visibleResults.length + 1}>キャッシュフロー</td>
                  </tr>
                  <tr>
                    <td className="row-title">家賃収入</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-income-${result.year}`} className="cell highlight">
                        {formatCell(result.income)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">元本返済</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">借入利息</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">固定資産税</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-tax-${result.year}`} className="cell">
                        {formatCell(result.propertyTax, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">修繕費</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-repair-${result.year}`} className="cell">
                        {formatCell(result.repairCost, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">不動産取得税</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-acq-tax-${result.year}`} className="cell">
                        {formatCell(result.acquisitionTax, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">管理費等経費</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-expense-${result.year}`} className="cell">
                        {formatCell(result.expense, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">所得税</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-income-tax-${result.year}`} className="cell">
                        {formatCell(result.taxAmount, true)}
                      </td>
                    ))}
                  </tr>
                  {inputData.exitEnabled ? (
                    <tr>
                      <td className="row-title">売却手残り</td>
                      {visibleResults.map((result) => (
                        <td key={`cf-exit-${result.year}`} className="cell highlight">
                          {formatCell(result.year === exitYear ? exitNetProceeds : 0)}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                  <tr className="row-highlight">
                    <td className="row-title">支払計</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-total-${result.year}`} className="cell highlight">
                        {formatCell(
                          result.loanPrincipal +
                            result.loanInterest +
                            result.propertyTax +
                            result.repairCost +
                            result.acquisitionTax +
                            result.expense +
                            result.taxAmount,
                          true
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="row-highlight">
                    <td className="row-title">年度収支</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-net-${result.year}`} className="cell highlight-strong">
                        {formatCell(result.cashFlowPostTax)}
                      </td>
                    ))}
                  </tr>
                  {inputData.exitEnabled ? (
                    <tr className="row-highlight">
                      <td className="row-title">売却込み年度収支</td>
                      {visibleResults.map((result) => (
                        <td key={`cf-net-exit-${result.year}`} className="cell highlight-strong">
                          {formatCell(
                            result.cashFlowPostTax +
                              (result.year === exitYear ? exitNetProceeds : 0)
                          )}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>
    ),
    exit: (
      <div className="sheet-card exit-card">
        <div className="table-head">
          <h2 className="table-title">出口戦略（売却）</h2>
          <div className="table-actions">
            <div className="table-controls">
              {inputData.exitEnabled ? `売却想定: ${exitYear}年目` : "売却シミュレーションは無効"}
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("exit")}
              aria-expanded={openSections.exit}
            >
              {openSections.exit ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.exit ? (
          inputData.exitEnabled ? (
            <div className="exit-body">
              <div className="detail-grid exit-grid">
                <div className="detail-item">
                  <span className="detail-label">想定売却価格</span>
                  <span className="detail-value">{formatYen(exitSalePrice)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">売却手残り (ATCF)</span>
                  <span className="detail-value">{formatYen(exitNetProceeds)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">IRR</span>
                  <span className="detail-value">
                    {exitIrr !== null ? formatPercent(exitIrr * 100) : "-"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Equity Multiple</span>
                  <span className="detail-value">
                    {baseEquityMultiple !== null ? formatMultiple(baseEquityMultiple) : "-"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">NPV</span>
                  <span className="detail-value">
                    {exitNpv !== null ? formatYen(exitNpv) : "-"}
                  </span>
                </div>
              </div>
              <table className="breakdown-table exit-table">
                <tbody>
                  <tr>
                    <td className="label">売却年</td>
                    <td className="value calc">{exitYear}年目</td>
                  </tr>
                  <tr>
                    <td className="label">売却年NOI</td>
                    <td className="value calc">{formatYen(exitNoi)}</td>
                  </tr>
                  <tr>
                    <td className="label">キャップレート</td>
                    <td className="value calc">{formatPercent(inputData.exitCapRate)}</td>
                  </tr>
                  <tr>
                    <td className="label">仲介手数料</td>
                    <td className="value calc">{formatYen(exitBrokerage)}</td>
                  </tr>
                  <tr>
                    <td className="label">その他売却費用</td>
                    <td className="value calc">{formatYen(exitOtherCosts)}</td>
                  </tr>
                  <tr>
                    <td className="label">譲渡税</td>
                    <td className="value calc">{formatYen(exitTax)}</td>
                  </tr>
                  <tr>
                    <td className="label">ローン残債</td>
                    <td className="value calc">{formatYen(exitLoanBalance)}</td>
                  </tr>
                  <tr>
                    <td className="label">残存簿価</td>
                    <td className="value calc">{formatYen(remainingBasis)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="breakdown-foot">
                ※売却年のNOIをキャップレートで割り戻して価格を算出しています。
              </div>
            </div>
          ) : (
            <div className="empty-state">売却シミュレーションは無効です。</div>
          )
        ) : null}
      </div>
    ),
    deadcross: (
      <div
        className={`sheet-card alert-card ${
          firstDeadCrossYear ? "alert-danger" : "alert-ok"
        }`}
      >
        <div className="alert-title">デッドクロス警告</div>
        <div className="alert-body">
          {firstDeadCrossYear ? (
            <>
              {firstDeadCrossYear}年目からデッドクロスが発生しています。（該当年数: {deadCrossCount}年）
            </>
          ) : (
            <>デッドクロスは確認されません。</>
          )}
        </div>
      </div>
    ),
    scenario: (
      <div className="sheet-card scenario-card">
        <div className="table-head">
          <h2 className="table-title">リスクシナリオ比較</h2>
          <div className="table-actions">
            <div className="table-controls">
              {inputData.scenarioEnabled ? "ベース vs ストレス" : "シナリオ比較は無効"}
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("scenario")}
              aria-expanded={openSections.scenario}
            >
              {openSections.scenario ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.scenario ? (
          inputData.scenarioEnabled && stressSummary ? (
            <div className="scenario-body">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th className="label">指標</th>
                    <th className="value">ベース</th>
                    <th className="value">ストレス</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="label">最低キャッシュフロー</td>
                    <td className="value calc">
                      {formatYen(baseSummary.minCashFlow)}（{baseSummary.minCashFlowYear}年目）
                    </td>
                    <td className="value calc">
                      {formatYen(stressSummary.minCashFlow)}（{stressSummary.minCashFlowYear}年目）
                    </td>
                  </tr>
                  <tr>
                    <td className="label">最低DSCR</td>
                    <td className="value calc">
                      {Number.isFinite(baseSummary.minDscr) ? baseSummary.minDscr.toFixed(2) : "-"}
                    </td>
                    <td className="value calc">
                      {Number.isFinite(stressSummary.minDscr) ? stressSummary.minDscr.toFixed(2) : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="label">35年累計CF</td>
                    <td className="value calc">{formatYen(baseSummary.totalCashFlow)}</td>
                    <td className="value calc">{formatYen(stressSummary.totalCashFlow)}</td>
                  </tr>
                  {inputData.exitEnabled ? (
                    <tr>
                      <td className="label">IRR（売却込み）</td>
                      <td className="value calc">
                        {exitIrr !== null ? formatPercent(exitIrr * 100) : "-"}
                      </td>
                      <td className="value calc">
                        {stressExit && stressExit.irr !== null
                          ? formatPercent(stressExit.irr * 100)
                          : "-"}
                      </td>
                    </tr>
                  ) : null}
                  {inputData.exitEnabled ? (
                    <tr>
                      <td className="label">Equity Multiple</td>
                      <td className="value calc">
                        {baseEquityMultiple !== null ? formatMultiple(baseEquityMultiple) : "-"}
                      </td>
                      <td className="value calc">
                        {stressExit && stressExit.equityMultiple !== null
                          ? formatMultiple(stressExit.equityMultiple)
                          : "-"}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <div className="breakdown-foot">
                金利上昇: {inputData.scenarioInterestShockYear}年目 +
                {inputData.scenarioInterestShockDelta}% / 家賃下落:{" "}
                {inputData.scenarioRentDeclineEarlyRate}%→{inputData.scenarioRentDeclineLateRate}%
                （{inputData.scenarioRentDeclineSwitchYear}年目切替） / 入居率低下:{" "}
                {inputData.scenarioOccupancyDeclineStartYear}年目 -
                {inputData.scenarioOccupancyDeclineDelta}%
              </div>
            </div>
          ) : (
            <div className="empty-state">シナリオ比較を有効にしてください。</div>
          )
        ) : null}
      </div>
    ),
    simulation: (
      <div className="sheet-card table-card">
        <div className="table-head">
          <h2 className="table-title">年度別シミュレーション表 (1〜35年)</h2>
          <div className="table-actions">
            <div className="table-controls">クリックで年次を選択</div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("simulation")}
              aria-expanded={openSections.simulation}
            >
              {openSections.simulation ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.simulation ? (
          <div className="table-scroll">
            {visibleResults.length === 0 ? (
              <div className="empty-state">入力を更新すると表が生成されます。</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="row-title">項目</th>
                    {visibleResults.map((result) => (
                      <th
                        key={result.year}
                        className="year-cell"
                        data-selected={selectedYear === result.year}
                      >
                        <button
                          type="button"
                          className="year-button"
                          onClick={() => setSelectedYear(result.year)}
                        >
                          {result.year}年
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                {tableSections.map((section) => (
                  <tbody key={section.title}>
                    <tr className="section-row">
                      <td colSpan={visibleResults.length + 1}>{section.title}</td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr key={row.label} className={row.rowHighlight ? "row-highlight" : undefined}>
                        <td className="row-title">{row.label}</td>
                        {visibleResults.map((result) => {
                          const value = row.value(result);
                          const classes = ["cell"];
                          if (row.tone) classes.push(row.tone);
                          if (row.outflow || value < 0) classes.push("negative");
                          return (
                            <td key={`${row.label}-${result.year}`} className={classes.join(" ")}>
                              {formatCell(value, row.outflow, row.format)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </div>
        ) : null}
      </div>
    ),
    repayment: (
      <div className="sheet-card table-card">
        <div className="table-head">
          <h2 className="table-title">元利均等返済方式による返済明細</h2>
          <div className="table-actions">
            <div className="table-meta">
              <span className="table-chip">借入額: {formatYen(inputData.loanAmount)}</span>
              <span className="table-chip">金利: {formatPercent(inputData.interestRate)}</span>
              <span className="table-chip">返済期間: {inputData.loanDuration}年</span>
              <span className="table-chip">総返済額: {formatYen(totalRepayment)}</span>
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("repayment")}
              aria-expanded={openSections.repayment}
            >
              {openSections.repayment ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.repayment ? (
          <div className="table-scroll">
            {visibleLoanResults.length === 0 ? (
              <div className="empty-state">借入条件を入力すると返済明細が表示されます。</div>
            ) : (
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="row-title">年目</th>
                    {visibleLoanResults.map((result) => (
                      <th key={`loan-${result.year}`} className="year-cell">
                        {result.year}年
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="section-row">
                    <td colSpan={visibleLoanResults.length + 1}>月度</td>
                  </tr>
                  <tr>
                    <td className="row-title">元金</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">利息</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">月額返済計</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-total-${result.year}`} className="cell highlight">
                        {formatCell(result.loanPaymentTotal / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr className="section-row">
                    <td colSpan={visibleLoanResults.length + 1}>年度</td>
                  </tr>
                  <tr>
                    <td className="row-title">借入残高 (年末)</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`balance-${result.year}`} className="cell">
                        {formatCell(result.loanBalance)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">年間返済額</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-payment-${result.year}`} className="cell highlight">
                        {formatCell(result.loanPaymentTotal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">うち元金</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">うち利息</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest, true)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>
    ),
    charts: (
      <div className="chart-grid">
        <SimulationChart
          results={results}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          isOpen={openSections.chart}
          onToggle={() => toggleSection("chart")}
          deadCrossYear={firstDeadCrossYear}
          comparisonResults={stressResults ?? undefined}
        />

        <div className="detail-card">
          <div className="detail-header">
            <h3 className="detail-title">選択年のキャッシュフロー</h3>
            <div className="header-actions">
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {results.map((result) => (
                  <option key={result.year} value={result.year}>
                    {result.year}年目
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="section-toggle"
                onClick={() => toggleSection("detail")}
                aria-expanded={openSections.detail}
              >
                {openSections.detail ? "▼ 閉じる" : "▶ 開く"}
              </button>
            </div>
          </div>

          {openSections.detail ? (
            selectedResult ? (
              <>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">家賃収入</span>
                    <span className="detail-value">{formatYen(selectedResult.income)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">支出合計</span>
                    <span className="detail-value">
                      {formatYen(
                        selectedResult.expense +
                          selectedResult.loanPaymentTotal +
                          selectedResult.propertyTax +
                          selectedResult.repairCost +
                          selectedResult.acquisitionTax
                      )}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">固定資産税</span>
                    <span className="detail-value">{formatYen(selectedResult.propertyTax)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">修繕費</span>
                    <span className="detail-value">{formatYen(selectedResult.repairCost)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">不動産取得税</span>
                    <span className="detail-value">
                      {formatYen(selectedResult.acquisitionTax)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">減価償却</span>
                    <span className="detail-value">
                      {formatYen(selectedResult.depreciationTotal)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">税額</span>
                    <span className="detail-value">{formatYen(selectedResult.taxAmount)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">税引後CF</span>
                    <span className="detail-value">{formatYen(selectedResult.cashFlowPostTax)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">借入残高</span>
                    <span className="detail-value">{formatYen(selectedResult.loanBalance)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">DSCR</span>
                    <span className="detail-value">
                      {selectedResult.loanPaymentTotal > 0
                        ? (
                            (selectedResult.income -
                              selectedResult.expense -
                              selectedResult.propertyTax -
                              selectedResult.repairCost) /
                            selectedResult.loanPaymentTotal
                          ).toFixed(2)
                        : "-"}
                    </span>
                  </div>
                </div>
                <div className="detail-footer">
                  {selectedResult.isDeadCross ? (
                    <span className="detail-flag">デッドクロス発生</span>
                  ) : (
                    <span className="detail-flag ok">デッドクロスなし</span>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">年次を選択してください。</div>
            )
          ) : null}
        </div>
      </div>
    ),
    dscr: (
      <DscrChart
        results={results}
        comparisonResults={stressResults ?? undefined}
        isOpen={openSections.dscrChart}
        onToggle={() => toggleSection("dscrChart")}
      />
    ),
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <div className="title-icon">
            <Building2 size={22} />
          </div>
          <div>
            Pro Estate Simulator <span>ledger</span>
          </div>
        </div>
        <div className="header-right">
          <div className="app-note">減価償却・デッドクロス解析エンジン搭載</div>
          <div className="header-actions">
            <div className="save-menu" ref={saveMenuRef}>
              <button
                type="button"
                className="save-button"
                onClick={() => setSaveOpen((prev) => !prev)}
                aria-expanded={saveOpen}
                aria-controls="save-popover"
              >
                <Save size={20} aria-hidden />
              </button>
              {saveOpen ? (
                <div className="save-popover" id="save-popover">
                  <div className="account-popover-head">
                    <span className="account-popover-title">シミュレーション保存</span>
                    <span className="breakdown-pill">マイデータ</span>
                  </div>
                  <div className="save-body">
                    {user ? (
                      <>
                        <div className="save-row">
                          <input
                            type="text"
                            placeholder="保存名を入力"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                          />
                          <button
                            type="button"
                            className="section-toggle"
                            onClick={handleSave}
                            disabled={isSaving}
                          >
                            {isSaving ? "保存中..." : "保存"}
                          </button>
                        </div>
                        {savedItems.length === 0 ? (
                          <div className="form-note">保存済みデータはまだありません。</div>
                        ) : (
                          <div className="saved-list">
                            {savedItems.map((item) => (
                              <div key={item.id} className="saved-item">
                                <div>
                                  <div className="saved-name">{item.name}</div>
                                  <div className="saved-meta">
                                    {item.createdAt ? item.createdAt.toLocaleDateString() : ""}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="section-toggle"
                                  onClick={() => handleLoad(item)}
                                >
                                  読み込み
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="form-note">ログインすると保存と読み込みが使えます。</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="account-menu" ref={accountMenuRef}>
              <button
                type="button"
                className="account-button"
                onClick={() => setAccountOpen((prev) => !prev)}
                aria-expanded={accountOpen}
                aria-controls="account-popover"
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="ユーザーアイコン" />
                ) : (
                  <UserCircle size={22} aria-hidden />
                )}
              </button>
              {accountOpen ? (
                <div className="account-popover" id="account-popover">
                  <div className="account-popover-head">
                    <span className="account-popover-title">アカウント</span>
                    <span className="breakdown-pill">Firebase</span>
                  </div>
                  <div className="account-body">
                    {user ? (
                      <div className="account-row">
                        <div>
                          <div className="account-name">{user.displayName ?? "ログイン中"}</div>
                          <div className="account-meta">{user.email ?? ""}</div>
                        </div>
                        <button type="button" className="section-toggle" onClick={handleLogout}>
                          ログアウト
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="section-toggle"
                          onClick={handleLogin}
                          disabled={!authReady}
                        >
                          Googleでログイン
                        </button>
                        <div className="form-note">
                          ログインすると保存と読み込みが使えます。
                        </div>
                      </>
                    )}
                    {authError ? <div className="auth-error">{authError}</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="step-bar">
        {[
          { id: 1, label: "URL入力" },
          { id: 2, label: "抽出確認" },
          { id: 3, label: "入力調整" },
          { id: 4, label: "結果を見る" },
        ].map((step) => (
          <div
            key={step.id}
            className={`step-item${currentStep === step.id ? " active" : ""}`}
          >
            <span className="step-index">Step {step.id}</span>
            <span className="step-text">{step.label}</span>
          </div>
        ))}
      </div>

      <div className="step-head">
        <span className="step-pill">Step 1</span>
        <span className="step-title">URL入力</span>
      </div>
      <div className={`top-import step-zone${currentStep === 1 ? " active" : ""}`}>
        <RakumachiImporter
          currentInput={inputData}
          onApply={handleImportApply}
          history={importHistory}
          selectedHistoryId={selectedImportId}
          onSelectHistory={handleImportSelect}
          onClearHistory={handleImportClear}
          highlightStep2={currentStep === 2}
          onResultChange={handleImportResultChange}
        />
      </div>

      <div className={`input-section step-zone${currentStep === 3 ? " active" : ""}`}>
        <div className="input-section-head">
          <span className="step-pill">Step 3</span>
          <span className="input-section-badge">ユーザー入力</span>
        </div>
        <div className="sheet-top">
          <SimulationForm
            key={formVersion}
            initialData={inputData}
            onCalculate={(data) => setInputData(data)}
            autoFilledKeys={autoFilledKeys}
            onFieldTouch={handleFieldTouch}
            listing={selectedImport?.listing ?? null}
            listingUrl={selectedImport?.url ?? null}
          />
        </div>
      </div>

      <div className="input-section-head output-section-head">
        <span className="step-pill">Step 4</span>
        <span className="input-section-badge">シミュレーション結果</span>
      </div>
      <section className={`sheet step-zone${currentStep === 4 ? " active" : ""}`} ref={resultsRef}>
        <div className="sheet-grid">
          <div className="sheet-sidebar">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleReorder(event, setLeftOrder)}
            >
              <SortableContext items={leftOrder} strategy={verticalListSortingStrategy}>
                {leftOrder.map((id) => (
                  <SortableCard key={id} id={id}>
                    {leftPanels[id]}
                  </SortableCard>
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div className="sheet-main">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleReorder(event, setRightOrder)}
            >
              <SortableContext items={rightOrder} strategy={verticalListSortingStrategy}>
                {rightOrder.map((id) => (
                  <SortableCard key={id} id={id}>
                    {rightPanels[id]}
                  </SortableCard>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </section>
    </main>
  );
}
