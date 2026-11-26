import axios from "axios";
import Constants from "expo-constants";

import type {
  CampusBootstrapResponse,
  Category,
  DirectionsResponse,
  GeoFeatureCollection,
  Poi,
  PoiProperties,
  TrackProperties,
  TravelMode,
  User
} from "./types";

function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl && envUrl.startsWith("https://")) {
    return envUrl;
  }

  // In Expo Go on LAN, auto-derive backend host from Metro bundler's hostUri ONLY if it is a LAN IPv4 address.
  // Never append :8001 to an Expo tunnel domain (e.g. *.exp.direct), because tunnel domains only forward port 80 -> 8081.
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    const isLanIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host !== "127.0.0.1";
    if (isLanIpv4) {
      return `http://${host}:8001/api`;
    }
  }

  return envUrl || "http://127.0.0.1:8001/api";
}

export const API_URL = resolveApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  timeout: 25000
});

let refreshTokenValue: string | undefined;
let onUnauthorizedCallback: (() => void) | undefined;
let onTokenRefreshedCallback: ((newAccessToken: string) => void) | undefined;

export function setAccessToken(token?: string) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function setRefreshToken(token?: string) {
  refreshTokenValue = token;
}

export function setOnUnauthorized(callback?: () => void) {
  onUnauthorizedCallback = callback;
}

export function setOnTokenRefreshed(callback?: (newAccessToken: string) => void) {
  onTokenRefreshedCallback = callback;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login/") &&
      !originalRequest.url?.includes("/auth/register/") &&
      !originalRequest.url?.includes("/auth/refresh/")
    ) {
      originalRequest._retry = true;
      if (refreshTokenValue) {
        try {
          const { data } = await axios.post<{ access: string }>(`${API_URL}/auth/refresh/`, {
            refresh: refreshTokenValue
          });
          if (data?.access) {
            setAccessToken(data.access);
            onTokenRefreshedCallback?.(data.access);
            originalRequest.headers.Authorization = `Bearer ${data.access}`;
            return api(originalRequest);
          }
        } catch {
          // Refresh token expired or invalid
        }
      }
      onUnauthorizedCallback?.();
    }
    return Promise.reject(error);
  }
);

export type AuthResponse = {
  access: string;
  refresh: string;
  user: User;
};

export async function login(matric_number: string, password: string, full_name?: string) {
  const payload: { matric_number: string; password: string; full_name?: string } = {
    matric_number: matric_number.trim().toUpperCase(),
    password
  };
  if (full_name && full_name.trim()) {
    payload.full_name = full_name.trim();
  }
  const { data } = await api.post<AuthResponse>("/auth/login/", payload);
  return data;
}

export async function registerStudent(input: {
  full_name: string;
  matric_number: string;
  email?: string;
  password: string;
}) {
  const payload: { full_name: string; matric_number: string; email?: string; password: string } = {
    full_name: input.full_name.trim(),
    matric_number: input.matric_number.trim().toUpperCase(),
    password: input.password
  };
  if (input.email && input.email.trim()) {
    payload.email = input.email.trim().toLowerCase();
  }
  const { data } = await api.post<AuthResponse>("/auth/register/", payload);
  return data;
}

export async function importStudentsCsv(csv_text: string) {
  const { data } = await api.post<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  }>("/admin/import-students/", { csv_text });
  return data;
}

export async function getCategories() {
  const { data } = await api.get<Category[]>("/categories/");
  return data;
}

export async function getPois(params?: {
  search?: string;
  category?: string;
  include_sprites?: boolean;
  include_inactive?: boolean;
}) {
  const queryParams: Record<string, string> = {};
  if (params?.search) queryParams.search = params.search;
  if (params?.category) queryParams.category = params.category;
  if (params?.include_sprites) queryParams.include_sprites = "true";
  if (params?.include_inactive) queryParams.include_inactive = "true";
  const { data } = await api.get<GeoFeatureCollection<PoiProperties>>("/pois/", { params: queryParams });
  return data;
}

export async function getTracks(params?: { track_type?: string }) {
  const { data } = await api.get<GeoFeatureCollection<TrackProperties>>("/tracks/", { params });
  return data;
}

export async function getCampusBootstrap(options?: {
  includeSprites?: boolean;
  etag?: string;
}): Promise<
  | { notModified: true; etag?: string }
  | { notModified: false; etag?: string; data: CampusBootstrapResponse }
> {
  const includeSprites = options?.includeSprites ?? true;
  const response = await api.get<CampusBootstrapResponse>("/bootstrap/", {
    params: includeSprites ? { include_sprites: "true" } : undefined,
    headers: options?.etag ? { "If-None-Match": options.etag } : undefined,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 304
  });

  const nextEtag = (response.headers?.etag || (response.headers as any)?.get?.("etag") || options?.etag) as
    | string
    | undefined;

  if (response.status === 304) {
    return { notModified: true, etag: nextEtag };
  }
  return { notModified: false, etag: nextEtag, data: response.data };
}

export async function requestDirections(payload: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  mode?: TravelMode;
  include_alternate?: boolean;
}) {
  const { data } = await api.post<DirectionsResponse>("/directions/", payload);
  return data;
}

export async function getPlaceDetails(
  input:
    | string
    | {
        place_id?: string;
        poi_id?: number;
        name?: string;
        latitude?: number;
        longitude?: number;
      }
) {
  const payload = typeof input === "string" ? { place_id: input } : input;
  const { data } = await api.post("/places/details/", payload);
  return data;
}

export function buildPlacePhotoUrl(photoRef: string, maxWidth: number = 800): string {
  return `${API_URL}/places/photo/?ref=${encodeURIComponent(photoRef)}&maxwidth=${maxWidth}`;
}

export type PoiWriteInput = Partial<Poi> & {
  category_id: number;
  building_id?: number | null;
  latitude: number;
  longitude: number;
};

export async function createPoi(input: PoiWriteInput) {
  const { data } = await api.post("/pois/", input);
  return data;
}

export async function updatePoi(id: number, input: PoiWriteInput) {
  const { data } = await api.patch(`/pois/${id}/`, input);
  return data;
}

export async function deletePoi(id: number) {
  await api.delete(`/pois/${id}/`);
}

export function featureToPoi(feature: {
  id?: number;
  geometry: { coordinates: number[] };
  properties: PoiProperties;
}): Poi {
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    ...feature.properties,
    id: feature.id ?? feature.properties.id,
    latitude: latitude ?? feature.properties.latitude,
    longitude: longitude ?? feature.properties.longitude
  };
}
