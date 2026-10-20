// The words for the rules: what a gate asks of the pilot, and why a penalty was given.
import type { Course, Gate } from "../../core/course/course";
import type { Penalty } from "../../core/race/engine";

/** The side of a turn pylon to fly by: keeping it on your left means passing to its right. "Pass to
 *  its right" says what to DO; "keep it on your left" had to be translated in the air (flight test,
 *  2026-10-19). */
export function passSide(g: Gate): "left" | "right" {
  return (g.turnSide ?? "left") === "left" ? "right" : "left";
}

const deg = (v: number): string => `${Math.round(v)}°`;
const m = (v: number): string => `${Math.round(v)} m`;

/** What passing this gate requires, beyond flying through it the right way. Empty = nothing more. */
export function gateRequirements(g: Gate, course: Course): string[] {
  const r = course.rules;
  const out: string[] = [];
  if (g.type === "level") out.push(`wings level, ±${deg(r.levelToleranceDeg)}`);
  if (g.type === "knife") out.push(`knife edge, 90° ±${deg(r.knifeToleranceDeg)}`);
  if (g.type === "turn") out.push(`pass to the ${passSide(g)} of the pylon`);
  if (g.topM !== null) out.push(`below ${m(g.topM)}`);
  return out;
}

/** Why a penalty was given, with what was measured. */
export function penaltyReason(p: Penalty, course: Course): string {
  const g = course.gates[p.gateIndex];
  const r = course.rules;
  switch (p.kind) {
    case "missed-gate":
      return "missed";
    case "wrong-direction":
      return "flown the wrong way";
    case "attitude":
      if (g?.type === "knife") return `not knife edge: bank ${measured(p, deg)} (needs 90° ±${deg(r.knifeToleranceDeg)})`;
      return `wings not level: bank ${measured(p, deg)} (max ±${deg(r.levelToleranceDeg)})`;
    case "too-high":
      return `too high: ${measured(p, m)}${g?.topM != null ? ` (max ${m(g.topM)})` : ""}`;
    case "pylon-hit":
      return `pylon hit: ${p.measured !== null ? `${p.measured.toFixed(1)} m` : "?"} from its center`;
    case "turn-cut":
      if (!g) return "turn pylon cut";
      return `turn pylon cut: passed to its ${passSide(g) === "right" ? "left" : "right"} (pass to its ${passSide(g)})`;
  }
}

function measured(p: Penalty, fmt: (v: number) => string): string {
  return p.measured !== null ? fmt(p.measured) : "?";
}
