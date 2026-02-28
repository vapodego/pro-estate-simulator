import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LatLng = { lat: number; lng: number };

type GeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
  }>;
};

type GeocodeResult = NonNullable<GeocodeResponse["results"]>[number];
type GeocodeAddressComponents = GeocodeResult["address_components"];

type EstatTableInfo = {
  statsDataId: string;
  title: string;
};

type EstatClassItem = {
  code: string;
  name: string;
};

type EstatClassObj = {
  id: string;
  name: string;
  classes: EstatClassItem[];
};

type StationRidershipItem = {
  name: string;
  operator: string | null;
  line: string | null;
  lat: number | null;
  lng: number | null;
  yearly: Record<string, number | null>;
};

type StationRidershipDataset = {
  items: StationRidershipItem[];
};

const GOOGLE_MAPS_API_BASE = "https://maps.googleapis.com/maps/api";
const ESTAT_API_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json";
const STATION_DATA_FILE = path.join(process.cwd(), "utils", "s12_station_ridership.json");

let stationDatasetPromise: Promise<StationRidershipItem[]> | null = null;

const mapServiceError = (status: string, message?: string) =>
  `${status}${message ? `: ${message}` : ""}`;

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.text();
  let parsed: unknown = {};
  try {
    parsed = body ? (JSON.parse(body) as unknown) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message?: string }).message ?? "")
        : body;
    throw new Error(`HTTP ${response.status}${message ? `: ${message}` : ""}`);
  }
  return parsed as T;
};

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const unwrapText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$ === "string") return obj.$;
  }
  return "";
};

const normalizeText = (value: string) =>
  value.replace(/\s+/g, "").replace(/　/g, "").trim();

const toHalfWidthDigits = (value: string) =>
  value.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

const normalizeStationName = (value: string) =>
  normalizeText(value).replace(/駅$/, "");

const formatNumber = (value: number | null) =>
  value === null || !Number.isFinite(value) ? "-" : new Intl.NumberFormat("ja-JP").format(value);

const toSignedPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "(-%)";
  const rounded = Math.round(value * 10) / 10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return `(${normalized >= 0 ? "+" : ""}${normalized.toFixed(1)}%)`;
};

const haversineMeters = (a: LatLng, b: LatLng) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const t =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(t), Math.sqrt(1 - t));
};

const loadStationDataset = async () => {
  if (!stationDatasetPromise) {
    stationDatasetPromise = fs
      .readFile(STATION_DATA_FILE, "utf-8")
      .then((raw) => JSON.parse(raw) as StationRidershipDataset)
      .then((json) => json.items ?? []);
  }
  return stationDatasetPromise;
};

const getAddressComponent = (
  components: GeocodeAddressComponents | undefined,
  type: string
) => components?.find((component) => component.types?.includes(type))?.long_name ?? null;

const resolveMunicipality = (components: GeocodeAddressComponents | undefined) => {
  const prefecture = getAddressComponent(components, "administrative_area_level_1");
  const locality =
    getAddressComponent(components, "locality") ??
    getAddressComponent(components, "administrative_area_level_2");
  const ward =
    getAddressComponent(components, "sublocality_level_1") ??
    getAddressComponent(components, "administrative_area_level_3");
  if (locality && ward && !locality.endsWith("区") && !ward.startsWith(locality)) {
    return { prefecture, municipality: `${locality}${ward}`, city: locality, ward };
  }
  return { prefecture, municipality: locality ?? ward, city: locality, ward };
};

const extractEstatStatus = (json: unknown): string | null => {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const topKey = Object.keys(root).find((key) => key.startsWith("GET_"));
  if (!topKey) return null;
  const top = root[topKey] as Record<string, unknown> | undefined;
  if (!top) return null;
  const resultInf =
    (top.RESULT_INF as Record<string, unknown> | undefined) ??
    (top.RESULT as Record<string, unknown> | undefined);
  const status = resultInf?.STATUS;
  return typeof status === "string" ? status : null;
};

const extractEstatError = (json: unknown): string | null => {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const topKey = Object.keys(root).find((key) => key.startsWith("GET_"));
  if (!topKey) return null;
  const top = root[topKey] as Record<string, unknown> | undefined;
  if (!top) return null;
  const resultInf =
    (top.RESULT_INF as Record<string, unknown> | undefined) ??
    (top.RESULT as Record<string, unknown> | undefined);
  const errorMsg = resultInf?.ERROR_MSG;
  if (typeof errorMsg === "string") return errorMsg;
  if (errorMsg && typeof errorMsg === "object") {
    return unwrapText(errorMsg);
  }
  return null;
};

const ensureEstatOk = (json: unknown) => {
  const status = extractEstatStatus(json);
  if (!status || status === "0") return;
  const message = extractEstatError(json);
  throw new Error(`e-Stat API error ${status}${message ? `: ${message}` : ""}`);
};

const fetchEstatStatsList = async (params: {
  appId: string;
  searchWord?: string;
  statsCode?: string;
  limit?: number;
}) => {
  const url = new URL(`${ESTAT_API_BASE}/getStatsList`);
  url.searchParams.set("appId", params.appId);
  if (params.searchWord !== undefined) {
    url.searchParams.set("searchWord", params.searchWord);
  }
  if (params.statsCode) {
    url.searchParams.set("statsCode", params.statsCode);
  }
  url.searchParams.set("limit", String(params.limit ?? 500));
  const data = await fetchJson<unknown>(url.toString());
  ensureEstatOk(data);

  const root = (data as Record<string, unknown>).GET_STATS_LIST as
    | Record<string, unknown>
    | undefined;
  const listInf = root?.DATALIST_INF as Record<string, unknown> | undefined;
  const tableRaw = listInf?.TABLE_INF;
  const tables = toArray(tableRaw).map((raw) => {
    const table = raw as Record<string, unknown>;
    return {
      statsDataId:
        unwrapText(table["@id"]) ||
        unwrapText(table["ID"]) ||
        unwrapText(table["STAT_ID"]),
      title: unwrapText(table["TITLE"]) || unwrapText(table["STAT_NAME"]),
    } satisfies EstatTableInfo;
  });
  return tables.filter((item) => item.statsDataId && item.title);
};

const fetchEstatMeta = async (appId: string, statsDataId: string) => {
  const url = new URL(`${ESTAT_API_BASE}/getMetaInfo`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("statsDataId", statsDataId);
  const data = await fetchJson<unknown>(url.toString());
  ensureEstatOk(data);

  const root = (data as Record<string, unknown>).GET_META_INFO as
    | Record<string, unknown>
    | undefined;
  const metadataInf = root?.METADATA_INF as Record<string, unknown> | undefined;
  const classInf = metadataInf?.CLASS_INF as Record<string, unknown> | undefined;
  const classObjRaw = classInf?.CLASS_OBJ;
  return toArray(classObjRaw).map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      id: unwrapText(item["@id"]),
      name: unwrapText(item["@name"]),
      classes: toArray(item.CLASS).map((clsRaw) => {
        const cls = clsRaw as Record<string, unknown>;
        return {
          code: unwrapText(cls["@code"]),
          name: unwrapText(cls["@name"]),
        };
      }),
    } satisfies EstatClassObj;
  });
};

const fetchEstatDataValues = async (params: {
  appId: string;
  statsDataId: string;
  areaClassId: string;
  areaCode: string;
  metricClassId: string;
  metricCode: string;
  extraFilters?: Array<{ classId: string; code: string }>;
}) => {
  const url = new URL(`${ESTAT_API_BASE}/getStatsData`);
  url.searchParams.set("appId", params.appId);
  url.searchParams.set("statsDataId", params.statsDataId);
  url.searchParams.set("metaGetFlg", "N");
  url.searchParams.set("cntGetFlg", "N");
  url.searchParams.set(
    `cd${params.areaClassId.charAt(0).toUpperCase()}${params.areaClassId.slice(1)}`,
    params.areaCode
  );
  url.searchParams.set(
    `cd${params.metricClassId.charAt(0).toUpperCase()}${params.metricClassId.slice(1)}`,
    params.metricCode
  );
  params.extraFilters?.forEach((filter) => {
    url.searchParams.set(
      `cd${filter.classId.charAt(0).toUpperCase()}${filter.classId.slice(1)}`,
      filter.code
    );
  });

  const data = await fetchJson<unknown>(url.toString());
  ensureEstatOk(data);
  const root = (data as Record<string, unknown>).GET_STATS_DATA as
    | Record<string, unknown>
    | undefined;
  const statData = root?.STATISTICAL_DATA as Record<string, unknown> | undefined;
  const dataInf = statData?.DATA_INF as Record<string, unknown> | undefined;
  return toArray(dataInf?.VALUE).map((item) => item as Record<string, unknown>);
};

type KnownSeriesMetricConfig = {
  year: number;
  statsDataId: string;
  metricClassId: string;
  metricCode: string;
  extraFilters?: Array<{ classId: string; code: string }>;
};

const KNOWN_POPULATION_SERIES_CONFIGS: KnownSeriesMetricConfig[] = [
  { year: 1995, statsDataId: "0000032052", metricClassId: "cat01", metricCode: "001" },
  { year: 2000, statsDataId: "0000032805", metricClassId: "cat01", metricCode: "001" },
  { year: 2005, statsDataId: "0003408216", metricClassId: "cat01", metricCode: "100" },
  { year: 2010, statsDataId: "0003148500", metricClassId: "tab", metricCode: "106", extraFilters: [{ classId: "cat01", code: "00710" }] },
  { year: 2015, statsDataId: "0003148500", metricClassId: "tab", metricCode: "020", extraFilters: [{ classId: "cat01", code: "00710" }] },
  { year: 2020, statsDataId: "0003445078", metricClassId: "tab", metricCode: "2020_01", extraFilters: [{ classId: "cat01", code: "0" }] },
];

const KNOWN_HOUSEHOLD_SERIES_CONFIGS: KnownSeriesMetricConfig[] = [
  { year: 1995, statsDataId: "0000032052", metricClassId: "cat01", metricCode: "008" },
  { year: 2000, statsDataId: "0000032805", metricClassId: "cat01", metricCode: "008" },
  { year: 2005, statsDataId: "0003408216", metricClassId: "cat01", metricCode: "260" },
  { year: 2010, statsDataId: "0003148500", metricClassId: "tab", metricCode: "110", extraFilters: [{ classId: "cat01", code: "00710" }] },
  { year: 2015, statsDataId: "0003148500", metricClassId: "tab", metricCode: "109", extraFilters: [{ classId: "cat01", code: "00710" }] },
  { year: 2020, statsDataId: "0003445098", metricClassId: "tab", metricCode: "2020_13", extraFilters: [{ classId: "cat01", code: "0" }] },
];

const parseNumericValue = (value: string) => {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const resolveAreaCodeFromClassObjs = (
  classObjs: EstatClassObj[],
  nameCandidates: string[]
) => {
  const matched: Array<{ classId: string; areaCode: string; isAreaLike: boolean }> = [];
  classObjs.forEach((obj) => {
    obj.classes.forEach((item) => {
      const normalized = normalizeText(item.name);
      const found = nameCandidates.some(
        (candidate) => normalized === candidate || normalized.includes(candidate)
      );
      if (!found) return;
      const isAreaLike =
        obj.id.toLowerCase().includes("area") ||
        normalizeText(obj.name).includes("地域") ||
        normalizeText(obj.name).includes("市区町村");
      matched.push({ classId: obj.id, areaCode: item.code, isAreaLike });
    });
  });
  if (!matched.length) return null;
  return (
    matched.find((item) => item.isAreaLike) ?? matched[0]
  );
};

const mergeKnownSeriesFromEstat = async (params: {
  appId: string;
  prefecture: string;
  municipality: string;
  city: string | null;
  ward: string | null;
  populationByYear: Map<number, number>;
  householdByYear: Map<number, number>;
}) => {
  const nameCandidates = [
    params.municipality,
    params.city ? `${params.city}${params.ward ?? ""}` : null,
    params.city,
    params.ward,
  ]
    .filter((item): item is string => !!item)
    .map((item) => normalizeText(item));

  const areaCache = new Map<string, { classId: string; areaCode: string } | null>();
  const resolveArea = async (statsDataId: string) => {
    if (areaCache.has(statsDataId)) return areaCache.get(statsDataId) ?? null;
    try {
      const classObjs = await fetchEstatMeta(params.appId, statsDataId);
      const matched = resolveAreaCodeFromClassObjs(classObjs, nameCandidates);
      const resolved = matched
        ? { classId: matched.classId, areaCode: matched.areaCode }
        : null;
      areaCache.set(statsDataId, resolved);
      return resolved;
    } catch {
      areaCache.set(statsDataId, null);
      return null;
    }
  };

  const fetchValueByConfig = async (config: KnownSeriesMetricConfig) => {
    const area = await resolveArea(config.statsDataId);
    if (!area) return null;
    try {
      const values = await fetchEstatDataValues({
        appId: params.appId,
        statsDataId: config.statsDataId,
        areaClassId: area.classId,
        areaCode: area.areaCode,
        metricClassId: config.metricClassId,
        metricCode: config.metricCode,
        extraFilters: config.extraFilters,
      });
      for (const value of values) {
        const raw = unwrapText(value["$"]);
        const numeric = parseNumericValue(raw);
        if (numeric !== null) return numeric;
      }
      return null;
    } catch {
      return null;
    }
  };

  for (const config of KNOWN_POPULATION_SERIES_CONFIGS) {
    if (params.populationByYear.has(config.year)) continue;
    const value = await fetchValueByConfig(config);
    if (value !== null) params.populationByYear.set(config.year, value);
  }

  for (const config of KNOWN_HOUSEHOLD_SERIES_CONFIGS) {
    if (params.householdByYear.has(config.year)) continue;
    const value = await fetchValueByConfig(config);
    if (value !== null) params.householdByYear.set(config.year, value);
  }
};

const buildPopulationForecastSeries = (populationSeries: Array<{ year: number; value: number }>) => {
  if (populationSeries.length < 2) return [] as Array<{ year: number; value: number; delta: number | null }>;
  const sorted = [...populationSeries].sort((a, b) => a.year - b.year);
  const latest = sorted[sorted.length - 1];
  const baselineCandidates = sorted.filter((row) => row.year >= latest.year - 15);
  const baselineStart = baselineCandidates.length >= 2 ? baselineCandidates[0] : sorted[0];
  const span = latest.year - baselineStart.year;
  if (span <= 0 || baselineStart.value <= 0 || latest.value <= 0) return [];

  // Avoid extreme extrapolation when sparse data creates noisy CAGR.
  const annualGrowthRaw = Math.pow(latest.value / baselineStart.value, 1 / span) - 1;
  const annualGrowth = Math.max(-0.03, Math.min(0.03, annualGrowthRaw));
  const targetYears = [2025, 2030, 2035, 2040, 2045, 2050].filter((year) => year > latest.year);
  if (!targetYears.length) return [];

  const forecastRows: Array<{ year: number; value: number; delta: number | null }> = [];
  let previousValue = latest.value;
  targetYears.forEach((year) => {
    const projected = Math.round(latest.value * Math.pow(1 + annualGrowth, year - latest.year));
    const delta = previousValue > 0 ? ((projected - previousValue) / previousValue) * 100 : null;
    forecastRows.push({ year, value: projected, delta });
    previousValue = projected;
  });
  return forecastRows;
};

const extractYearFromTitle = (title: string) => {
  const normalized = toHalfWidthDigits(normalizeText(title));
  const all = [...normalized.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0]));
  if (!all.length) return null;
  // Prefer latest year mentioned in title.
  return Math.max(...all);
};

const extractYearFromLabel = (label: string): number | null => {
  const normalized = toHalfWidthDigits(normalizeText(label));
  const y4 = normalized.match(/(19|20)\d{2}/);
  if (y4) return Number(y4[0]);

  const eraMatch = normalized.match(/(令和|平成|昭和|大正|明治)([0-9]+|元)年?/);
  if (!eraMatch) return null;
  const era = eraMatch[1];
  const eraYear = eraMatch[2] === "元" ? 1 : Number(eraMatch[2]);
  if (!Number.isFinite(eraYear) || eraYear <= 0) return null;
  const base =
    era === "令和"
      ? 2018
      : era === "平成"
      ? 1988
      : era === "昭和"
      ? 1925
      : era === "大正"
      ? 1911
      : 1867; // 明治
  return base + eraYear;
};

const parseSeriesFromValues = (
  values: Array<Record<string, unknown>>,
  fallbackYear: number | null = null,
  classLabelMaps: Record<string, Record<string, string>> = {}
) => {
  const byYear = new Map<number, number>();
  values.forEach((value) => {
    const rawValue = unwrapText(value["$"]);
    const numeric = Number(rawValue.replace(/,/g, ""));
    if (!Number.isFinite(numeric)) return;
    const timeKey = Object.keys(value).find((key) => key.toLowerCase().includes("@time"));
    const rawTime = timeKey ? unwrapText(value[timeKey]) : "";
    const yearMatch = rawTime.match(/(\d{4})/);
    let year: number | null = yearMatch ? Number(yearMatch[1]) : null;
    if (!year) {
      for (const [key, raw] of Object.entries(value)) {
        if (!key.startsWith("@")) continue;
        if (key === "@time") continue;
        const classId = key.slice(1);
        const code = unwrapText(raw);
        const label = classLabelMaps[classId]?.[code] ?? code;
        const maybeYear = extractYearFromLabel(label);
        if (maybeYear) {
          year = maybeYear;
          break;
        }
      }
    }
    if (!year) year = fallbackYear;
    if (!year) return;
    const prev = byYear.get(year);
    // If multiple values exist for the same year, keep the largest one (usually total value).
    byYear.set(year, prev === undefined ? numeric : Math.max(prev, numeric));
  });
  return [...byYear.entries()]
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);
};

const computeDeltaByYear = (series: Array<{ year: number; value: number }>) => {
  const map = new Map<number, number | null>();
  for (let i = 0; i < series.length; i += 1) {
    if (i === 0) {
      map.set(series[i].year, null);
      continue;
    }
    const prev = series[i - 1];
    if (prev.value <= 0) {
      map.set(series[i].year, null);
      continue;
    }
    map.set(series[i].year, ((series[i].value - prev.value) / prev.value) * 100);
  }
  return map;
};

const findMetricCode = (classes: EstatClassItem[], keywords: string[]) =>
  classes.find((item) => {
    const name = normalizeText(item.name);
    if (name.includes("割合") || name.includes("率") || name.includes("指数")) return false;
    return keywords.some((word) => name.includes(normalizeText(word)));
  })?.code ?? null;

type EstatMetricTarget = {
  statsDataId: string;
  areaClassId: string;
  areaCode: string;
  metricClassId: string;
  metricCode: string;
  fallbackYear: number | null;
  classLabelMaps: Record<string, Record<string, string>>;
};

const resolvePopulationSetups = async (params: {
  appId: string;
  prefecture: string;
  municipality: string;
  city: string | null;
  ward: string | null;
}) => {
  const merged = new Map<string, EstatTableInfo>();
  const strategies: Array<{ searchWord?: string; statsCode?: string; limit?: number }> = [
    { searchWord: "人口等基本集計", statsCode: "00200521", limit: 500 },
    { searchWord: "国勢調査 人口", statsCode: "00200521", limit: 500 },
    { searchWord: "人口", statsCode: "00200521", limit: 500 },
    { searchWord: "", statsCode: "00200521", limit: 1000 },
    { searchWord: "人口等基本集計", limit: 500 },
    { searchWord: "国勢調査 人口", limit: 500 },
    { searchWord: "人口", limit: 500 },
  ];
  for (const strategy of strategies) {
    try {
      const tables = await fetchEstatStatsList({
        appId: params.appId,
        searchWord: strategy.searchWord,
        statsCode: strategy.statsCode,
        limit: strategy.limit,
      });
      for (const table of tables) {
        if (!merged.has(table.statsDataId)) {
          merged.set(table.statsDataId, table);
        }
      }
      if (merged.size >= 80) break;
    } catch {
      // Try broader strategies if a specific search fails.
    }
  }
  const tables = [...merged.values()];
  const scored = tables
    .map((table) => {
      const n = normalizeText(table.title);
      let hit = 0;
      if (n.includes("人口等基本集計")) hit += 10;
      if (n.includes("国勢調査")) hit += 6;
      if (n.includes("人口")) hit += 3;
      if (n.includes("世帯")) hit += 2;
      if (n.includes("市区町村")) hit += 3;
      return { table, hit };
    })
    .sort((a, b) => b.hit - a.hit)
    .map((row) => row.table);

  const candidates = scored
    .filter((table) => {
      const n = normalizeText(table.title);
      return (n.includes("人口") || n.includes("世帯")) && n.includes("市区町村");
    })
    .sort((a, b) => {
      const score = (title: string) => {
        const n = normalizeText(title);
        let v = 0;
        if (n.includes("市区町村")) v += 6;
        if (n.includes("全国")) v += 2;
        if (n.includes("人口")) v += 1;
        return v;
      };
      return score(b.title) - score(a.title);
    })
    .slice(0, 80);
  if (!candidates.length) {
    throw new Error("e-Statで国勢調査データを検索できませんでした。");
  }

  const nameCandidates = [
    params.municipality,
    params.city ? `${params.city}${params.ward ?? ""}` : null,
    params.city,
    params.ward,
  ]
    .filter((item): item is string => !!item)
    .map((item) => normalizeText(item));

  const populationTargets: EstatMetricTarget[] = [];
  const householdTargets: EstatMetricTarget[] = [];
  const targetKeys = new Set<string>();

  for (const table of candidates) {
    const classObjs = await fetchEstatMeta(params.appId, table.statsDataId);
    const areaObjCandidates = classObjs.filter((obj) => obj.classes.length > 0);
    let matchedArea: { classId: string; areaCode: string } | null = null;
    for (const obj of areaObjCandidates) {
      const match = obj.classes.find((item) => {
        const normalized = normalizeText(item.name);
        return nameCandidates.some(
          (candidate) => normalized === candidate || normalized.includes(candidate)
        );
      });
      if (match) {
        const isAreaLike =
          obj.id.toLowerCase().includes("area") ||
          normalizeText(obj.name).includes("地域") ||
          normalizeText(obj.name).includes("市区町村");
        if (isAreaLike) {
          matchedArea = { classId: obj.id, areaCode: match.code };
          break;
        }
        if (!matchedArea) {
          matchedArea = { classId: obj.id, areaCode: match.code };
        }
      }
    }
    if (!matchedArea) continue;

    const fallbackYear = extractYearFromTitle(table.title);
    classObjs
      .filter((obj) => obj.id !== matchedArea.classId)
      .forEach((metricObj) => {
        const populationCode =
          findMetricCode(metricObj.classes, ["総人口", "人口総数", "人口"]) ?? null;
        const householdCode =
          findMetricCode(metricObj.classes, ["世帯数", "一般世帯数", "総世帯"]) ?? null;

        const classLabelMaps: Record<string, Record<string, string>> = {};
        classObjs.forEach((obj) => {
          const map: Record<string, string> = {};
          obj.classes.forEach((c) => {
            if (c.code) map[c.code] = c.name;
          });
          classLabelMaps[obj.id] = map;
        });

        if (populationCode) {
          const key = [
            table.statsDataId,
            matchedArea.classId,
            matchedArea.areaCode,
            metricObj.id,
            populationCode,
            "p",
          ].join(":");
          if (!targetKeys.has(key)) {
            targetKeys.add(key);
            populationTargets.push({
              statsDataId: table.statsDataId,
              areaClassId: matchedArea.classId,
              areaCode: matchedArea.areaCode,
              metricClassId: metricObj.id,
              metricCode: populationCode,
              fallbackYear,
              classLabelMaps,
            });
          }
        }

        if (householdCode) {
          const key = [
            table.statsDataId,
            matchedArea.classId,
            matchedArea.areaCode,
            metricObj.id,
            householdCode,
            "h",
          ].join(":");
          if (!targetKeys.has(key)) {
            targetKeys.add(key);
            householdTargets.push({
              statsDataId: table.statsDataId,
              areaClassId: matchedArea.classId,
              areaCode: matchedArea.areaCode,
              metricClassId: metricObj.id,
              metricCode: householdCode,
              fallbackYear,
              classLabelMaps,
            });
          }
        }
      });
    if (populationTargets.length >= 30 && householdTargets.length >= 30) {
      break;
    }
  }
  if (!populationTargets.length) {
    throw new Error("市区町村の人口・世帯数データを特定できませんでした。");
  }
  return { populationTargets, householdTargets };
};

const fetchPopulationTextFromEstat = async (params: {
  appId: string;
  prefecture: string;
  municipality: string;
  city: string | null;
  ward: string | null;
}) => {
  const popByYear = new Map<number, number>();
  const hhByYear = new Map<number, number>();

  // Prefer deterministic table IDs that provide longer municipality series (1995+).
  await mergeKnownSeriesFromEstat({
    appId: params.appId,
    prefecture: params.prefecture,
    municipality: params.municipality,
    city: params.city,
    ward: params.ward,
    populationByYear: popByYear,
    householdByYear: hhByYear,
  });

  // Keep broad scan fallback for municipalities not covered by known IDs or changed schemas.
  try {
    const setups = await resolvePopulationSetups(params);
    for (const setup of setups.populationTargets.slice(0, 60)) {
      try {
        const populationValues = await fetchEstatDataValues({
          appId: params.appId,
          statsDataId: setup.statsDataId,
          areaClassId: setup.areaClassId,
          areaCode: setup.areaCode,
          metricClassId: setup.metricClassId,
          metricCode: setup.metricCode,
        });

        const popSeries = parseSeriesFromValues(
          populationValues,
          setup.fallbackYear,
          setup.classLabelMaps
        );

        popSeries.forEach((row) => {
          if (!popByYear.has(row.year)) popByYear.set(row.year, row.value);
        });
      } catch {
        // Skip invalid table pattern and continue fallback scanning.
      }
    }
    for (const setup of setups.householdTargets.slice(0, 60)) {
      try {
        const householdValues = await fetchEstatDataValues({
          appId: params.appId,
          statsDataId: setup.statsDataId,
          areaClassId: setup.areaClassId,
          areaCode: setup.areaCode,
          metricClassId: setup.metricClassId,
          metricCode: setup.metricCode,
        });

        const hhSeries = parseSeriesFromValues(
          householdValues,
          setup.fallbackYear,
          setup.classLabelMaps
        );
        hhSeries.forEach((row) => {
          if (!hhByYear.has(row.year)) hhByYear.set(row.year, row.value);
        });
      } catch {
        // Skip invalid table pattern and continue fallback scanning.
      }
    }
  } catch {
    // Fallback resolver may fail for some areas; known-ID path above already attempted.
  }

  const populationSeries = [...popByYear.entries()]
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);
  const householdSeries = [...hhByYear.entries()]
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);
  if (!populationSeries.length) {
    throw new Error("人口時系列データが見つかりませんでした。");
  }
  const popDeltaByYear = computeDeltaByYear(populationSeries);
  const hhDeltaByYear = computeDeltaByYear(householdSeries);

  const latest = populationSeries[populationSeries.length - 1];
  const latestHouseholds = hhByYear.get(latest.year) ?? null;
  const latestHouseholdsDelta = hhDeltaByYear.get(latest.year) ?? null;
  const forecastSeries = buildPopulationForecastSeries(populationSeries);

  const rows = [...popByYear.keys()].sort((a, b) => b - a);
  const rowLines = rows
    .map((year) => {
      const pop = popByYear.get(year) ?? null;
      const hh = hhByYear.get(year) ?? null;
      return [
        `${year}`,
        `${formatNumber(pop)}`,
        `${toSignedPercent(popDeltaByYear.get(year) ?? null)}`,
        `${formatNumber(hh)}`,
        `${toSignedPercent(hhDeltaByYear.get(year) ?? null)}`,
      ].join("\n");
    })
    .join("\n");

  const forecastLines = forecastSeries
    .sort((a, b) => b.year - a.year)
    .map((row) => `${row.year}\n${formatNumber(row.value)}\n${toSignedPercent(row.delta)}`)
    .join("\n");

  return [
    `${params.prefecture} ${params.municipality}`,
    "最新の実績データ※()は前期比",
    "",
    "人口",
    `${formatNumber(latest.value)}人`,
    "",
    toSignedPercent(popDeltaByYear.get(latest.year) ?? null),
    "",
    "世帯数",
    `${formatNumber(latestHouseholds)}世帯`,
    "",
    toSignedPercent(latestHouseholdsDelta),
    "",
    "将来予測データ※人口のみ（直近実績CAGRによる簡易推計）",
    "西暦\t人口",
    "（前期比）",
    forecastLines,
    "",
    "実績データ",
    "西暦\t人口",
    "（前期比）\t世帯数",
    "（前期比）",
    rowLines,
    "出典データ",
    "e-Stat API（国勢調査 人口等基本集計）",
  ].join("\n");
};

const pickRidershipStation = (
  stations: StationRidershipItem[],
  params: { stationName: string | null; origin: LatLng }
) => {
  const normalizedTarget = params.stationName ? normalizeStationName(params.stationName) : null;
  let candidates = normalizedTarget
    ? stations.filter((item) => normalizeStationName(item.name) === normalizedTarget)
    : [];
  if (!candidates.length && normalizedTarget) {
    candidates = stations.filter((item) => normalizeStationName(item.name).includes(normalizedTarget));
  }
  if (!candidates.length) {
    candidates = stations;
  }
  candidates.sort((a, b) => {
    const aDist =
      typeof a.lat === "number" && typeof a.lng === "number"
        ? haversineMeters(params.origin, { lat: a.lat, lng: a.lng })
        : Number.POSITIVE_INFINITY;
    const bDist =
      typeof b.lat === "number" && typeof b.lng === "number"
        ? haversineMeters(params.origin, { lat: b.lat, lng: b.lng })
        : Number.POSITIVE_INFINITY;
    return aDist - bDist;
  });
  return candidates[0] ?? null;
};

const fetchRidershipText = async (params: { stationName: string | null; origin: LatLng }) => {
  const stations = await loadStationDataset();
  const picked = pickRidershipStation(stations, params);
  if (!picked) {
    throw new Error("乗降客数データに該当駅が見つかりませんでした。");
  }

  const years = Object.keys(picked.yearly)
    .map((year) => Number(year))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a);
  const latestYear = years.find((year) => typeof picked.yearly[String(year)] === "number") ?? null;
  if (latestYear === null) {
    throw new Error("乗降客数の時系列データが見つかりませんでした。");
  }

  const getValue = (year: number) => {
    const raw = picked.yearly[String(year)];
    return typeof raw === "number" ? raw : null;
  };
  const getDelta = (year: number) => {
    const current = getValue(year);
    const prev = getValue(year - 1);
    if (current === null || prev === null || prev <= 0) return null;
    return ((current - prev) / prev) * 100;
  };

  const latestValue = getValue(latestYear);
  const latestDelta = getDelta(latestYear);
  const tableRows = years
    .filter((year) => getValue(year) !== null)
    .map((year) => `${year}\n${formatNumber(getValue(year))}\n${toSignedPercent(getDelta(year))}`)
    .join("\n");

  const stationName = picked.name.endsWith("駅") ? picked.name : `${picked.name}駅`;
  return [
    stationName,
    "最新の実績データ※()は前期比",
    "",
    "乗降客数",
    `${formatNumber(latestValue)}人`,
    toSignedPercent(latestDelta),
    "実績データ",
    "西暦\t乗降客数",
    "（前期比）",
    tableRows,
    "出典データ",
    "国土数値情報ダウンロードサイト（駅別乗降客数）",
  ].join("\n");
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      address?: string;
      stationName?: string;
    };
    const address = body?.address?.trim();
    const stationName = body?.stationName?.trim() ?? null;
    if (!address) {
      return NextResponse.json({ error: "住所が未入力です。" }, { status: 400 });
    }

    const warnings: string[] = [];
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      return NextResponse.json(
        { error: "GOOGLE_MAPS_API_KEY が未設定です。" },
        { status: 500 }
      );
    }

    const geocodeUrl = new URL(`${GOOGLE_MAPS_API_BASE}/geocode/json`);
    geocodeUrl.searchParams.set("address", address);
    geocodeUrl.searchParams.set("language", "ja");
    geocodeUrl.searchParams.set("region", "jp");
    geocodeUrl.searchParams.set("key", googleApiKey);
    const geocodeData = await fetchJson<GeocodeResponse>(geocodeUrl.toString());
    const geocodeStatus = geocodeData.status ?? "UNKNOWN";
    if (geocodeStatus !== "OK") {
      return NextResponse.json(
        {
          error:
            geocodeStatus === "ZERO_RESULTS"
              ? "住所を特定できませんでした。表記を見直してください。"
              : `住所ジオコーディングに失敗しました (${mapServiceError(
                  geocodeStatus,
                  geocodeData.error_message
                )})`,
        },
        { status: 400 }
      );
    }

    const geocodeResult = geocodeData.results?.[0];
    const origin = geocodeResult?.geometry?.location;
    if (!origin || typeof origin.lat !== "number" || typeof origin.lng !== "number") {
      return NextResponse.json({ error: "住所の座標を取得できませんでした。" }, { status: 400 });
    }
    const originPoint: LatLng = { lat: origin.lat, lng: origin.lng };

    let ridershipText: string | null = null;
    try {
      ridershipText = await fetchRidershipText({ stationName, origin: originPoint });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `乗降客数データ取得に失敗しました: ${error.message}`
          : "乗降客数データ取得に失敗しました。"
      );
    }

    return NextResponse.json({
      data: {
        ridershipText,
      },
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `乗降客数データの取得に失敗しました。${error.message}`
            : "乗降客数データの取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
