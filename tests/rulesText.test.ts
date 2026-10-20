import { describe, expect, it } from "vitest";
import { sampleCourses } from "../src/core/demo/sampleCourses";
import { gateRequirements, penaltyReason } from "../src/renderer/race/rulesText";

const rules = sampleCourses().find((c) => c.id === "kdag-rules-test")!;

describe("rules text", () => {
  it("tells which side of a turn pylon to fly by, not which side to keep it on", () => {
    // Kept on the left = flown by on its right (flight test 2026-10-19: the old words confused).
    const turn = rules.gates[3]!;
    expect(gateRequirements(turn, rules)).toEqual(["pass to the right of the pylon"]);
    const cut = { kind: "turn-cut", step: 3, gateIndex: 3, elapsed: 19, seconds: 10, measured: null } as const;
    expect(penaltyReason(cut, rules)).toBe("turn pylon cut: passed to its left (pass to its right)");
  });
});
