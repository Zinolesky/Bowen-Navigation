import axios from "axios";

import type {
  Category,
  DirectionsResponse,
  GeoFeatureCollection,
  Poi,
  PoiProperties,
  TrackProperties,
  TravelMode,
  User
} from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000
});

let refreshTokenValue: string | undefined;
let onUnauthorizedCallback: (() => void) | undefined;

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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login/") &&
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

export async function login(full_name: string, matric_number: string) {
  const { data } = await api.post<{ access: string; refresh: string; user: User }>("/auth/login/", {
    full_name: full_name.trim(),
    matric_number: matric_number.trim().toUpperCase()
  });
  return data;
}

export async function getCategories() {
  const { data } = await api.get<Category[]>("/categories/");
  return data;
}

export async function getPois(params?: { search?: string; category?: string }) {
  const { data } = await api.get<GeoFeatureCollection<PoiProperties>>("/pois/", { params });
  return data;
}

export async function getTracks(params?: { track_type?: string }) {
  const { data } = await api.get<GeoFeatureCollection<TrackProperties>>("/tracks/", { params });
  return data;
}

export async function requestDirections(payload: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  mode?: TravelMode;
}) {
  const { data } = await api.post<DirectionsResponse>("/directions/", payload);
  return data;
}

export async function getPlaceDetails(place_id: string) {
  const { data } = await api.post("/places/details/", { place_id });
  return data;
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

export function featureToPoi(feature: { id?: number; geometry: { coordinates: number[] }; properties: PoiProperties }): Poi {
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    ...feature.properties,
    id: feature.id ?? feature.properties.id,
    latitude: latitude ?? feature.properties.latitude,
    longitude: longitude ?? feature.properties.longitude
  };
}
