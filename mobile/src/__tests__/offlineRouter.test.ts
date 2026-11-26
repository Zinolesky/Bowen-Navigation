import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeOfflineDirections } from "../offlineRouter";
import type { GeoFeatureCollection, TrackProperties } from "../types";

const sampleTracks: GeoFeatureCollection<TrackProperties> = {
  type: "FeatureCollection",
  features: [
    {
      id: 1,
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [4.197, 7.622],
          [4.198, 7.622],
          [4.199, 7.622]
        ]
      },
      properties: {
        id: 1,
        name: "Pedestrian Shortcut",
        description: "Direct pedestrian footpath",
        track_type: "pedestrian",
        source: "test"
      }
    },
    {
      id: 2,
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [4.197, 7.622],
          [4.197, 7.6205],
          [4.199, 7.6205],
          [4.199, 7.622]
        ]
      },
      properties: {
        id: 2,
        name: "Southern Vehicle Road",
        description: "Campus perimeter road",
        track_type: "vehicle",
        source: "test"
      }
    }
  ]
};

describe("offlineRouter", () => {
  it("routes offline with pedestrian vs vehicle separation and alternate_modes", () => {
    const walkRoute = computeOfflineDirections({
      origin: { latitude: 7.622, longitude: 4.197 },
      destination: { latitude: 7.622, longitude: 4.199 },
      mode: "walking",
      tracks: sampleTracks,
      includeAlternate: true
    });
    const driveRoute = computeOfflineDirections({
      origin: { latitude: 7.622, longitude: 4.197 },
      destination: { latitude: 7.622, longitude: 4.199 },
      mode: "driving",
      tracks: sampleTracks,
      includeAlternate: true
    });

    assert.ok(walkRoute);
    assert.ok(driveRoute);
    assert.equal(walkRoute.provider, "local-fallback");
    assert.equal(walkRoute.mode, "walking");
    assert.equal(driveRoute.mode, "driving");
    assert.ok((walkRoute.distance_meters ?? 0) < (driveRoute.distance_meters ?? 0));
    assert.ok(walkRoute.overview_polyline !== driveRoute.overview_polyline);
    assert.ok(walkRoute.steps.some((s) => s.instruction.includes("Pedestrian Shortcut")));
    assert.ok(driveRoute.steps.some((s) => s.instruction.includes("Southern Vehicle Road")));
    assert.ok(walkRoute.alternate_modes?.walking);
    assert.ok(walkRoute.alternate_modes?.driving);
  });

  it("splits X-intersections and suppresses false curve turns along one named road", () => {
    const tracks: GeoFeatureCollection<TrackProperties> = {
      type: "FeatureCollection",
      features: [
        {
          id: 10,
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [4.191, 7.621],
              [4.192, 7.6212],
              [4.193, 7.6219],
              [4.1938, 7.6228]
            ]
          },
          properties: {
            id: 10,
            name: "Curving Main Boulevard",
            description: "",
            track_type: "both",
            source: "test"
          }
        },
        {
          id: 11,
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [4.1925, 7.6205],
              [4.1925, 7.623]
            ]
          },
          properties: {
            id: 11,
            name: "Northbound Cross Walk",
            description: "",
            track_type: "pedestrian",
            source: "test"
          }
        }
      ]
    };

    const curved = computeOfflineDirections({
      origin: { latitude: 7.621, longitude: 4.191 },
      destination: { latitude: 7.6228, longitude: 4.1938 },
      mode: "walking",
      tracks
    });
    assert.ok(curved);
    const nonArriveSteps = curved.steps.filter((s) => s.maneuver !== "arrive");
    assert.equal(nonArriveSteps.length, 1);
    assert.equal(nonArriveSteps[0].road_name, "Curving Main Boulevard");

    const xRoute = computeOfflineDirections({
      origin: { latitude: 7.62155, longitude: 4.1925 },
      destination: { latitude: 7.6228, longitude: 4.1938 },
      mode: "walking",
      tracks
    });
    assert.ok(xRoute);
    assert.ok((xRoute.distance_meters ?? 9999) < 350);
  });

  it("snaps far off-campus origins (> 3km) to Bowen Main Gate", () => {
    const lagosOrigin = { latitude: 6.5244, longitude: 3.3792 };
    const route = computeOfflineDirections({
      origin: lagosOrigin,
      destination: { latitude: 7.622, longitude: 4.199 },
      mode: "walking",
      tracks: sampleTracks
    });

    assert.ok(route);
    assert.ok((route.summary || "").includes("From Main Gate"));
    assert.ok((route.distance_meters ?? 99999) < 5000);
  });
});
