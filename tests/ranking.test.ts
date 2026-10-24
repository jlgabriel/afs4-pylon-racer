import { describe, expect, it } from "vitest";
import { resolveClass } from "../src/core/ranking/classes";
import { classesOf, leaderboard, pilotBest, pilotRuns } from "../src/core/ranking/ranking";
import type { RunSummary } from "../src/shared/racerApi";

let n = 0;
function run(p: Partial<RunSummary>): RunSummary {
  n++;
  return {
    id: `r${n}`,
    courseId: "c",
    courseRevision: "rev",
    status: "finished",
    dnfReason: null,
    total: 60,
    raw: 60,
    penaltyTotal: 0,
    aircraftId: "extra330",
    classId: "aerobatic",
    source: "reader",
    sourceHz: 40,
    pilot: "Juan",
    startedAt: `2026-10-24T10:00:${String(n).padStart(2, "0")}Z`,
    ...p,
  };
}

describe("resolveClass", () => {
  const choices = { aircraft: { my_plane: "jet", c172: "jet", odd: "nope" }, noAircraft: "ga" };

  it("keeps the built-in class of a known aircraft, whatever was chosen", () => {
    expect(resolveClass("c172", choices)).toBe("ga");
    expect(resolveClass("extra330", choices)).toBe("aerobatic");
  });

  it("uses the pilot's choice for an aircraft it does not know, and for no aircraft (UDP)", () => {
    expect(resolveClass("my_plane", choices)).toBe("jet");
    expect(resolveClass(null, choices)).toBe("ga");
  });

  it("is unclassified with no choice, or a choice that is not a class", () => {
    expect(resolveClass("other_plane", choices)).toBeNull();
    expect(resolveClass("odd", choices)).toBeNull();
    expect(resolveClass(null, { aircraft: {}, noAircraft: null })).toBeNull();
  });
});

describe("ranking", () => {
  const runs = [
    run({ pilot: "Juan", total: 50 }),
    run({ pilot: "Juan", total: 45 }),
    run({ pilot: "Pedro", total: 47 }),
    run({ pilot: "Pedro", total: 40, status: "dnf", dnfReason: "stopped" }),
    run({ pilot: "Pedro", total: 30, aircraftId: "c172", classId: "ga" }),
    run({ pilot: "Ana", total: 70, aircraftId: null, classId: null, source: "udp" }),
    run({ pilot: "Ana", total: 55, classId: "class-from-a-newer-version" }),
  ];

  it("lists the classes flown, in catalog order, unclassified last", () => {
    expect(classesOf(runs)).toEqual(["aerobatic", "ga", null]);
  });

  it("has one row per pilot with their best finished run in the class", () => {
    expect(leaderboard(runs, "aerobatic").map((r) => [r.pilot, r.total])).toEqual([
      ["Juan", 45],
      ["Pedro", 47],
    ]);
    expect(leaderboard(runs, "ga").map((r) => r.pilot)).toEqual(["Pedro"]);
    expect(leaderboard(runs, null).map((r) => [r.pilot, r.total])).toEqual([["Ana", 55]]);
  });

  it("never ranks a demo flight, but keeps it last in the pilot's runs", () => {
    const withDemo = [...runs, run({ pilot: "Juan", total: 10, source: "demo" })];
    expect(leaderboard(withDemo, "aerobatic").map((r) => r.total)).toEqual([45, 47]);
    expect(pilotBest(withDemo, "Juan", "aerobatic")?.total).toBe(45);
    expect(pilotRuns(withDemo, "Juan", "aerobatic").map((r) => [r.source, r.total])).toEqual([
      ["reader", 45],
      ["reader", 50],
      ["demo", 10],
    ]);
  });

  it("gives a tie to whoever flew it first", () => {
    const tie = [run({ pilot: "B", total: 40 }), run({ pilot: "A", total: 40 })];
    expect(leaderboard(tie, "aerobatic").map((r) => r.pilot)).toEqual(["B", "A"]);
  });

  it("lists a pilot's runs in the class with DNFs after the finished ones", () => {
    expect(pilotRuns(runs, "Pedro", "aerobatic").map((r) => [r.status, r.total])).toEqual([
      ["finished", 47],
      ["dnf", 40],
    ]);
  });

  it("finds a pilot's best in a class, or none", () => {
    expect(pilotBest(runs, "Pedro", "aerobatic")?.total).toBe(47);
    expect(pilotBest(runs, "Pedro", "ga")?.total).toBe(30);
    expect(pilotBest(runs, "Juan", "ga")).toBeNull();
  });
});
