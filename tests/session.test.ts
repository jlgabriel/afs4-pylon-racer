import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importRctCourse } from "../src/core/course/importRct";
import { demoFlight } from "../src/core/demo/demoFlight";
import { sampleCourses } from "../src/core/demo/sampleCourses";
import { haversine } from "../src/core/geo/geo";
import { parseRun, Recorder, TRACK_FIELDS } from "../src/core/run/run";
import { RaceSession, type SessionContext } from "../src/core/session/raceSession";
import { fixAt } from "./helpers";

const munich = importRctCourse(
  JSON.parse(readFileSync(new URL("fixtures/munich_multicolor.json", import.meta.url), "utf8")),
  "2026-10-18T00:00:00Z",
);

const ctx: SessionContext = {
  pilot: "Tester",
  appVersion: "0.1.0",
  newId: () => "run-1",
  nowIso: () => "2026-10-18T12:00:00Z",
};

describe("the demo flight", () => {
  it.each([1, 5, 40])("races the course cleanly at %d Hz with the same time", (rateHz) => {
    const session = new RaceSession(munich, ctx);
    let run = null;
    for (const f of demoFlight(munich, { speedMs: 80, rateHz })) {
      run = session.feed(f, { kind: "demo", hz: rateHz, aircraft: "extra330" }).run ?? run;
    }
    expect(run).not.toBeNull();
    const start = munich.gates[0]!.center;
    const finish = munich.gates[munich.gates.length - 1]!.center;
    expect(run!.result.status).toBe("finished");
    expect(run!.result.penaltyTotal).toBe(0);
    expect(run!.result.raw).toBeCloseTo(haversine(start, finish) / 80, 1);
  });
});

describe("the seeded sample courses", () => {
  it.each(sampleCourses().map((c) => [c.name, c] as const))("%s is flown cleanly by the demo", (_name, course) => {
    const session = new RaceSession(course, ctx);
    let run = null;
    for (const f of demoFlight(course, { rateHz: 5 })) run = session.feed(f, { kind: "demo", hz: 5, aircraft: null }).run ?? run;
    expect(run?.result.status).toBe("finished");
    expect(run?.result.penaltyTotal).toBe(0);
    expect(run?.result.lapTimes).toHaveLength(course.laps);
  });
});

describe("a finished session becomes a valid run", () => {
  it("carries the course, aircraft class, source and a track", () => {
    const session = new RaceSession(munich, ctx);
    let run = null;
    for (const f of demoFlight(munich, { rateHz: 10 })) {
      run = session.feed(f, { kind: "reader", hz: 40, aircraft: "extra330" }).run ?? run;
    }
    const parsed = parseRun(JSON.parse(JSON.stringify(run)));
    expect(parsed).toMatchObject({
      id: "run-1",
      courseId: "munich-multicolor",
      courseName: "Munich Multicolor (pylon test)",
      pilot: "Tester",
      aircraft: { id: "extra330", classId: "aerobatic" },
      source: { kind: "reader", hz: 40 },
      startedAt: "2026-10-18T12:00:00Z",
    });
    expect(parsed.passes).toHaveLength(5);
    expect(parsed.track.fields).toEqual([...TRACK_FIELDS]);
    expect(parsed.track.samples.length).toBeGreaterThan(50);
  });

  it("produces the run exactly once", () => {
    const session = new RaceSession(munich, ctx);
    const runs = demoFlight(munich).map((f) => session.feed(f, { kind: "demo", hz: 10, aircraft: null }).run);
    expect(runs.filter(Boolean)).toHaveLength(1);
  });
});

describe("the recorder", () => {
  it("keeps a short pre-roll and everything after the start", () => {
    const r = new Recorder(3, 0);
    for (let t = 0; t < 10; t++) r.push(fixAt(0, t, t), false);
    r.push(fixAt(0, 10, 10), true);
    r.push(fixAt(0, 11, 11), true);
    expect(r.track().map((f) => f.t)).toEqual([7, 8, 9, 10, 11]);
  });

  it("thins samples closer than its spacing", () => {
    const r = new Recorder(0, 0.1);
    for (let i = 0; i <= 40; i++) r.push(fixAt(0, i, i * 0.025), true);
    expect(r.track()).toHaveLength(11);
  });
});
