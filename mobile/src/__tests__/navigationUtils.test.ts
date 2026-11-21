import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceAlongRoute,
  bearingDegrees,
  calculateDistanceAlongRouteToPoint,
  calculateRemainingRouteDistance,
  findNearestPointOnRoute,
  formatDistance,
  formatDuration,
  haversineMeters
} from "../navigationUtils";

describe("navigationUtils", () => {
  it("computes haversine distance and cardinal bearing accurately", () => {
    const a = { latitude: 7.621, longitude: 4.19 };
    const b = { latitude: 7.622, longitude: 4.19 };
    assert.equal(haversineMeters(a, a), 0);

    const distNorth = haversineMeters(a, b);
    assert.ok(distNorth > 105 && distNorth < 115, `Unexpected distance ${distNorth}`);

    const brngNorth = bearingDegrees(a, b);
    assert.ok(brngNorth < 1 || brngNorth > 359, `Expected north bearing ~0, got ${brngNorth}`);

    const cEast = { latitude: 7.621, longitude: 4.191 };
    const brngEast = bearingDegrees(a, cEast);
    assert.ok(Math.abs(brngEast - 90) < 1, `Expected east bearing ~90, got ${brngEast}`);
  });

  it("snaps user coordinates onto the closest route segment and measures remaining distance", () => {
    const route = [
      { latitude: 7.621, longitude: 4.19 },
      { latitude: 7.622, longitude: 4.19 },
      { latitude: 7.622, longitude: 4.191 }
    ];

    // Halfway along first north-going segment, shifted slightly east
    const user = { latitude: 7.6215, longitude: 4.19005 };
    const snap = findNearestPointOnRoute(user, route);
    if (!snap) throw new Error("Expected snap point");
    assert.equal(snap.segIndex, 0);
    assert.ok(Math.abs(snap.projected.latitude - 7.6215) < 1e-4);
    assert.ok(snap.distanceFromRoute > 4 && snap.distanceFromRoute < 7);

    const rem = calculateRemainingRouteDistance(snap.segIndex, snap.projected, route);
    const total = haversineMeters(route[0], route[1]) + haversineMeters(route[1], route[2]);
    assert.ok(rem > total * 0.6 && rem < total);
  });

  it("computes distance along the route rather than straight-line around corners", () => {
    const route = [
      { latitude: 7.621, longitude: 4.19 },
      { latitude: 7.622, longitude: 4.19 },
      { latitude: 7.622, longitude: 4.191 }
    ];
    const along = calculateDistanceAlongRouteToPoint(0, route[0], route[2], route);
    const lShapeExpected = haversineMeters(route[0], route[1]) + haversineMeters(route[1], route[2]);
    const crowFlies = haversineMeters(route[0], route[2]);
    assert.ok(Math.abs(along - lShapeExpected) < 2);
    assert.ok(along > crowFlies + 30);
  });

  it("advances across short and long segments by exact meters without overshooting", () => {
    // Seg 0: ~11m north, Seg 1: ~220m east
    const route = [
      { latitude: 7.621, longitude: 4.19 },
      { latitude: 7.6211, longitude: 4.19 },
      { latitude: 7.6211, longitude: 4.192 }
    ];

    const step1 = advanceAlongRoute(route, 0, 0, 20);
    assert.equal(step1.arrived, false);
    assert.equal(step1.index, 1);
    const traveledOnSeg1 = haversineMeters(route[1], step1.position);
    assert.ok(Math.abs(traveledOnSeg1 - 8.9) < 2.0, `Expected ~8.9m on seg 1, got ${traveledOnSeg1}`);

    // Resuming from step1 preserves progress
    const step2 = advanceAlongRoute(route, step1.index, step1.fraction, 50);
    assert.equal(step2.arrived, false);
    const totalFromTurn = haversineMeters(route[1], step2.position);
    assert.ok(Math.abs(totalFromTurn - 58.9) < 2.5, `Expected ~58.9m on seg 1, got ${totalFromTurn}`);

    // Overshooting total route marks arrived at final vertex
    const finish = advanceAlongRoute(route, 1, step2.fraction, 5000);
    assert.equal(finish.arrived, true);
    assert.deepEqual(finish.position, route[2]);
  });

  it("formats distances and durations consistently", () => {
    assert.equal(formatDistance(8), "< 10 m");
    assert.equal(formatDistance(240), "240 m");
    assert.equal(formatDistance(1560), "1.6 km");
    assert.equal(formatDistance(1900), "1.9 km");
    assert.equal(formatDuration(20), "< 1 min");
    assert.equal(formatDuration(60), "1 min");
    assert.equal(formatDuration(540), "9 min");
  });
});
