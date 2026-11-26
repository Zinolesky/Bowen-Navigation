import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { API_URL, featureToPoi, getCampusBootstrap, getPlaceDetails } from "./api";
import { useAuth } from "./auth";
import { loadPersistedBootstrap, savePersistedBootstrap } from "./campusStorage";
import type { Category, GeoFeatureCollection, Poi, PoiProperties, TrackProperties } from "./types";

type CampusDataContextValue = {
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  lastSyncedAt: number | null;
  categories: Category[];
  pois: Poi[];
  tracks?: GeoFeatureCollection<TrackProperties>;
  refreshCampus: (force?: boolean) => Promise<void>;
  getCachedPlaceDetails: (poiOrPlaceId: Poi | string) => Promise<any | null>;
};

const CampusDataContext = createContext<CampusDataContextValue | undefined>(undefined);

function mapBootstrapPois(features?: GeoFeatureCollection<PoiProperties>["features"]): Poi[] {
  return (features || []).map((feature) =>
    featureToPoi(feature as { id?: number; geometry: { coordinates: number[] }; properties: PoiProperties })
  );
}

export function CampusDataProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken, isGuest } = useAuth();
  const canBrowse = Boolean((user && accessToken) || isGuest);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [tracks, setTracks] = useState<GeoFeatureCollection<TrackProperties> | undefined>();

  const etagRef = useRef<string | undefined>(undefined);
  const hasLoadedRef = useRef<boolean>(false);
  const inflightRef = useRef<Promise<void> | null>(null);
  const placeDetailsCacheRef = useRef<Map<string, any>>(new Map());

  const refreshCampus = useCallback(
    async (force: boolean = false) => {
      if (!canBrowse) {
        setLoading(false);
        return;
      }
      if (inflightRef.current && !force) {
        return inflightRef.current;
      }

      const task = (async () => {
        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        setError(null);
        try {
          const res = await getCampusBootstrap({
            includeSprites: true,
            etag: force ? undefined : etagRef.current
          });

          if (!res.notModified) {
            const { data, etag } = res;
            etagRef.current = etag;
            const mappedPois = mapBootstrapPois(data.pois?.features);
            setCategories(data.categories || []);
            setPois(mappedPois);
            setTracks(data.tracks);
            hasLoadedRef.current = true;
            setLastSyncedAt(Date.now());
            savePersistedBootstrap(data, etag).catch(() => {});
          }
          setIsOffline(false);
        } catch (err: any) {
          if (hasLoadedRef.current) {
            setIsOffline(true);
            setError(null);
            if (force) {
              throw err;
            }
          } else {
            setError(`${err?.message || "Check the API connection and try again."}\n\nAPI: ${API_URL}`);
            throw err;
          }
        } finally {
          setLoading(false);
          inflightRef.current = null;
        }
      })();

      inflightRef.current = task;
      return task;
    },
    [canBrowse]
  );

  useEffect(() => {
    let active = true;

    async function hydrateAndRevalidate() {
      if (!canBrowse) {
        etagRef.current = undefined;
        hasLoadedRef.current = false;
        setCategories([]);
        setPois([]);
        setTracks(undefined);
        setIsOffline(false);
        setLastSyncedAt(null);
        placeDetailsCacheRef.current.clear();
        setLoading(false);
        return;
      }

      const persisted = await loadPersistedBootstrap();
      if (active && persisted) {
        const mappedPois = mapBootstrapPois(persisted.data.pois?.features);
        etagRef.current = persisted.etag;
        setCategories(persisted.data.categories || []);
        setPois(mappedPois);
        setTracks(persisted.data.tracks);
        setLastSyncedAt(persisted.savedAt);
        hasLoadedRef.current = mappedPois.length > 0;
        if (hasLoadedRef.current) {
          setLoading(false);
        }
      }

      refreshCampus(false).catch(() => {});
    }

    hydrateAndRevalidate();

    return () => {
      active = false;
    };
  }, [canBrowse, user?.id, refreshCampus]);

  const getCachedPlaceDetails = useCallback(async (poiOrPlaceId: Poi | string) => {
    const cacheKey =
      typeof poiOrPlaceId === "string"
        ? poiOrPlaceId
        : poiOrPlaceId.google_place_id || `poi-${poiOrPlaceId.id}`;
    if (!cacheKey) return null;

    const cached = placeDetailsCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const payload =
        typeof poiOrPlaceId === "string"
          ? { place_id: poiOrPlaceId }
          : {
              place_id: poiOrPlaceId.google_place_id || undefined,
              poi_id: poiOrPlaceId.id,
              name: poiOrPlaceId.name,
              latitude: poiOrPlaceId.latitude,
              longitude: poiOrPlaceId.longitude
            };
      const details = await getPlaceDetails(payload);
      if (details?.result) {
        placeDetailsCacheRef.current.set(cacheKey, details.result);
        return details.result;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<CampusDataContextValue>(
    () => ({
      loading,
      error,
      isOffline,
      lastSyncedAt,
      categories,
      pois,
      tracks,
      refreshCampus,
      getCachedPlaceDetails
    }),
    [loading, error, isOffline, lastSyncedAt, categories, pois, tracks, refreshCampus, getCachedPlaceDetails]
  );

  return <CampusDataContext.Provider value={value}>{children}</CampusDataContext.Provider>;
}

export function useCampusData() {
  const ctx = useContext(CampusDataContext);
  if (!ctx) {
    throw new Error("useCampusData must be used inside CampusDataProvider");
  }
  return ctx;
}
