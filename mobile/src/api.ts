import axios from "axios";

import type {
  Category,
  DirectionsResponse,
  GeoFeatureCollection,
  Poi,
  PoiProperties,
  TrackProperties,
  User
} from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000
});

export function setAccessToken(token?: string) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export async function login(full_name: string, matric_number: string) {
  const { data } = await api.post<{ access: string; refresh: string; user: User }>("/auth/login/", {
    full_name,
    matric_number
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

export async function getTracks() {
  const { data } = await api.get<GeoFeatureCollection<TrackProperties>>("/tracks/");
  return data;
}

export async function requestDirections(payload: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
}) {
  const { data } = await api.post<DirectionsResponse>("/directions/", payload);
  return data;
}

export async function getPlaceDetails(place_id: string) {
  const { data } = await api.post("/places/details/", { place_id });
  return data;
}

export async function createPoi(input: Partial<Poi> & { category_id: number; latitude: number; longitude: number }) {
  const { data } = await api.post("/pois/", input);
  return data;
}

export async function updatePoi(
  id: number,
  input: Partial<Poi> & { category_id: number; latitude: number; longitude: number }
) {
  const { data } = await api.put(`/pois/${id}/`, input);
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

