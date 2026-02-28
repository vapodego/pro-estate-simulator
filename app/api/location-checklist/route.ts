import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LatLng = { lat: number; lng: number };

type PlaceLite = {
  name: string;
  location: LatLng;
  placeId: string | null;
  types: string[];
};

type PointSummary = {
  name: string | null;
  distanceMeters: number | null;
  durationMinutes: number | null;
  line: string | null;
};

type PlaceSearchResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    name?: string;
    place_id?: string;
    types?: string[];
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

type GeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

type DistanceMatrixResponse = {
  status?: string;
  error_message?: string;
  rows?: Array<{
    elements?: Array<{
      status?: string;
      distance?: { value?: number };
      duration?: { value?: number };
    }>;
  }>;
};

const GOOGLE_MAPS_API_BASE = "https://maps.googleapis.com/maps/api";

const mapServiceError = (status: string, message?: string) =>
  `${status}${message ? `: ${message}` : ""}`;

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Google API ${response.status}`);
  }
  return (await response.json()) as T;
};

const buildNearbyUrl = (params: {
  location: LatLng;
  apiKey: string;
  type?: string;
  keyword?: string;
  radius?: number;
  rankByDistance?: boolean;
}) => {
  const url = new URL(`${GOOGLE_MAPS_API_BASE}/place/nearbysearch/json`);
  url.searchParams.set("location", `${params.location.lat},${params.location.lng}`);
  url.searchParams.set("language", "ja");
  if (params.type) url.searchParams.set("type", params.type);
  if (params.keyword) url.searchParams.set("keyword", params.keyword);
  if (params.rankByDistance) {
    url.searchParams.set("rankby", "distance");
  } else {
    url.searchParams.set("radius", String(params.radius ?? 800));
  }
  url.searchParams.set("key", params.apiKey);
  return url.toString();
};

const getNearbyPlaces = async (
  params: Omit<Parameters<typeof buildNearbyUrl>[0], "rankByDistance" | "radius">
) => {
  const url = buildNearbyUrl({ ...params, rankByDistance: true });
  const data = await fetchJson<PlaceSearchResponse>(url);
  const status = data.status ?? "UNKNOWN";
  if (status !== "OK" && status !== "ZERO_RESULTS") {
    throw new Error(mapServiceError(status, data.error_message));
  }
  if (status === "ZERO_RESULTS") return [] as PlaceLite[];
  return (data.results ?? [])
    .map((result) => {
      const lat = result.geometry?.location?.lat;
      const lng = result.geometry?.location?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      return {
        name: result.name ?? "",
        location: { lat, lng },
        placeId: typeof result.place_id === "string" ? result.place_id : null,
        types: Array.isArray(result.types) ? result.types.filter((item) => typeof item === "string") : [],
      } satisfies PlaceLite;
    })
    .filter((result): result is PlaceLite => !!result);
};

const mergeUniquePlaces = (...groups: PlaceLite[][]) => {
  const seen = new Set<string>();
  const merged: PlaceLite[] = [];
  groups.flat().forEach((place) => {
    const key =
      place.placeId ??
      `${place.name}-${place.location.lat.toFixed(6)}-${place.location.lng.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(place);
  });
  return merged;
};

const countPlacesInRadius = async (
  params: Omit<Parameters<typeof buildNearbyUrl>[0], "rankByDistance">
) => {
  const url = buildNearbyUrl({ ...params, rankByDistance: false });
  const data = await fetchJson<PlaceSearchResponse>(url);
  const status = data.status ?? "UNKNOWN";
  if (status === "ZERO_RESULTS") return 0;
  if (status !== "OK") {
    throw new Error(mapServiceError(status, data.error_message));
  }
  return data.results?.length ?? 0;
};

const getWalkingMetrics = async (params: {
  origin: LatLng;
  destination: LatLng;
  apiKey: string;
}) => {
  const url = new URL(`${GOOGLE_MAPS_API_BASE}/distancematrix/json`);
  url.searchParams.set("origins", `${params.origin.lat},${params.origin.lng}`);
  url.searchParams.set("destinations", `${params.destination.lat},${params.destination.lng}`);
  url.searchParams.set("mode", "walking");
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", params.apiKey);

  const data = await fetchJson<DistanceMatrixResponse>(url.toString());
  const status = data.status ?? "UNKNOWN";
  if (status !== "OK") {
    throw new Error(mapServiceError(status, data.error_message));
  }
  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    return { distanceMeters: null, durationMinutes: null };
  }
  const distanceMeters = element.distance?.value;
  const durationSeconds = element.duration?.value;
  return {
    distanceMeters: typeof distanceMeters === "number" ? distanceMeters : null,
    durationMinutes:
      typeof durationSeconds === "number" ? Math.max(1, Math.round(durationSeconds / 60)) : null,
  };
};

const toRadians = (degree: number) => (degree * Math.PI) / 180;

const getCrowDistanceMeters = (origin: LatLng, destination: LatLng) => {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parseLineFromName = (name: string) => {
  const bracket = name.match(/[（(]([^）)]+線)[）)]/);
  if (bracket?.[1]) return bracket[1];
  const inline = name.match(/([^\s]+線)/);
  return inline?.[1] ?? null;
};

const inferStationLine = (place: PlaceLite) => {
  const fromName = parseLineFromName(place.name);
  if (fromName) return fromName;
  if (place.types.includes("subway_station")) return "地下鉄";
  if (place.types.includes("train_station")) return "鉄道";
  return null;
};

type RankedPoint = {
  candidate: PlaceLite;
  distanceMeters: number | null;
  durationMinutes: number | null;
};

const toPointSummary = (point: RankedPoint, withLine = false): PointSummary => {
  return {
    name: point.candidate.name || null,
    distanceMeters: point.distanceMeters,
    durationMinutes: point.durationMinutes,
    line: withLine ? inferStationLine(point.candidate) : null,
  };
};

const toNullablePointSummary = (point: RankedPoint | null, withLine = false): PointSummary | null =>
  point ? toPointSummary(point, withLine) : null;

const rankByWalking = async (params: {
  origin: LatLng;
  candidates: PlaceLite[];
  apiKey: string;
  limit?: number;
}): Promise<RankedPoint[]> => {
  if (!params.candidates.length) return [];
  // Nearby Search の戻り順は type/keyword を混在させると偏ることがあるため、
  // まず直線距離で並べ替えてから徒歩計測対象を絞る。
  const nearestFirst = [...params.candidates].sort(
    (a, b) =>
      getCrowDistanceMeters(params.origin, a.location) -
      getCrowDistanceMeters(params.origin, b.location)
  );
  const targets = nearestFirst.slice(0, params.limit ?? 8);
  const scored = await Promise.all(
    targets.map(async (candidate) => {
      const walking = await getWalkingMetrics({
        origin: params.origin,
        destination: candidate.location,
        apiKey: params.apiKey,
      });
      return {
        candidate,
        distanceMeters: walking.distanceMeters,
        durationMinutes: walking.durationMinutes,
      };
    })
  );

  return scored.sort((a, b) => {
    const aMinutes = a.durationMinutes ?? Number.POSITIVE_INFINITY;
    const bMinutes = b.durationMinutes ?? Number.POSITIVE_INFINITY;
    if (aMinutes !== bMinutes) return aMinutes - bMinutes;
    const aDistance = a.distanceMeters ?? Number.POSITIVE_INFINITY;
    const bDistance = b.distanceMeters ?? Number.POSITIVE_INFINITY;
    return aDistance - bDistance;
  });
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { address?: string };
    const address = body?.address?.trim();
    if (!address) {
      return NextResponse.json({ error: "住所が未入力です。" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_MAPS_API_KEY が未設定です。" },
        { status: 500 }
      );
    }

    const geocodeUrl = new URL(`${GOOGLE_MAPS_API_BASE}/geocode/json`);
    geocodeUrl.searchParams.set("address", address);
    geocodeUrl.searchParams.set("language", "ja");
    geocodeUrl.searchParams.set("region", "jp");
    geocodeUrl.searchParams.set("key", apiKey);
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

    const [
      trainStationPlaces,
      subwayStationPlaces,
      busStationPlaces,
      busStopPlaces,
      busTeiryujoPlaces,
      conveniencePlaces,
      supermarketPlaces,
      hospitalPlaces,
      pharmacyPlaces,
      convenienceCount800m,
      supermarketCount800m,
      hospitalCount800m,
      pharmacyCount800m,
      schoolCount800m,
      parkCount800m,
      cemeteryCount1500m,
      wasteFacilityCount1500m,
      factoryCount1500m,
    ] = await Promise.all([
      getNearbyPlaces({ location: originPoint, apiKey, type: "train_station" }),
      getNearbyPlaces({ location: originPoint, apiKey, type: "subway_station" }),
      getNearbyPlaces({ location: originPoint, apiKey, type: "bus_station" }),
      getNearbyPlaces({ location: originPoint, apiKey, keyword: "バス停" }),
      getNearbyPlaces({ location: originPoint, apiKey, keyword: "停留所" }),
      getNearbyPlaces({ location: originPoint, apiKey, type: "convenience_store" }),
      getNearbyPlaces({ location: originPoint, apiKey, type: "supermarket" }),
      getNearbyPlaces({ location: originPoint, apiKey, type: "hospital" }),
      getNearbyPlaces({ location: originPoint, apiKey, type: "pharmacy" }),
      countPlacesInRadius({ location: originPoint, apiKey, type: "convenience_store", radius: 800 }),
      countPlacesInRadius({ location: originPoint, apiKey, type: "supermarket", radius: 800 }),
      countPlacesInRadius({ location: originPoint, apiKey, type: "hospital", radius: 800 }),
      countPlacesInRadius({ location: originPoint, apiKey, type: "pharmacy", radius: 800 }),
      countPlacesInRadius({ location: originPoint, apiKey, type: "school", radius: 800 }),
      countPlacesInRadius({ location: originPoint, apiKey, type: "park", radius: 800 }),
      countPlacesInRadius({ location: originPoint, apiKey, type: "cemetery", radius: 1500 }),
      countPlacesInRadius({ location: originPoint, apiKey, keyword: "清掃工場", radius: 1500 }),
      countPlacesInRadius({ location: originPoint, apiKey, keyword: "工場", radius: 1500 }),
    ]);

    const stationCandidates = mergeUniquePlaces(trainStationPlaces, subwayStationPlaces);
    const busStopCandidates = mergeUniquePlaces(
      busStationPlaces,
      busStopPlaces,
      busTeiryujoPlaces
    );

    const [stationRanked, busStopRanked, convenienceRanked, supermarketRanked, hospitalRanked, pharmacyRanked] =
      await Promise.all([
        rankByWalking({ origin: originPoint, candidates: stationCandidates, apiKey, limit: 10 }),
        rankByWalking({ origin: originPoint, candidates: busStopCandidates, apiKey, limit: 10 }),
        rankByWalking({ origin: originPoint, candidates: conveniencePlaces, apiKey, limit: 8 }),
        rankByWalking({ origin: originPoint, candidates: supermarketPlaces, apiKey, limit: 8 }),
        rankByWalking({ origin: originPoint, candidates: hospitalPlaces, apiKey, limit: 8 }),
        rankByWalking({ origin: originPoint, candidates: pharmacyPlaces, apiKey, limit: 8 }),
      ]);

    const station = toNullablePointSummary(stationRanked[0] ?? null, true);
    const busStop = toNullablePointSummary(busStopRanked[0] ?? null);
    const convenienceStore = toNullablePointSummary(convenienceRanked[0] ?? null);
    const supermarket = toNullablePointSummary(supermarketRanked[0] ?? null);
    const hospital = toNullablePointSummary(hospitalRanked[0] ?? null);
    const pharmacy = toNullablePointSummary(pharmacyRanked[0] ?? null);

    return NextResponse.json({
      data: {
        fetchedAt: new Date().toISOString(),
        normalizedAddress: geocodeResult?.formatted_address ?? null,
        originLat: originPoint.lat,
        originLng: originPoint.lng,
        station,
        busStop,
        convenienceStore,
        supermarket,
        hospital,
        pharmacy,
        stationOptions: stationRanked.slice(0, 6).map((item) => toPointSummary(item, true)),
        busStopOptions: busStopRanked.slice(0, 6).map((item) => toPointSummary(item)),
        convenienceOptions: convenienceRanked.slice(0, 8).map((item) => toPointSummary(item)),
        supermarketOptions: supermarketRanked.slice(0, 8).map((item) => toPointSummary(item)),
        convenienceCount800m,
        supermarketCount800m,
        hospitalCount800m,
        pharmacyCount800m,
        schoolCount800m,
        parkCount800m,
        cemeteryCount1500m,
        wasteFacilityCount1500m,
        factoryCount1500m,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `周辺環境データの取得に失敗しました。${error.message}`
            : "周辺環境データの取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
