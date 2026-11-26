import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import type { CampusBootstrapResponse } from "./types";

const CACHE_FILENAME = "bowen_campus_bootstrap_v1.json";

export type PersistedBootstrap = {
  etag?: string;
  savedAt: number;
  data: CampusBootstrapResponse;
};

function isValidBootstrapData(candidate: unknown): candidate is CampusBootstrapResponse {
  if (!candidate || typeof candidate !== "object") return false;
  const obj = candidate as Partial<CampusBootstrapResponse>;
  return (
    Array.isArray(obj.categories) &&
    Array.isArray(obj.pois?.features) &&
    Array.isArray(obj.tracks?.features)
  );
}

export async function loadPersistedBootstrap(): Promise<PersistedBootstrap | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      if (typeof globalThis.localStorage !== "undefined") {
        raw = globalThis.localStorage.getItem(CACHE_FILENAME);
      }
    } else {
      const file = new File(Paths.document, CACHE_FILENAME);
      if (!file.exists) {
        return null;
      }
      raw = await file.text();
    }

    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedBootstrap>;
    if (!parsed || !isValidBootstrapData(parsed.data)) {
      return null;
    }

    return {
      etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
      data: parsed.data
    };
  } catch {
    return null;
  }
}

export async function savePersistedBootstrap(data: CampusBootstrapResponse, etag?: string): Promise<void> {
  try {
    const payload: PersistedBootstrap = {
      etag,
      savedAt: Date.now(),
      data
    };
    const serialized = JSON.stringify(payload);
    if (Platform.OS === "web") {
      if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.setItem(CACHE_FILENAME, serialized);
      }
      return;
    }

    const file = new File(Paths.document, CACHE_FILENAME);
    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
    }
    await file.write(serialized);
  } catch {
    // Persistence is best-effort; never interrupt foreground UI flow
  }
}
