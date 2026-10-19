export type User = {
  id: number;
  full_name: string;
  matric_number: string;
  is_staff_admin: boolean;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon_identifier: string;
  description: string;
};

export type Building = {
  id: number;
  name: string;
  slug: string;
  description: string;
  latitude: number;
  longitude: number;
};

export type GeoFeature<T> = {
  id?: number;
  type: "Feature";
  geometry: {
    type: "Point" | "LineString";
    coordinates: number[] | number[][];
  };
  properties: T;
};

export type GeoFeatureCollection<T> = {
  type: "FeatureCollection";
  features: GeoFeature<T>[];
};

export type PoiProperties = {
  id: number;
  name: string;
  slug: string;
  category: Category;
  building?: Building | null;
  description: string;
  operating_hours: string;
  google_place_id: string;
  icon_identifier: string;
  latitude: number;
  longitude: number;
  marker_icon_default?: string;
  marker_icon_compact?: string;
  marker_icon_selected?: string;
  marker_icon_destination?: string;
  marker_anchor_x?: number;
  is_active: boolean;
};

export type Poi = PoiProperties & {
  latitude: number;
  longitude: number;
};

export type PathwayType = "pedestrian" | "vehicle" | "both";

export type TravelMode = "walking" | "driving";

export type TrackProperties = {
  id: number;
  name: string;
  description: string;
  track_type?: PathwayType;
  source: string;
};

export type RouteStep = {
  instruction: string;
  distance_text: string;
  duration_text: string;
  polyline?: string;
};

export type DirectionsResponse = {
  provider: "google" | "local-fallback" | "bowen-routing";
  mode?: TravelMode;
  status: string;
  summary?: string;
  distance_text?: string;
  duration_text?: string;
  duration_badge_uri?: string;
  overview_polyline: string;
  steps: RouteStep[];
};
