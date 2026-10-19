import { describe, expect, it } from "vitest";
import { parseCourse } from "../src/core/course/course";
import {
  addGate,
  draftProblem,
  headingFromHandle,
  moveGate,
  moveGateInOrder,
  newDraft,
  removeGate,
  setKind,
  setLaps,
  widthFromPylon,
} from "../src/core/course/edit";
import { destination } from "../src/core/geo/geo";

const at = (x: number) => destination({ lon: -116.8, lat: 34.85 }, x, 270);

function threeGates() {
  let d = newDraft("c1", "Tester", "2026-10-18T00:00:00Z");
  d = addGate(d, at(0));
  d = addGate(d, at(600));
  return addGate(d, at(1200));
}

describe("building a course on the map", () => {
  it("assigns start and finish by position as gates are added", () => {
    let d = newDraft("c1", "Tester", "2026-10-18T00:00:00Z");
    d = addGate(d, at(0));
    expect(d.gates.map((g) => g.type)).toEqual(["start"]);
    expect(draftProblem(d)).toMatch(/at least two/);
    d = addGate(d, at(600));
    expect(d.gates.map((g) => g.type)).toEqual(["start", "finish"]);
    d = addGate(d, at(1200));
    expect(d.gates.map((g) => g.type)).toEqual(["start", "gate", "finish"]);
    expect(draftProblem(d)).toBeNull();
    expect(() => parseCourse(d)).not.toThrow();
  });

  it("faces each new gate away from the previous one, and the start toward the second", () => {
    const d = threeGates();
    expect(d.gates.map((g) => g.headingDeg)).toEqual([270, 270, 270]);
  });

  it("keeps roles right when gates are removed or reordered", () => {
    let d = threeGates();
    const [a, , c] = d.gates;
    d = moveGateInOrder(d, c!.id, -1);
    expect(d.gates.map((g) => g.type)).toEqual(["start", "gate", "finish"]);
    d = removeGate(d, a!.id);
    expect(d.gates.map((g) => g.type)).toEqual(["start", "finish"]);
  });

  it("drops the finish on a multi-lap course and brings it back for one lap", () => {
    let d = setLaps(threeGates(), 3);
    expect(d.gates.map((g) => g.type)).toEqual(["start", "gate", "gate"]);
    expect(draftProblem(d)).toBeNull();
    d = setLaps(d, 1);
    expect(d.gates.map((g) => g.type)).toEqual(["start", "gate", "finish"]);
  });

  it("a turn pylon gets a side; another kind clears it", () => {
    let d = threeGates();
    const mid = d.gates[1]!.id;
    d = setKind(d, mid, "turn");
    expect(d.gates[1]).toMatchObject({ type: "turn", turnSide: "left" });
    d = setKind(d, mid, "knife");
    expect(d.gates[1]).toMatchObject({ type: "knife", turnSide: null });
  });

  it("moving a gate forgets its terrain elevation", () => {
    let d = threeGates();
    d = { ...d, gates: d.gates.map((g) => ({ ...g, groundElevM: 588 })) };
    d = moveGate(d, d.gates[1]!.id, at(650));
    expect(d.gates.map((g) => g.groundElevM)).toEqual([588, null, 588]);
  });
});

describe("handles", () => {
  const center = { lon: -116.8, lat: 34.85 };

  it("the heading handle sets the heading toward it", () => {
    expect(headingFromHandle(center, destination(center, 100, 123))).toBe(123);
  });

  it("dragging a pylon sets the width along the gate line only", () => {
    // Gate faces north: the line runs east-west. 50 m east and 30 m north → width 100.
    const p = destination(destination(center, 50, 90), 30, 0);
    expect(widthFromPylon(center, 0, p)).toBe(100);
    expect(widthFromPylon(center, 0, destination(center, 2, 90))).toBe(10);
  });
});
