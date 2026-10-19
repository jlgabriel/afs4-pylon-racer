import { describe, expect, it } from "vitest";
import { demoFlight } from "../src/core/demo/demoFlight";
import { RaceEngine, type RaceEvent } from "../src/core/race/engine";
import { fixAt, makeCourse, straightCourse } from "./helpers";

const kinds = (events: RaceEvent[]): string[] => events.map((e) => e.kind);

function fly(engine: RaceEngine, path: [number, number][], dt = 1): RaceEvent[] {
  const events: RaceEvent[] = [];
  path.forEach(([x, y], i) => events.push(...engine.update(fixAt(x, y, i * dt))));
  return events;
}

describe("a clean run", () => {
  it("times a straight northbound run exactly at 1 Hz", () => {
    const eng = new RaceEngine(straightCourse());
    const path = Array.from({ length: 14 }, (_, i) => [0, -640 + 100 * i] as [number, number]);
    const events = fly(eng, path);
    const s = eng.snapshot();
    expect(s.status).toBe("finished");
    expect(s.penaltyTotal).toBe(0);
    // Gates at y = -500 / 0 / 500 are crossed at t = 1.4 / 6.4 / 11.4 (interpolated).
    expect(s.raw).toBeCloseTo(10, 1);
    expect(s.passes.map((p) => p.elapsed)).toEqual([0, expect.closeTo(5, 1), expect.closeTo(10, 1)]);
    expect(kinds(events)).toEqual(["started", "pass", "pass", "finished"]);
    expect(s.lapTimes).toEqual([expect.closeTo(10, 1)]);
  });

  it("records every gate crossed within one sample, in order", () => {
    // 0.083 Hz: one segment spans all three gates.
    const eng = new RaceEngine(straightCourse());
    eng.update(fixAt(0, -600, 0));
    const events = eng.update(fixAt(0, 600, 12));
    expect(kinds(events)).toEqual(["started", "pass", "pass", "finished"]);
    expect(eng.snapshot().raw).toBeCloseTo(10, 1);
  });

  it("freezes the clock at the finish", () => {
    const eng = new RaceEngine(straightCourse());
    fly(eng, Array.from({ length: 14 }, (_, i) => [0, -640 + 100 * i] as [number, number]));
    const frozen = eng.raw();
    eng.update(fixAt(0, 800, 50));
    expect(eng.raw()).toBe(frozen);
  });

  it("ignores duplicate and out-of-order samples", () => {
    const eng = new RaceEngine(straightCourse());
    eng.update(fixAt(0, -600, 0));
    expect(eng.update(fixAt(0, -400, 0))).toEqual([]);
    expect(eng.raceStatus).toBe("waiting");
  });
});

describe("what the engine records at a pass", () => {
  it("interpolates roll, altitude and the offset from the gate center", () => {
    const eng = new RaceEngine(straightCourse());
    eng.update(fixAt(20, -600, 0, { rollDeg: 0, altMslM: 1500, aglM: 20 }));
    eng.update(fixAt(20, -400, 2, { rollDeg: 40, altMslM: 1520, aglM: 40 }));
    const start = eng.snapshot().passes[0]!;
    expect(start.t).toBeCloseTo(1, 2);
    expect(start.rollDeg).toBeCloseTo(20, 1);
    expect(start.altMslM).toBeCloseTo(1510, 1);
    expect(start.aglM).toBeCloseTo(30, 1);
    // Flying north, x = +20 is 20 m right of the center.
    expect(start.offsetM).toBeCloseTo(20, 0);
  });
});

describe("starting", () => {
  it("does not start on a wrong-way crossing of the start line", () => {
    const eng = new RaceEngine(straightCourse());
    fly(eng, [
      [0, -400],
      [0, -600],
    ]);
    expect(eng.raceStatus).toBe("waiting");
  });

  it("does not start by flying through a later gate first", () => {
    const eng = new RaceEngine(straightCourse());
    fly(eng, [
      [0, -100],
      [0, 100],
    ]);
    expect(eng.raceStatus).toBe("waiting");
  });
});

describe("penalties", () => {
  const detour: [number, number][] = [
    [0, -600],
    [0, -400], // through the start
    [200, -400], // east
    [200, 200], // north, outside gate 2's span
    [0, 200], // back west, past gate 2
    [0, 600], // through the finish
  ];

  it("a skipped gate costs the course's missed-gate penalty", () => {
    const eng = new RaceEngine(straightCourse());
    const events = fly(eng, detour);
    const s = eng.snapshot();
    expect(s.status).toBe("finished");
    expect(s.penalties).toEqual([expect.objectContaining({ kind: "missed-gate", gateIndex: 1, seconds: 10 })]);
    expect(s.total).toBeCloseTo(s.raw + 10, 9);
    expect(kinds(events)).toEqual(["started", "penalty", "pass", "finished"]);
  });

  it("a skipped gate ends the run when the course says so", () => {
    const eng = new RaceEngine(straightCourse({ rules: { missedGateIsDnf: true } }));
    const events = fly(eng, detour);
    expect(eng.raceStatus).toBe("dnf");
    expect(kinds(events)).toEqual(["started", "dnf"]);
  });

  it("a wrong-way pass of the next gate is penalized once", () => {
    const eng = new RaceEngine(straightCourse());
    fly(eng, [
      [0, -540],
      [0, -440], // start
      [200, -440],
      [200, 200],
      [0, 200],
      [0, -100], // through gate 2 southbound
      [0, 100], // northbound: a valid pass
      [0, -100], // southbound again: gate 2 is behind now, no penalty
    ]);
    const s = eng.snapshot();
    expect(s.penalties.map((p) => p.kind)).toEqual(["wrong-direction"]);
    expect(s.passes.map((p) => p.gateIndex)).toEqual([0, 1]);
  });
});

describe("laps", () => {
  // A diamond: start at the origin heading north, then NE, SE, SW corners, back through the start.
  const diamond = (laps: number) =>
    makeCourse(
      [
        { type: "start", x: 0, y: 0, heading: 0 },
        { type: "gate", x: 500, y: 500, heading: 90 },
        { type: "gate", x: 1000, y: 0, heading: 180 },
        { type: "knife", x: 500, y: -500, heading: 270 },
      ],
      { laps },
    );

  it("closes each lap on the start line and finishes after the last", () => {
    const course = diamond(3);
    const eng = new RaceEngine(course);
    const events: RaceEvent[] = [];
    for (const f of demoFlight(course, { speedMs: 100, rateHz: 5 })) events.push(...eng.update(f));
    const s = eng.snapshot();
    expect(s.status).toBe("finished");
    expect(s.penalties).toEqual([]);
    expect(s.passes).toHaveLength(1 + 3 * 4);
    expect(s.lapTimes).toHaveLength(3);
    // Four legs of 707 m at 100 m/s.
    for (const lap of s.lapTimes) expect(lap).toBeCloseTo(28.28, 1);
    expect(events.filter((e) => e.kind === "lap")).toHaveLength(3);
    expect(s.lap).toBe(3);
  });

  it("cutting back through the start mid-lap misses the rest of the lap", () => {
    const eng = new RaceEngine(diamond(2));
    fly(eng, [
      [0, -100],
      [0, 100], // start
      [-100, 100],
      [-100, -100],
      [0, -100],
      [0, 100], // back through the start without flying the lap
    ]);
    const s = eng.snapshot();
    expect(s.penalties.map((p) => p.gateIndex)).toEqual([1, 2, 3]);
    expect(s.lapTimes).toHaveLength(1);
  });
});

describe("turn pylons", () => {
  const withTurn = makeCourse([
    { type: "start", x: 0, y: -500, heading: 0 },
    { type: "turn", x: 0, y: 0, heading: 0, width: 300, turnSide: "left" },
    { type: "finish", x: 0, y: 500, heading: 0 },
  ]);

  // Through the start and the finish on the axis, swinging out to `side` at the turn pylon.
  const around = (side: number): [number, number][] => [
    [0, -600],
    [0, -400],
    [side, -300],
    [side, 300],
    [0, 400],
    [0, 600],
  ];

  it("passes when the pylon is kept on the required side", () => {
    const eng = new RaceEngine(withTurn);
    fly(eng, around(100)); // pylon on the left
    const s = eng.snapshot();
    expect(s.status).toBe("finished");
    expect(s.penalties).toEqual([]);
    expect(s.passes[1]!.offsetM).toBeCloseTo(100, 0);
  });

  it("is missed when flown on the wrong side", () => {
    const eng = new RaceEngine(withTurn);
    fly(eng, around(-100)); // pylon on the right
    expect(eng.snapshot().penalties.map((p) => p.kind)).toEqual(["missed-gate"]);
  });
});
