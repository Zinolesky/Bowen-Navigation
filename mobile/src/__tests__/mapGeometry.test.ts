import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Category, Poi } from "../types";
import {
  computeDeclutteredPois,
  filterStandaloneWalkwayPolylines,
  isCoordinateOnCampus,
  toCampusXY,
  type PlanarSegment
} from "../utils/mapGeometry";

function makeSegment(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): PlanarSegment {
  const pa = toCampusXY(a);
  const pb = toCampusXY(b);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  return { ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, dx, dy, len: Math.hypot(dx, dy) };
}

function makePoi(id: number, name: string, lat: number, lon: number, slug = "academic"): Poi {
  const category: Category = {
    id: 1,
    name: "Academic",
    slug,
    color: "#1D4ED8",
    icon_identifier: "school",
    description: ""
  };
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    category,
    building: null,
    description: "",
    operating_hours: "",
    google_place_id: "",
    icon_identifier: "school",
    latitude: lat,
    longitude: lon,
    is_active: true
  };
}

describe("mapGeometry", () => {
  it("hides parallel sidewalks beside a driveway while retaining diverging walkways", () => {
    const driveway = [makeSegment({ latitude: 7.621, longitude: 4.197 }, { latitude: 7.621, longitude: 4.199 })];

    // Segment 1: 4m parallel sidewalk (should be hidden)
    // Segment 2: veers north 80m away from road (should stay visible)
    const walkway = [
      { latitude: 7.62103, longitude: 4.197 },
      { latitude: 7.62103, longitude: 4.198 },
      { latitude: 7.62175, longitude: 4.198 }
    ];

    const standalone = filterStandaloneWalkwayPolylines(walkway, driveway);
    assert.equal(standalone.length, 1);
    assert.equal(standalone[0].length, 2);
    assert.deepEqual(standalone[0][0], walkway[1]);
    assert.deepEqual(standalone[0][1], walkway[2]);
  });

  it("distinguishes Bowen campus vs Lagos coordinates", () => {
    assert.equal(isCoordinateOnCampus(7.6215, 4.199), true);
    assert.equal(isCoordinateOnCampus(6.5244, 3.3792), false);
  });

  it("prioritizes major landmarks and selected POIs during zoom decluttering", () => {
    const minor = makePoi(1, "Minor Kiosk", 7.6215, 4.199, "recreation");
    const major = makePoi(2, "Timothy Olagbenro Library", 7.62151, 4.19901, "academic");

    const results = computeDeclutteredPois({
      pois: [minor, major],
      latitudeDelta: 0.013,
      longitudeDelta: 0.016,
      isNavActive: false
    });

    assert.equal(results[0].poi.id, 2);
    assert.equal(results[0].displayMode, "full");
    // Overlapping minor POI at exact same location is decluttered out
    assert.equal(results.length, 1);

    // Explicitly selecting the minor POI forces it to appear in full
    const forced = computeDeclutteredPois({
      pois: [minor, major],
      latitudeDelta: 0.013,
      longitudeDelta: 0.016,
      selectedPoiId: 1,
      isNavActive: false
    });
    assert.equal(forced[0].poi.id, 1);
    assert.equal(forced[0].displayMode, "full");
  });
});
