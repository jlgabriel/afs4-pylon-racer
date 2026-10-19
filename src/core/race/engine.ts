// The race engine: gate passes, order, timing, penalties.
//
// A pass is detected geometrically: the aircraft's path segment (previous fix → current fix) is
// intersected with the gate line in a local planar frame. That does not depend on how close a
// sample fell to the gate, so it works at the ~5 Hz of the UDP feed (and at 1 Hz), and the pass
// instant is interpolated along the segment, so times are sub-sample.
//
// The race is a sequence of steps (course.raceSequence): one lap, repeated `laps` times, with the
// start line closing each lap of a multi-lap course. Passing a step further ahead than the current
// one counts every step in between as missed.
//
// How a gate was passed is judged at the pass instant (interpolated):
// - level / knife gates: the bank against the course's tolerance
// - any gate with a top: the height above the terrain (the sim's AGL, else MSL minus the gate's DEM)
// - pylons: flying closer than pylonHitRadiusM to a pylon's center, below its height, is a hit
//   (once per pylon and lap); checked on every segment, not only at passes
// - turn pylons: crossing the half-line on the WRONG side of the pylon still counts the step, with
//   the turn-cut penalty instead of a missed gate
// A height that cannot be known (no AGL from the source and no DEM at the gate) is never penalized.
import { courseRevision, raceSequence, type Course, type Gate, type Rules } from "../course/course";
import {
  centroid,
  forwardUnit,
  lerpAngle,
  pylonsOfGate,
  destination,
  segmentIntersection,
  toLocal,
  type LonLat,
  type Xy,
} from "../geo/geo";
import type { Fix } from "./fix";

export type RaceStatus = "waiting" | "running" | "finished" | "dnf";

export const PENALTY_KINDS = ["missed-gate", "wrong-direction", "attitude", "too-high", "pylon-hit", "turn-cut"] as const;
export type PenaltyKind = (typeof PENALTY_KINDS)[number];

export interface Penalty {
  kind: PenaltyKind;
  step: number;
  gateIndex: number;
  /** Race time (raw) at which it was assessed. */
  elapsed: number;
  seconds: number;
  /** What was measured: bank ° (attitude), m above the terrain (too-high), m from the pylon (pylon-hit). */
  measured: number | null;
}

export interface Pass {
  step: number;
  gateIndex: number;
  /** Lap this pass belongs to, 1-based (the closing start-line pass belongs to the lap it closes). */
  lap: number;
  /** Source time of the pass (interpolated). */
  t: number;
  /** Raw seconds since the start pass. */
  elapsed: number;
  altMslM: number;
  aglM: number | null;
  rollDeg: number;
  gsMs: number;
  /** Signed distance from the gate center along the gate line, meters (negative = left side). */
  offsetM: number;
}

export type RaceEvent =
  | { kind: "started"; pass: Pass }
  | { kind: "pass"; pass: Pass }
  | { kind: "lap"; lap: number; lapTime: number; pass: Pass }
  | { kind: "penalty"; penalty: Penalty }
  | { kind: "finished"; pass: Pass; total: number }
  | { kind: "dnf"; reason: string; elapsed: number };

export interface RaceSnapshot {
  courseId: string;
  revision: string;
  status: RaceStatus;
  /** Index into `sequence` of the next step to fly. */
  step: number;
  sequence: number[];
  laps: number;
  /** Current lap, 1-based (laps when finished). */
  lap: number;
  raw: number;
  penaltyTotal: number;
  total: number;
  passes: Pass[];
  penalties: Penalty[];
  lapTimes: number[];
}

interface GateLine {
  a: Xy;
  b: Xy;
  fwd: Xy;
  widthM: number;
  /** Turn pylons: the half-line on the wrong side of the pylon. */
  cut: { a: Xy; b: Xy } | null;
  /** Pylon positions: two for a gate, one for a turn pylon. */
  pylons: Xy[];
}

/** Something that happens along one path segment, at fraction f of it. */
type Happening =
  | { kind: "cross" | "cut"; gateIndex: number; f: number; u: number; forward: boolean }
  | { kind: "near"; gateIndex: number; pylon: number; f: number; distanceM: number };

/** Where a gate's pass line lies, in lon/lat. Shared with the map so what is drawn is what is judged. */
export function gatePassLine(g: Gate): { a: LonLat; b: LonLat } {
  if (g.type === "turn") {
    // A turn pylon is passed by crossing the half-line from the pylon out to the side the aircraft
    // must fly. Keeping the pylon on your LEFT means flying to its right.
    const side = g.turnSide === "left" ? 90 : -90;
    return { a: g.center, b: destination(g.center, g.widthM, g.headingDeg + side) };
  }
  const { left, right } = pylonsOfGate(g.center, g.widthM, g.headingDeg);
  return { a: left, b: right };
}

/** The wrong side of a turn pylon: the mirror of its pass line. */
export function turnCutLine(g: Gate): { a: LonLat; b: LonLat } {
  const side = g.turnSide === "left" ? -90 : 90;
  return { a: g.center, b: destination(g.center, g.widthM, g.headingDeg + side) };
}

/** Height above the terrain, or null when it cannot be known. */
export function heightAboveGround(f: Pick<Fix, "aglM" | "altMslM">, g: Pick<Gate, "groundElevM">): number | null {
  if (f.aglM !== null) return f.aglM;
  return g.groundElevM !== null ? f.altMslM - g.groundElevM : null;
}

export function penaltySeconds(r: Rules, kind: PenaltyKind): number {
  switch (kind) {
    case "missed-gate":
      return r.missedGatePenaltyS;
    case "wrong-direction":
      return r.wrongDirectionPenaltyS;
    case "attitude":
      return r.attitudePenaltyS;
    case "too-high":
      return r.tooHighPenaltyS;
    case "pylon-hit":
      return r.pylonHitPenaltyS;
    case "turn-cut":
      return r.turnCutPenaltyS;
  }
}

export class RaceEngine {
  readonly course: Course;
  readonly revision: string;
  readonly sequence: number[];
  readonly ref: LonLat;
  private readonly lines: GateLine[];

  private status: RaceStatus = "waiting";
  private step = 0;
  private prev: Fix | null = null;
  private last: Fix | null = null;
  private startT: number | null = null;
  private endT: number | null = null;
  private passes: Pass[] = [];
  private penalties: Penalty[] = [];
  private lapTimes: number[] = [];
  private lapStartElapsed = 0;
  private wrongWayPenalized = new Set<number>();
  private pylonsHit = new Set<string>();

  constructor(course: Course) {
    this.course = course;
    this.revision = courseRevision(course);
    this.sequence = raceSequence(course);
    this.ref = centroid(course.gates.map((g) => g.center));
    const local = (p: LonLat): Xy => toLocal(p, this.ref);
    this.lines = course.gates.map((g) => {
      const { a, b } = gatePassLine(g);
      const turn = g.type === "turn";
      const cut = turn ? turnCutLine(g) : null;
      const { left, right } = pylonsOfGate(g.center, g.widthM, g.headingDeg);
      return {
        a: local(a),
        b: local(b),
        fwd: forwardUnit(g.headingDeg),
        widthM: g.widthM,
        cut: cut ? { a: local(cut.a), b: local(cut.b) } : null,
        pylons: turn ? [local(g.center)] : [local(left), local(right)],
      };
    });
  }

  reset(): void {
    this.status = "waiting";
    this.step = 0;
    this.prev = null;
    this.last = null;
    this.startT = null;
    this.endT = null;
    this.passes = [];
    this.penalties = [];
    this.lapTimes = [];
    this.lapStartElapsed = 0;
    this.wrongWayPenalized = new Set();
    this.pylonsHit = new Set();
  }

  get raceStatus(): RaceStatus {
    return this.status;
  }

  /** Index of the gate the pilot should fly next, or null when the race is over. */
  get nextGateIndex(): number | null {
    if (this.status === "finished" || this.status === "dnf") return null;
    return this.sequence[this.step] ?? null;
  }

  raw(nowT?: number): number {
    if (this.startT === null) return 0;
    const end = this.endT ?? nowT ?? this.last?.t ?? this.startT;
    return Math.max(0, end - this.startT);
  }

  penaltyTotal(): number {
    return this.penalties.reduce((s, p) => s + p.seconds, 0);
  }

  total(nowT?: number): number {
    return this.raw(nowT) + this.penaltyTotal();
  }

  /** Feed one fix; returns the events it produced, in time order. */
  update(fix: Fix): RaceEvent[] {
    const prev = this.prev;
    if (prev !== null && fix.t <= prev.t) return []; // duplicate or out-of-order sample
    this.last = fix;
    this.prev = fix;
    if (prev === null || this.status === "finished" || this.status === "dnf") return [];

    // Which crossings count is decided one by one, in time order, because one sample can start the
    // race and pass the next gates too.
    const events: RaceEvent[] = [];
    for (const h of this.happenings(toLocal(prev, this.ref), toLocal(fix, this.ref))) {
      if (this.isOver()) break; // something earlier in this same segment ended the race
      const at = interpolate(prev, fix, h.f);
      if (h.kind === "near") {
        events.push(...this.judgeNearPylon(h.gateIndex, h.pylon, h.distanceM, at));
        continue;
      }
      const line = this.lines[h.gateIndex]!;
      if (h.kind === "cut") {
        if (h.forward && this.status === "running" && this.sequence[this.step] === h.gateIndex) {
          events.push(...this.handlePass(this.step, at, -h.u * line.widthM, true));
        }
      } else if (h.forward) {
        const turn = this.course.gates[h.gateIndex]!.type === "turn";
        const offsetM = turn ? h.u * line.widthM : (h.u - 0.5) * line.widthM;
        const step = this.findStep(h.gateIndex);
        if (step !== null) events.push(...this.handlePass(step, at, offsetM, false));
      } else if (this.status === "running" && this.sequence[this.step] === h.gateIndex && !this.wrongWayPenalized.has(this.step)) {
        this.wrongWayPenalized.add(this.step);
        events.push(this.addPenalty("wrong-direction", this.step, h.gateIndex, at.t, null));
      }
    }
    return events;
  }

  snapshot(nowT?: number): RaceSnapshot {
    const lap = Math.min(this.course.laps, this.lapTimes.length + 1);
    return {
      courseId: this.course.id,
      revision: this.revision,
      status: this.status,
      step: this.step,
      sequence: this.sequence,
      laps: this.course.laps,
      lap,
      raw: this.raw(nowT),
      penaltyTotal: this.penaltyTotal(),
      total: this.total(nowT),
      passes: [...this.passes],
      penalties: [...this.penalties],
      lapTimes: [...this.lapTimes],
    };
  }

  // ------------------------------------------------------------------------------------------------

  private isOver(): boolean {
    return this.status === "finished" || this.status === "dnf";
  }

  /** Every line crossed and every close pass of a pylon along p→c, in time order. */
  private happenings(p: Xy, c: Xy): Happening[] {
    const move = { x: c.x - p.x, y: c.y - p.y };
    const len2 = move.x * move.x + move.y * move.y;
    const radius = this.course.rules.pylonHitRadiusM;
    const out: Happening[] = [];
    for (let gi = 0; gi < this.lines.length; gi++) {
      const line = this.lines[gi]!;
      const forward = move.x * line.fwd.x + move.y * line.fwd.y > 0;
      const x = segmentIntersection(p, c, line.a, line.b);
      if (x) out.push({ kind: "cross", gateIndex: gi, f: x.t, u: x.u, forward });
      if (line.cut) {
        const y = segmentIntersection(p, c, line.cut.a, line.cut.b);
        if (y) out.push({ kind: "cut", gateIndex: gi, f: y.t, u: y.u, forward });
      }
      line.pylons.forEach((q, pylon) => {
        // closest approach of the segment to the pylon
        const f = len2 > 0 ? Math.max(0, Math.min(1, ((q.x - p.x) * move.x + (q.y - p.y) * move.y) / len2)) : 0;
        const d = Math.hypot(p.x + f * move.x - q.x, p.y + f * move.y - q.y);
        if (d < radius) out.push({ kind: "near", gateIndex: gi, pylon, f, distanceM: d });
      });
    }
    return out.sort((a, b) => a.f - b.f);
  }

  private findStep(gateIndex: number): number | null {
    if (this.status === "waiting") return gateIndex === this.sequence[0] ? 0 : null;
    for (let s = this.step; s < this.sequence.length; s++) if (this.sequence[s] === gateIndex) return s;
    return null;
  }

  private handlePass(step: number, at: Fix, offsetM: number, cut: boolean): RaceEvent[] {
    const events: RaceEvent[] = [];
    if (this.status === "waiting") {
      this.startT = at.t;
      this.status = "running";
      const pass = this.makePass(0, at, offsetM);
      this.passes.push(pass);
      this.step = 1;
      events.push({ kind: "started", pass }, ...this.judgePass(pass, at));
      return events;
    }

    for (let s = this.step; s < step; s++) {
      if (this.course.rules.missedGateIsDnf) {
        this.status = "dnf";
        this.endT = at.t;
        events.push({ kind: "dnf", reason: "missed-gate", elapsed: this.raw(at.t) });
        return events;
      }
      events.push(this.addPenalty("missed-gate", s, this.sequence[s]!, at.t, null));
    }

    const pass = this.makePass(step, at, offsetM);
    this.passes.push(pass);
    this.step = step + 1;
    events.push({ kind: "pass", pass });
    if (cut) events.push(this.addPenalty("turn-cut", step, pass.gateIndex, at.t, null));
    events.push(...this.judgePass(pass, at));

    const closesLap = this.course.laps > 1 && step > 0 && this.sequence[step] === 0;
    if (closesLap) {
      const lapTime = pass.elapsed - this.lapStartElapsed;
      this.lapStartElapsed = pass.elapsed;
      this.lapTimes.push(lapTime);
      events.push({ kind: "lap", lap: this.lapTimes.length, lapTime, pass });
    } else if (this.course.laps === 1 && step === this.sequence.length - 1) {
      this.lapTimes.push(pass.elapsed);
    }

    if (this.step >= this.sequence.length) {
      this.status = "finished";
      this.endT = at.t;
      events.push({ kind: "finished", pass, total: this.total() });
    }
    return events;
  }

  /** Attitude and height at a pass. */
  private judgePass(pass: Pass, at: Fix): RaceEvent[] {
    const gate = this.course.gates[pass.gateIndex]!;
    const r = this.course.rules;
    const events: RaceEvent[] = [];
    const bank = Math.abs(pass.rollDeg);
    const wrongAttitude =
      (gate.type === "level" && bank > r.levelToleranceDeg) || (gate.type === "knife" && Math.abs(bank - 90) > r.knifeToleranceDeg);
    if (wrongAttitude) events.push(this.addPenalty("attitude", pass.step, pass.gateIndex, at.t, pass.rollDeg));
    const height = heightAboveGround(at, gate);
    if (gate.topM !== null && height !== null && height > gate.topM) {
      events.push(this.addPenalty("too-high", pass.step, pass.gateIndex, at.t, height));
    }
    return events;
  }

  /** A close pass of a pylon while racing: a hit unless above the pylon. Once per pylon and lap. */
  private judgeNearPylon(gateIndex: number, pylon: number, distanceM: number, at: Fix): RaceEvent[] {
    if (this.status !== "running") return [];
    const height = heightAboveGround(at, this.course.gates[gateIndex]!);
    if (height !== null && height >= this.course.rules.pylonHeightM) return [];
    const lap = Math.min(this.course.laps, this.lapTimes.length + 1);
    const key = `${gateIndex}:${pylon}:${lap}`;
    if (this.pylonsHit.has(key)) return [];
    this.pylonsHit.add(key);
    return [this.addPenalty("pylon-hit", Math.min(this.step, this.sequence.length - 1), gateIndex, at.t, distanceM)];
  }

  private makePass(step: number, at: Fix, offsetM: number): Pass {
    return {
      step,
      gateIndex: this.sequence[step]!,
      lap: Math.min(this.course.laps, this.lapTimes.length + 1),
      t: at.t,
      elapsed: this.startT === null ? 0 : at.t - this.startT,
      altMslM: at.altMslM,
      aglM: at.aglM,
      rollDeg: at.rollDeg,
      gsMs: at.gsMs,
      offsetM,
    };
  }

  private addPenalty(kind: PenaltyKind, step: number, gateIndex: number, t: number, measured: number | null): RaceEvent {
    const penalty: Penalty = { kind, step, gateIndex, elapsed: this.raw(t), seconds: penaltySeconds(this.course.rules, kind), measured };
    this.penalties.push(penalty);
    return { kind: "penalty", penalty };
  }
}

/** The aircraft state a fraction f of the way from a to b. Angles take the short way round. */
export function interpolate(a: Fix, b: Fix, f: number): Fix {
  const lin = (x: number, y: number): number => x + (y - x) * f;
  return {
    t: lin(a.t, b.t),
    lon: lin(a.lon, b.lon),
    lat: lin(a.lat, b.lat),
    altMslM: lin(a.altMslM, b.altMslM),
    aglM: a.aglM !== null && b.aglM !== null ? lin(a.aglM, b.aglM) : (b.aglM ?? a.aglM),
    trackDeg: lerpAngle(a.trackDeg, b.trackDeg, f),
    gsMs: lin(a.gsMs, b.gsMs),
    headingDeg: lerpAngle(a.headingDeg, b.headingDeg, f),
    pitchDeg: lin(a.pitchDeg, b.pitchDeg),
    rollDeg: lerpAngle(a.rollDeg, b.rollDeg, f),
  };
}
