"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { ListingSummary } from "../components/ListingSummary";
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
  propertyTaxRate: 1.7,
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
  equityRatio: 0,
  loanAmount: 0,
  interestRate: 0,
  loanDuration: 0,
  monthlyRent: 0,
  occupancyRate: 0,
  rentDeclineRate: 0,
  unitCount: 0,
  cleaningVisitsPerMonth: 0,
  operatingExpenseRate: 0,
  oerMode: "SIMPLE",
  oerRateItems: [],
  oerFixedItems: [],
  oerEventItems: [],
  oerLeasingEnabled: true,
  oerLeasingMonths: 0,
  oerLeasingTenancyYears: 0,
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
  "kpi",
  "charts",
  "cashflow",
  "simulation",
  "exit",
  "deadcross",
  "scenario",
  "repayment",
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
const formatRatio = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : "-");
type KpiRisk = "good" | "warn" | "bad" | "neutral";
type KpiInfo = {
  title: string;
  summary: string;
  detail: string;
  formula?: string;
  threshold?: string;
};
const KPI_INFO: Record<string, KpiInfo> = {
  dscr: {
    title: "DSCR",
    summary:
      "物件が生む純収益（NOI）が年間元利返済額（ADS）をどれだけ余裕を持ってカバーできるかを示す、最重要の安全指標。",
    detail:
      "金融機関が最重視する指標の一つで、運営経費を過小評価すると実態より高く見えてしまいます。固定資産税・都市計画税、管理委託費、将来修繕の積立などを含めた“実質NOI”で評価するのが実務的です。1.30以上は理想水準、1.20前後は審査ライン、1.00〜1.10は警戒域で、軽微な空室や金利上昇で資金繰りが崩れやすくなります。",
    formula: "NOI / 年間元利返済額(ADS)",
    threshold: "1.30以上が安全圏",
  },
  dscrStress: {
    title: "DSCR（+1%）",
    summary: "金利が1%上昇した想定での返済余力。",
    detail:
      "低金利環境ではDSCRが高く見えがちですが、金利が1%上がるとADSが増えDSCRが急落することがあります。安全余裕を持たせるには、ストレス後でも1.0を割り込まない設計が望ましいです。",
    formula: "金利+1%時のNOI / ADS",
    threshold: "1.20以上が目安",
  },
  repaymentRatio: {
    title: "返済比率",
    summary: "満室時の年収（GPI）に対する年間返済額（ADS）の割合。",
    detail:
      "直感的な安全指標です。返済比率が60%になると、運営経費20%＋空室損10%を仮定しただけで残りが10%になり、突発修繕で赤字化しやすくなります。安全圏は45〜50%以下。",
    formula: "年間返済額(ADS) / 満室年収(GPI)",
    threshold: "50%以下が目安",
  },
  ber: {
    title: "損益分岐点入居率",
    summary: "赤字にならない最低限の入居率（空室耐性）。",
    detail:
      "運営経費＋返済が満室家賃の何%を占めるかを示します。80%以下なら空室が20〜30%でも耐えられる計算ですが、85%以上だと常時満室が前提となり危険度が高いです。",
    formula: "(運営経費+ADS) / 満室年収(GPI)",
    threshold: "80%以下が目安",
  },
  noiYield: {
    title: "実質利回り（NOI）",
    summary: "運営費を差し引いた後の実質利回り。",
    detail:
      "表面利回りではなく、運営コストを引いた収益力を見ます。分母は物件価格だけでなく諸経費込みの取得総額で評価するのが実務的です。",
    formula: "NOI / 取得総額",
    threshold: "金利+1.5〜2.0%を目安",
  },
  yieldGap: {
    title: "イールドギャップ",
    summary: "実質利回りと借入金利の差。",
    detail:
      "差が十分にプラスならレバレッジが効きます。ギャップが薄い、またはマイナスの場合は借入するほど投資効率が下がる“負のレバレッジ”になり得ます。",
    formula: "実質利回り - 金利",
    threshold: "+1.5%以上が目安",
  },
  ccrPreTax: {
    title: "CCR（税引前）",
    summary: "自己資金に対する税引前キャッシュフローの効率。",
    detail:
      "投下自己資金に対する年間手残りの効率性を示します。CCRを高めるための過度な借入はDSCRや返済比率を悪化させるため、安全性とのバランスが重要です。",
    formula: "税引前CF / 自己資金",
    threshold: "5〜10%が標準",
  },
  ccrPostTax: {
    title: "CCR（税引後）",
    summary: "税金を支払った後の自己資金効率。",
    detail:
      "税負担やデッドクロス影響を含めた実質的な効率を示します。税引前と比べて落ち込みが大きい場合は、節税設計や出口戦略の見直しが必要です。",
    formula: "税引後CF / 自己資金",
    threshold: "4〜8%が目安",
  },
  atcf: {
    title: "税引後CF（ATCF）",
    summary: "税金まで差し引いた年間の手残り。",
    detail:
      "税引前CFがプラスでも、税負担でマイナスになる場合があります。ATCFが赤字に転じる年がないかを確認することが重要です。",
    threshold: "0円以上が望ましい",
  },
  deadCross: {
    title: "デッドクロス",
    summary: "元金返済が減価償却費を上回るタイミング。",
    detail:
      "減価償却が減る一方、元金返済は経費にならないため税負担が増え、手残りが急に細くなります。到来年数を把握して出口や繰上返済の判断に使います。",
    threshold: "できるだけ遅い方が良い",
  },
};
type KpiInfoKey = keyof typeof KPI_INFO;
type TableRowInfo = {
  title: string;
  body: string;
  note?: string;
};
const TABLE_ROW_INFO: Record<string, TableRowInfo> = {
  家賃収入: {
    title: "家賃収入",
    body:
      "説明：その年に入ってくる賃料収入（入居率・家賃下落などを反映後）。\n影響：増えるほどCFが改善。入居率・賃料設定・空室モデルが主因です。",
  },
  元本返済: {
    title: "元本返済",
    body:
      "説明：ローン返済のうち「元金（借入残高が減る部分）」の支払額。\n影響：CF上はマイナス。ただし資産（自己資本）を積み上げる効果があります。",
  },
  借入利息: {
    title: "借入利息",
    body:
      "説明：ローン返済のうち「利息（金融機関に支払うコスト）」の支払額。\n影響：CFを直接圧迫。金利・借入額・残高（初期ほど大きい）で増減します。",
  },
  返済利息: {
    title: "返済利息",
    body:
      "説明：ローン返済のうち「利息（金融機関に支払うコスト）」の支払額。\n影響：CFを直接圧迫。金利・借入額・残高（初期ほど大きい）で増減します。",
  },
  "固定資産税・都市計画税": {
    title: "固定資産税・都市計画税",
    body:
      "説明：毎年発生する不動産の保有税（自治体に支払う税金）。\n影響：CFを下げる固定費。評価額・税率・住宅用地特例の有無で変わります。",
  },
  修繕費: {
    title: "修繕費",
    body:
      "説明：設備故障対応や原状回復、定期修繕などの費用（設定により積立/イベント含む）。\n影響：CFを下げます。築年数、修繕イベント設定、物件の品質でブレやすい項目です。",
  },
  不動産取得税: {
    title: "不動産取得税",
    body:
      "説明：購入後に一度だけ（または分割で）発生し得る税金。\n影響：発生年のCFを下げます。評価額・軽減の有無で変わります。",
  },
  管理費等経費: {
    title: "管理費等経費",
    body:
      "説明：管理委託料、清掃、共用部光熱、募集費（AD等）、保険など運営に必要な経費の合計。\n影響：増えるとNOIとCFが悪化。OER（運営経費率）や内訳設定が主因です。",
  },
  所得税: {
    title: "所得税",
    body:
      "説明：不動産所得に対して発生する税金（概算）。\n影響：CFを下げます。家賃収入−経費−減価償却など「課税所得」の計算結果で変動します。",
  },
  所得税概算: {
    title: "所得税概算",
    body:
      "説明：上の「所得概算」から計算した税額の目安。\n影響：税率や個人/法人の前提で変わります。正確には税理士・確定申告の計算に準拠します。",
  },
  減価償却費: {
    title: "減価償却費",
    body:
      "説明：建物・設備の価値を年数で費用化する会計上の経費（現金支出は伴わない）。\n影響：課税所得を下げやすく、所得税を抑える方向に働きます（ただしCFそのものは増えません）。",
  },
  経費計: {
    title: "経費計",
    body:
      "説明：運営費（管理・修繕・税など）＋必要に応じて取得税等を含む、その年の費用合計。\n影響：増えるとNOIとCFが悪化。内訳を見て「一時費用」か「恒常費用」か切り分けが重要です。",
  },
  所得概算: {
    title: "所得概算",
    body:
      "説明：不動産の「税務上の利益」の概算（収入−経費−減価償却 など）。\n影響：プラスが大きいほど課税が増え、マイナスなら損失（損益通算等は前提による）になります。",
  },
  "法人税(15/23%)": {
    title: "法人税(15/23%)",
    body:
      "法人所得の階層に応じた税率で算出した法人税等です。税額が増えるほどCFは悪化します。",
  },
  法人均等割: {
    title: "法人均等割",
    body: "赤字でも発生する法人住民税の均等割です。固定的にCFを下げます。",
  },
  支払計: {
    title: "支払計",
    body:
      "説明：その年に出ていく支払いの合計（税・経費・返済など）。\n影響：支払計が大きいほどCFが悪化。内訳のどこが増えているか確認が重要です。",
  },
  年度収支: {
    title: "年度収支",
    body:
      "説明：その年の最終的な手残り（概算CF）。\n影響：プラスなら現金が増え、マイナスなら持ち出し。家賃収入と返済・経費のバランスで決まります。",
  },
  売却手残り: {
    title: "売却手残り",
    body: "売却年に一度だけ計上される売却後の手残り額です。",
  },
  売却込み年度収支: {
    title: "売却込み年度収支",
    body: "年度収支に売却手残りを加えた年次キャッシュフローです。",
  },
  元金: {
    title: "元金",
    body:
      "説明：月々の返済のうち、借入残高が減る部分。\n影響：初期は小さく、時間とともに増える傾向（元利均等）。",
  },
  利息: {
    title: "利息",
    body:
      "説明：月々の返済のうち、金利コスト部分。\n影響：初期ほど大きく、残高が減るにつれ減少します。",
  },
  月額返済計: {
    title: "月額返済計",
    body:
      "説明：毎月の返済額（元金＋利息）。\n影響：CFに直接影響。金利・期間・借入額で決まります。",
  },
  "借入残高 (年末)": {
    title: "借入残高",
    body:
      "説明：年末時点で残っている借入元本。\n影響：翌年以降の利息計算のベース。残高が減るほど利息負担は軽くなります。",
  },
  借入残高: {
    title: "借入残高",
    body:
      "説明：その時点で残っているローン元本。\n影響：残高が大きいほど利息負担が重くなりやすい。元本返済が進むと徐々に減ります。",
  },
  年間返済額: {
    title: "年間返済額",
    body:
      "説明：その年の返済総額（元金＋利息）。\n影響：CFを押し下げる主要要因。金利上昇時に増えやすいです。",
  },
  年間返済元金: {
    title: "年間返済元金",
    body:
      "説明：その年に返した「元本」の合計。\n影響：CF上はマイナスですが、借入残高が減り、資産形成（自己資本増）に繋がります。",
  },
  年間返済利息: {
    title: "年間返済利息",
    body:
      "説明：その年に支払った「利息」の合計。\n影響：CFと収益性を直接悪化。金利上昇時に増えやすい項目です。",
  },
  年間返済計: {
    title: "年間返済計",
    body:
      "説明：元金＋利息の年間合計返済額。\n影響：返済が重いほどCFが悪化。期間を伸ばすと軽く、金利が上がると重くなります。",
  },
  "うち元金": {
    title: "うち元金",
    body:
      "説明：年間返済額のうち元本部分。\n影響：CFは減るが、残高を減らし自己資本を積み上げます。",
  },
  "うち利息": {
    title: "うち利息",
    body:
      "説明：年間返済額のうち利息部分。\n影響：純粋なコスト。金利が高いほど、初期ほど大きいです。",
  },
  返済比率: {
    title: "返済比率",
    body:
      "説明：収入に対して返済がどれくらい重いかを示す比率（ツール定義により「返済/家賃収入」等）。\n影響：高いほど返済負担が重く、CFが出にくい傾向。低いほど余裕が出ます。",
  },
  DSCR: {
    title: "DSCR",
    body:
      "説明：返済余裕を示す指標。一般に DSCR＝NOI ÷ 年間返済額。\n影響：1.0はギリギリ、1.2以上で安定寄り。高いほど銀行評価・耐久力が強いです。",
  },
  純利回り: {
    title: "純利回り",
    body:
      "説明：運営費等を差し引いた後の利回り（NOIベースの利回り）。\n影響：高いほど収益性が高い。空室・経費が増えると低下します。",
  },
  CCR: {
    title: "CCR",
    body:
      "説明：投入した自己資金に対して、年間CFがどれだけ出るか。\n一般に CCR＝年間税前CF ÷ 自己資金（頭金＋諸費用など）。\n影響：自己資金が少ないほど上がりやすい一方、リスク（耐性）が弱くなることがあります。",
  },
};
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
  const [hasViewedResults, setHasViewedResults] = useState(false);
  const [hasCompletedSteps, setHasCompletedSteps] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>(
    []
  );
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [pendingAiPromptId, setPendingAiPromptId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(1);
  const [activeKpiInfo, setActiveKpiInfo] = useState<KpiInfoKey | null>(null);
  const [activeTableInfo, setActiveTableInfo] = useState<string | null>(null);
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
  const aiMessagesRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [openSections, setOpenSections] = useState({
    kpi: true,
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
    setHasViewedResults(false);
    setHasCompletedSteps(false);
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
      if (payload.listing) {
        setPendingAiPromptId(id);
      }
    }
    setHasViewedResults(false);
    setHasCompletedSteps(false);
    setSelectedYear(1);
    setFormVersion((prev) => prev + 1);
  };

  const handleImportSelect = (id: string) => {
    const item = importHistory.find((entry) => entry.id === id);
    if (!item) return;
    setInputData(item.input);
    setAutoFilledKeys(item.autoFilled);
    setSelectedImportId(id);
    setHasViewedResults(false);
    setHasCompletedSteps(false);
    setSelectedYear(1);
    setFormVersion((prev) => prev + 1);
  };

  const handleImportClear = () => {
    setImportHistory([]);
    setSelectedImportId(null);
    setHasViewedResults(false);
    setHasCompletedSteps(false);
  };

  const handleImportResultChange = (hasResult: boolean) => {
    setHasImportResult(hasResult);
    if (!hasResult) {
      setHasViewedResults(false);
      setHasCompletedSteps(false);
    }
  };

  const selectedImport = useMemo(
    () => (selectedImportId ? importHistory.find((item) => item.id === selectedImportId) ?? null : null),
    [importHistory, selectedImportId]
  );

  const handleFieldTouch = (key: keyof PropertyInput) => {
    setAutoFilledKeys((prev) => prev.filter((item) => item !== key));
  };

  const currentStep = useMemo(() => {
    if (!hasImportResult) return 1;
    if (!hasViewedResults) return 2;
    return 3;
  }, [hasImportResult, hasViewedResults]);

  useEffect(() => {
    if (currentStep === 3) {
      setHasCompletedSteps(true);
    }
  }, [currentStep]);

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

  useEffect(() => {
    if (aiCollapsed) return;
    const container = aiMessagesRef.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [aiMessages, aiLoading, aiCollapsed]);

  const askAi = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || aiLoading) return;
    const nextMessages: { role: "user" | "assistant"; content: string }[] = [
      ...aiMessages,
      { role: "user", content: trimmed },
    ];
    const limitedMessages = nextMessages.slice(-10);
    setAiMessages(limitedMessages);
    setAiInput("");
    setAiError(null);
    setAiLoading(true);
    try {
      const response = await fetch("/api/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: aiSummary, messages: limitedMessages }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? "AIの回答取得に失敗しました。");
      }
      const message = typeof payload?.message === "string" ? payload.message : "";
      if (message) {
        const updatedMessages: { role: "user" | "assistant"; content: string }[] = [
          ...limitedMessages,
          { role: "assistant", content: message },
        ];
        setAiMessages(updatedMessages.slice(-10));
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AIの回答取得に失敗しました。");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskAi = (event: FormEvent) => {
    event.preventDefault();
    void askAi(aiInput);
  };

  useEffect(() => {
    if (!pendingAiPromptId) return;
    if (aiLoading) return;
    if (selectedImport?.id !== pendingAiPromptId) return;
    setPendingAiPromptId(null);
    void askAi(
      "この物件の全体的な評価をお願いします。また、立地や土地の価値、周辺相場と比べた家賃想定や表面利回りの妥当性も教えてください。"
    );
  }, [pendingAiPromptId, selectedImport, aiLoading, askAi]);

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
  const interestStressResults = useMemo(() => {
    const baseRate = Number.isFinite(inputData.interestRate) ? inputData.interestRate : 0;
    const nextRate = Math.max(0, baseRate + 1);
    return calculateSimulation({ ...inputData, interestRate: nextRate });
  }, [inputData]);
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
  const propertyTaxBase =
    landEvaluation * (inputData.landTaxReductionRate / 100) + buildingEvaluation;
  const fixedAssetTaxEstimate = Math.round(propertyTaxBase * 0.014);
  const cityPlanningTaxEstimate = Math.round(propertyTaxBase * 0.003);
  const propertyTaxEstimate = Math.round(
    propertyTaxBase * (inputData.propertyTaxRate / 100)
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

  const aiSummary = useMemo(() => {
    const windowResults = results.slice(0, Math.min(results.length, 10));
    const avgCashFlow =
      windowResults.length > 0
        ? Math.round(
            windowResults.reduce((sum, result) => sum + result.cashFlowPostTax, 0) /
              windowResults.length
          )
        : 0;
    const minCashFlow =
      results.length > 0
        ? Math.min(...results.map((result) => result.cashFlowPostTax))
        : 0;
    const deadCrossYears = results.filter((result) => result.isDeadCross).map((result) => result.year);
    const everyFiveYears = results
      .filter((result) => result.year === 1 || (result.year % 5 === 0 && result.year <= 30))
      .map((result) => ({
        year: result.year,
        income: result.income,
        expense: result.expense,
        propertyTax: result.propertyTax,
        repairCost: result.repairCost,
        loanPaymentTotal: result.loanPaymentTotal,
        loanInterest: result.loanInterest,
        loanPrincipal: result.loanPrincipal,
        loanBalance: result.loanBalance,
        depreciationBody: result.depreciationBody,
        depreciationEquipment: result.depreciationEquipment,
        depreciationTotal: result.depreciationTotal,
        taxableIncome: result.taxableIncome,
        taxAmount: result.taxAmount,
        cashFlowPreTax: result.cashFlowPreTax,
        cashFlowPostTax: result.cashFlowPostTax,
        acquisitionTax: result.acquisitionTax,
        isDeadCross: result.isDeadCross,
      }));
    const cashflowEveryFiveYears = everyFiveYears.map((result) => ({
      year: result.year,
      income: result.income,
      expense: result.expense,
      propertyTax: result.propertyTax,
      repairCost: result.repairCost,
      loanPaymentTotal: result.loanPaymentTotal,
      loanInterest: result.loanInterest,
      loanPrincipal: result.loanPrincipal,
      taxAmount: result.taxAmount,
      cashFlowPreTax: result.cashFlowPreTax,
      cashFlowPostTax: result.cashFlowPostTax,
      acquisitionTax: result.acquisitionTax,
      loanBalance: result.loanBalance,
      isDeadCross: result.isDeadCross,
    }));
    return {
      input: {
        price: inputData.price,
        loanAmount: inputData.loanAmount,
        interestRate: inputData.interestRate,
        loanDuration: inputData.loanDuration,
        monthlyRent: inputData.monthlyRent,
        occupancyRate: inputData.occupancyRate,
        rentDeclineRate: inputData.rentDeclineRate,
        operatingExpenseRate: inputData.operatingExpenseRate,
        structure: inputData.structure,
        buildingAge: inputData.buildingAge,
      },
      listing: selectedImport?.listing ?? null,
      listingUrl: selectedImport?.url ?? null,
      performance: {
        avgCashFlow,
        minCashFlow,
        deadCrossYears,
      },
      cashflowEveryFiveYears,
      simulationEveryFiveYears: everyFiveYears,
      exit: inputData.exitEnabled
        ? {
            exitYear,
            exitCapRate: inputData.exitCapRate,
            netProceeds: exitNetProceeds,
            irr: exitIrr,
            npv: exitNpv,
            equityMultiple: baseEquityMultiple,
          }
        : null,
    };
  }, [
    results,
    inputData,
    selectedImport,
    exitYear,
    exitNetProceeds,
    exitIrr,
    exitNpv,
    baseEquityMultiple,
  ]);

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
  const kpiResult = selectedResult ?? results[0];
  const kpiYear = kpiResult?.year ?? 1;
  const kpiStressResult = interestStressResults.find((result) => result.year === kpiYear);
  const calcNoi = (result?: YearlyResult) =>
    result
      ? result.income - result.expense - result.propertyTax - result.repairCost
      : Number.NaN;
  const calcOpex = (result?: YearlyResult) =>
    result ? result.expense + result.propertyTax + result.repairCost : Number.NaN;
  const kpiNoi = calcNoi(kpiResult);
  const kpiOpex = calcOpex(kpiResult);
  const kpiGpi = kpiResult?.grossPotentialRent ?? Number.NaN;
  const kpiAds = kpiResult?.loanPaymentTotal ?? Number.NaN;
  const kpiDscr = kpiAds > 0 ? kpiNoi / kpiAds : Number.NaN;
  const kpiDscrStress =
    kpiStressResult && kpiStressResult.loanPaymentTotal > 0
      ? calcNoi(kpiStressResult) / kpiStressResult.loanPaymentTotal
      : Number.NaN;
  const kpiRepaymentRatio = kpiGpi > 0 ? (kpiAds / kpiGpi) * 100 : Number.NaN;
  const kpiBer = kpiGpi > 0 ? ((kpiOpex + kpiAds) / kpiGpi) * 100 : Number.NaN;
  const kpiNoiYield = totalPrice > 0 ? (kpiNoi / totalPrice) * 100 : Number.NaN;
  const kpiYieldGap = Number.isFinite(kpiNoiYield)
    ? kpiNoiYield - inputData.interestRate
    : Number.NaN;
  const kpiCcrPreTax = equity > 0 ? (kpiResult.cashFlowPreTax / equity) * 100 : Number.NaN;
  const kpiCcrPostTax = equity > 0 ? (kpiResult.cashFlowPostTax / equity) * 100 : Number.NaN;
  const kpiAtcf = kpiResult.cashFlowPostTax;
  const kpiDeadCrossLabel = firstDeadCrossYear ? `${firstDeadCrossYear}年目` : "なし";
  const getRiskByThreshold = (
    value: number,
    goodThreshold: number,
    warnThreshold: number,
    inverse = false
  ): KpiRisk => {
    if (!Number.isFinite(value)) return "neutral";
    if (!inverse) {
      if (value >= goodThreshold) return "good";
      if (value >= warnThreshold) return "warn";
      return "bad";
    }
    if (value <= goodThreshold) return "good";
    if (value <= warnThreshold) return "warn";
    return "bad";
  };
  const getRiskByZero = (value: number): KpiRisk => {
    if (!Number.isFinite(value)) return "neutral";
    return value >= 0 ? "good" : "bad";
  };
  const kpiItems: {
    id: KpiInfoKey;
    label: string;
    value: number | string;
    format: "yen" | "percent" | "ratio" | "text";
    note?: string;
    risk: KpiRisk;
  }[] = [
    {
      id: "dscr",
      label: "DSCR",
      value: kpiDscr,
      format: "ratio",
      note: "目安: 1.20+",
      risk: getRiskByThreshold(kpiDscr, 1.3, 1.2),
    },
    {
      id: "dscrStress",
      label: "DSCR（+1%）",
      value: kpiDscrStress,
      format: "ratio",
      note: "金利+1%",
      risk: getRiskByThreshold(kpiDscrStress, 1.2, 1.0),
    },
    {
      id: "repaymentRatio",
      label: "返済比率",
      value: kpiRepaymentRatio,
      format: "percent",
      note: "目安: 50%以下",
      risk: getRiskByThreshold(kpiRepaymentRatio, 45, 55, true),
    },
    {
      id: "ber",
      label: "損益分岐点入居率",
      value: kpiBer,
      format: "percent",
      note: "目安: 80%以下",
      risk: getRiskByThreshold(kpiBer, 80, 85, true),
    },
    {
      id: "noiYield",
      label: "実質利回り（NOI）",
      value: kpiNoiYield,
      format: "percent",
      risk: getRiskByThreshold(kpiNoiYield, 5, 3.5),
    },
    {
      id: "yieldGap",
      label: "イールドギャップ",
      value: kpiYieldGap,
      format: "percent",
      note: "目安: +1.5%",
      risk: getRiskByThreshold(kpiYieldGap, 2, 1),
    },
    {
      id: "ccrPreTax",
      label: "CCR（税引前）",
      value: kpiCcrPreTax,
      format: "percent",
      risk: getRiskByThreshold(kpiCcrPreTax, 10, 5),
    },
    {
      id: "ccrPostTax",
      label: "CCR（税引後）",
      value: kpiCcrPostTax,
      format: "percent",
      risk: getRiskByThreshold(kpiCcrPostTax, 8, 4),
    },
    {
      id: "atcf",
      label: "税引後CF（ATCF）",
      value: kpiAtcf,
      format: "yen",
      risk: getRiskByZero(kpiAtcf),
    },
    {
      id: "deadCross",
      label: "デッドクロス",
      value: kpiDeadCrossLabel,
      format: "text",
      risk: firstDeadCrossYear ? "warn" : "good",
    },
  ];
  const riskScoreMap: Record<KpiRisk, number> = {
    good: 100,
    warn: 60,
    bad: 20,
    neutral: 50,
  };
  const handleKpiInfoToggle = (id: KpiInfoKey) => {
    setActiveKpiInfo((prev) => (prev === id ? null : id));
  };
  const handleTableInfoToggle = (id: string) => {
    setActiveTableInfo((prev) => (prev === id ? null : id));
  };
  const renderTableRowTitle = (label: string, infoKey?: string) => {
    const key = infoKey ?? label;
    const info = TABLE_ROW_INFO[key];
    if (!info) return label;
    return (
      <span className="row-title-content">
        <span>{label}</span>
        <span className="input-info">
          <button
            type="button"
            className="input-info-btn"
            onClick={(event) => {
              event.stopPropagation();
              handleTableInfoToggle(key);
            }}
            aria-label={`${label}の説明`}
            aria-expanded={activeTableInfo === key}
          >
            i
          </button>
          {activeTableInfo === key ? (
            <div className="input-info-popover">
              <div className="input-info-title">{info.title}</div>
              <p className="input-info-text">{info.body}</p>
              {info.note ? <div className="input-info-note">{info.note}</div> : null}
            </div>
          ) : null}
        </span>
      </span>
    );
  };
  const scoreCandidates: KpiRisk[] = [
    kpiItems[0].risk,
    kpiItems[1].risk,
    kpiItems[2].risk,
    kpiItems[3].risk,
    kpiItems[5].risk,
    kpiItems[7].risk,
    kpiItems[8].risk,
    kpiItems[9].risk,
  ];
  const safetyScore =
    scoreCandidates.length > 0
      ? Math.round(
          scoreCandidates.reduce((sum, risk) => sum + riskScoreMap[risk], 0) /
            scoreCandidates.length
        )
      : 0;
  const safetyTone: KpiRisk =
    safetyScore >= 80 ? "good" : safetyScore >= 60 ? "warn" : "bad";
  const renderKpiValue = (item: (typeof kpiItems)[number]) => {
    if (item.format === "text") {
      return item.value as string;
    }
    if (!Number.isFinite(item.value as number)) {
      return "-";
    }
    const numeric = item.value as number;
    if (item.format === "yen") return formatYen(numeric);
    if (item.format === "ratio") return formatRatio(numeric);
    return formatPercent(numeric);
  };
  const isCorporateTax = inputData.taxType === "CORPORATE";
  const corporateMinimumTax = Math.max(0, inputData.corporateMinimumTax || 0);
  const getCorporateTax = (result: YearlyResult) =>
    Math.max(0, result.taxAmount - corporateMinimumTax);
  const taxRows: TableRow[] = isCorporateTax
    ? [
        {
          label: "法人税(15/23%)",
          value: (r: YearlyResult) => getCorporateTax(r),
          outflow: true,
          tone: "negative",
        },
        {
          label: "法人均等割",
          value: () => corporateMinimumTax,
          outflow: true,
          tone: "negative",
        },
      ]
    : [
        {
          label: "所得税概算",
          value: (r: YearlyResult) => r.taxAmount,
          outflow: true,
          tone: "negative",
        },
      ];

  const tableSections: TableSection[] = [
    {
      title: "収入・支出",
      rows: [
        { label: "家賃収入", value: (r: YearlyResult) => r.income },
        { label: "減価償却費", value: (r: YearlyResult) => r.depreciationTotal },
        {
          label: "固定資産税・都市計画税",
          value: (r: YearlyResult) => r.propertyTax,
          outflow: true,
          tone: "negative",
        },
        { label: "修繕費", value: (r: YearlyResult) => r.repairCost, outflow: true, tone: "negative" },
        { label: "管理費等経費", value: (r: YearlyResult) => r.expense, outflow: true, tone: "negative" },
        { label: "返済利息", value: (r: YearlyResult) => r.loanInterest, outflow: true, tone: "subtle" },
        {
          label: "経費計",
          value: (r: YearlyResult) =>
            r.depreciationTotal + r.propertyTax + r.repairCost + r.expense + r.loanInterest,
          outflow: true,
          tone: "highlight",
        },
        { label: "所得概算", value: (r: YearlyResult) => r.taxableIncome, tone: "highlight" },
        ...taxRows,
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
          <h3 className="breakdown-title">固定資産税・都市計画税計算用</h3>
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
                  <td className="label">固定資産税・都市計画税概算額</td>
                  <td className="value calc total">{formatYen(propertyTaxEstimate)}</td>
                </tr>
                <tr>
                  <td className="label">固定資産税 (1.4%)</td>
                  <td className="value calc">{formatYen(fixedAssetTaxEstimate)}</td>
                </tr>
                <tr>
                  <td className="label">都市計画税 (0.3%)</td>
                  <td className="value calc">{formatYen(cityPlanningTaxEstimate)}</td>
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
    kpi: (
      <div className="sheet-card kpi-card">
        <div className="table-head">
          <h2 className="table-title">投資KPIダッシュボード</h2>
          <div className="table-actions">
            <div className="table-controls">
              <span className={`kpi-score kpi-score-${safetyTone}`}>
                安全スコア {safetyScore}
              </span>
              <label className="kpi-select">
                <span>対象年</span>
                <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                  {results.map((result) => (
                    <option key={`kpi-year-${result.year}`} value={result.year}>
                      {result.year}年目
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection("kpi")}
              aria-expanded={openSections.kpi}
            >
              {openSections.kpi ? "▼ 閉じる" : "▶ 開く"}
            </button>
          </div>
        </div>
        {openSections.kpi ? (
          <div className="kpi-grid">
            {kpiItems.map((item) => {
              const info = KPI_INFO[item.id];
              return (
                <div key={item.label} className={`kpi-item kpi-risk-${item.risk}`}>
                  <div className="kpi-label-row">
                    <span className="kpi-label">{item.label}</span>
                    <button
                      type="button"
                      className="kpi-info-btn"
                      onClick={() => handleKpiInfoToggle(item.id)}
                      aria-expanded={activeKpiInfo === item.id}
                      aria-label={`${item.label}の説明`}
                    >
                      i
                    </button>
                  </div>
                  <span className={`kpi-value kpi-value-${item.risk}`}>
                    {renderKpiValue(item)}
                  </span>
                  {item.note ? <span className="kpi-note">{item.note}</span> : null}
                  {activeKpiInfo === item.id ? (
                    <div className="kpi-popover">
                      <div className="kpi-popover-title">{info.title}</div>
                      <p className="kpi-popover-text">{info.summary}</p>
                      {info.formula ? (
                        <div className="kpi-popover-note">式: {info.formula}</div>
                      ) : null}
                      {info.threshold ? (
                        <div className="kpi-popover-note">目安: {info.threshold}</div>
                      ) : null}
                      <p className="kpi-popover-detail">{info.detail}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    ),
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
                    <td className="row-title">{renderTableRowTitle("家賃収入")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-income-${result.year}`} className="cell highlight">
                        {formatCell(result.income)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("元本返済")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("借入利息")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">
                      {renderTableRowTitle("固定資産税・都市計画税")}
                    </td>
                    {visibleResults.map((result) => (
                      <td key={`cf-tax-${result.year}`} className="cell">
                        {formatCell(result.propertyTax, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("修繕費")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-repair-${result.year}`} className="cell">
                        {formatCell(result.repairCost, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("不動産取得税")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-acq-tax-${result.year}`} className="cell">
                        {formatCell(result.acquisitionTax, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("管理費等経費")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-expense-${result.year}`} className="cell">
                        {formatCell(result.expense, true)}
                      </td>
                    ))}
                  </tr>
                  {isCorporateTax ? (
                    <>
                      <tr>
                        <td className="row-title">{renderTableRowTitle("法人税(15/23%)")}</td>
                        {visibleResults.map((result) => (
                          <td key={`cf-corp-tax-${result.year}`} className="cell">
                            {formatCell(getCorporateTax(result), true)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="row-title">{renderTableRowTitle("法人均等割")}</td>
                        {visibleResults.map((result) => (
                          <td key={`cf-corp-min-${result.year}`} className="cell">
                            {formatCell(corporateMinimumTax, true)}
                          </td>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td className="row-title">{renderTableRowTitle("所得税")}</td>
                      {visibleResults.map((result) => (
                        <td key={`cf-income-tax-${result.year}`} className="cell">
                          {formatCell(result.taxAmount, true)}
                        </td>
                      ))}
                    </tr>
                  )}
                  {inputData.exitEnabled ? (
                    <tr>
                      <td className="row-title">{renderTableRowTitle("売却手残り")}</td>
                      {visibleResults.map((result) => (
                        <td key={`cf-exit-${result.year}`} className="cell highlight">
                          {formatCell(result.year === exitYear ? exitNetProceeds : 0)}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                  <tr className="row-highlight">
                    <td className="row-title">{renderTableRowTitle("支払計")}</td>
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
                    <td className="row-title">{renderTableRowTitle("年度収支")}</td>
                    {visibleResults.map((result) => (
                      <td key={`cf-net-${result.year}`} className="cell highlight-strong">
                        {formatCell(result.cashFlowPostTax)}
                      </td>
                    ))}
                  </tr>
                  {inputData.exitEnabled ? (
                    <tr className="row-highlight">
                      <td className="row-title">
                        {renderTableRowTitle("売却込み年度収支")}
                      </td>
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
                        <td className="row-title">{renderTableRowTitle(row.label)}</td>
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
                    <td className="row-title">{renderTableRowTitle("元金")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("利息")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`monthly-interest-${result.year}`} className="cell">
                        {formatCell(result.loanInterest / 12)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("月額返済計")}</td>
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
                    <td className="row-title">
                      {renderTableRowTitle("借入残高 (年末)")}
                    </td>
                    {visibleLoanResults.map((result) => (
                      <td key={`balance-${result.year}`} className="cell">
                        {formatCell(result.loanBalance)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("年間返済額")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-payment-${result.year}`} className="cell highlight">
                        {formatCell(result.loanPaymentTotal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("うち元金")}</td>
                    {visibleLoanResults.map((result) => (
                      <td key={`annual-principal-${result.year}`} className="cell">
                        {formatCell(result.loanPrincipal, true)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-title">{renderTableRowTitle("うち利息")}</td>
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
                    <span className="detail-label">固定資産税・都市計画税</span>
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
                  {isCorporateTax ? (
                    <>
                      <div className="detail-item">
                        <span className="detail-label">法人税</span>
                        <span className="detail-value">
                          {formatYen(getCorporateTax(selectedResult))}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">法人均等割</span>
                        <span className="detail-value">
                          {formatYen(corporateMinimumTax)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="detail-item">
                      <span className="detail-label">税額</span>
                      <span className="detail-value">{formatYen(selectedResult.taxAmount)}</span>
                    </div>
                  )}
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

      <div className="app-body">
        <div className="app-main">
          <div className="step-bar">
            {[
              { id: 1, label: "URL入力" },
              { id: 2, label: "入力調整" },
              { id: 3, label: "結果を見る" },
            ].map((step) => (
              <div
                key={step.id}
                className={`step-item${currentStep === step.id ? " active" : ""}${
                  currentStep === step.id && (step.id === 3 || hasCompletedSteps)
                    ? " no-pulse"
                    : ""
                }`}
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
          <div
            className={`top-import step-zone${
              !hasCompletedSteps && currentStep === 1 ? " active" : ""
            }`}
          >
            <RakumachiImporter
              currentInput={inputData}
              onApply={handleImportApply}
              history={importHistory}
              selectedHistoryId={selectedImportId}
              onSelectHistory={handleImportSelect}
              onClearHistory={handleImportClear}
              onResultChange={handleImportResultChange}
            />
          </div>

          {selectedImport?.listing ? (
            <>
              <div className="step-head">
                <span className="step-pill">Step 1.5</span>
                <span className="step-title">取得した物件情報</span>
              </div>
              <div className="listing-section step-zone">
                <ListingSummary
                  listing={selectedImport.listing}
                  listingUrl={selectedImport.url}
                />
              </div>
            </>
          ) : null}

          <div
            className={`input-section step-zone${
              !hasCompletedSteps && currentStep === 2 ? " active" : ""
            }`}
          >
            <div className="input-section-head">
              <span className="step-pill">Step 2</span>
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
              />
            </div>
          </div>

          <div className="input-section-head output-section-head">
            <span className="step-pill">Step 3</span>
            <span className="input-section-badge">シミュレーション結果</span>
          </div>
          <section className="sheet" ref={resultsRef}>
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
        </div>

        <aside className="app-aside" aria-label="AIチャット">
          <div className={`ai-panel${aiCollapsed ? " is-collapsed" : ""}`}>
            <div className="ai-head">
              <h3 className="table-title">AIチャット</h3>
              <div className="ai-head-actions">
                {aiLoading ? <span className="ai-status">生成中...</span> : null}
                <button
                  type="button"
                  className="section-toggle"
                  onClick={() => setAiCollapsed((prev) => !prev)}
                  aria-expanded={!aiCollapsed}
                >
                  {aiCollapsed ? "▶ 開く" : "▼ 閉じる"}
                </button>
              </div>
            </div>
            {!aiCollapsed ? (
              <>
                <div className="ai-messages" ref={aiMessagesRef}>
                  {aiMessages.length === 0 && !aiLoading ? (
                    <div className="form-note">
                      質問を入力してください。Step4到達後の結果を含めて回答します。
                    </div>
                  ) : null}
                  {aiMessages.map((message, index) =>
                    message.role === "user" ? (
                      <div key={`user-${index}`} className="ai-message user">
                        {message.content}
                      </div>
                    ) : (
                      <div key={`assistant-${index}`} className="ai-response">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )
                  )}
                  {aiLoading ? (
                    <div className="ai-typing" role="status" aria-live="polite">
                      <span>AIが考えています</span>
                      <span className="ai-typing-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  ) : null}
                </div>
                {aiError ? <div className="auth-error">{aiError}</div> : null}
                <form className="ai-input-row" onSubmit={handleAskAi}>
                  <input
                    type="text"
                    placeholder="AIに質問する"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    disabled={aiLoading}
                  />
                  <button type="submit" className="section-toggle" disabled={aiLoading}>
                    送信
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
