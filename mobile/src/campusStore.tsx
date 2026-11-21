import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { API_URL, featureToPoi, getCampusBootstrap, getPlaceDetails } from "./api";
import { useAuth } from "./auth";
import type { Category, GeoFeatureCollection, Poi, PoiProperties, TrackProperties } from "./types";

type CampusDataContextValue = {
  loading: boolean;
  error: string | null;
  categories: Category[];
  pois: Poi[];
  tracks?: GeoFeatureCollection<TrackProperties>;
  refreshCampus: (force?: boolean) => Promise<void>;
  getCachedPlaceDetails: (placeId: string) => Promise<any | null>;
};

const CampusDataContext = createContext<CampusDataContextValue | undefined>(undefined);

export function CampusDataProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [tracks, setTracks] = useState<GeoFeatureCollection<TrackProperties> | undefined>();

  const etagRef = useRef<string | undefined>(undefined);
  const hasLoadedRef = useRef<boolean>(false);
  const inflightRef = useRef<Promise<void> | null>(null);
  const placeDetailsCacheRef = useRef<Map<string, any>>(new Map());

  const refreshCampus = useCallback(
    async (force: boolean = false) => {
      if (!accessToken) {
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
            const mappedPois = (data.pois?.features || []).map((feature) =>
              featureToPoi(feature as { id?: number; geometry: { coordinates: number[] }; properties: PoiProperties })
            );
            setCategories(data.categories || []);
            setPois(mappedPois);
            setTracks(data.tracks);
            hasLoadedRef.current = true;
          }
        } catch (err: any) {
          setError(`${err?.message || "Check the API connection and try again."}\n\nAPI: ${API_URL}`);
          throw err;
        } finally {
          setLoading(false);
          inflightRef.current = null;
        }
      })();

      inflightRef.current = task;
      return task;
    },
    [accessToken]
  );

  useEffect(() => {
    if (user && accessToken) {
      refreshCampus(false).catch(() => {});
    } else {
      etagRef.current = undefined;
      hasLoadedRef.current = false;
      setCategories([]);
      setPois([]);
      setTracks(undefined);
      placeDetailsCacheRef.current.clear();
      setLoading(false);
    }
  }, [user?.id, accessToken, refreshCampus]);

  const getCachedPlaceDetails = useCallback(async (placeId: string) => {
    if (!placeId) return null;
    const cached = placeDetailsCacheRef.current.get(placeId);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const details = await getPlaceDetails(placeId);
      if (details?.result) {
        placeDetailsCacheRef.current.set(placeId, details.result);
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
      categories,
      pois,
      tracks,
      refreshCampus,
      getCachedPlaceDetails
    }),
    [loading, error, categories, pois, tracks, refreshCampus, getCachedPlaceDetails]
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
