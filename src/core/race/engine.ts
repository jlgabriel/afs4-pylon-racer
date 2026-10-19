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
// Rules that judge HOW a gate was passed (attitude, height, pylon hit, turn cut) belong to v0.3. The
// engine already records the values they need at each pass (roll, altitude, AGL, offset).
import { courseRevision, raceSequence, type Course, type Gate } from "../course/course";
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

export type PenaltyKind = "missed-gate" | "wrong-direction";

export interface Penalty {
  kind: PenaltyKind;
  step: number;
  gateIndex: number;
  /** Race time (raw) at which it was assessed. */
  elapsed: number;
  seconds: number;
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
}

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

  constructor(course: Course) {
    this.course = course;
    this.revision = courseRevision(course);
    this.sequence = raceSequence(course);
    this.ref = centroid(course.gates.map((g) => g.center));
    this.lines = course.gates.map((g) => {
      const { a, b } = gatePassLine(g);
      return { a: toLocal(a, this.ref), b: toLocal(b, this.ref), fwd: forwardUnit(g.headingDeg), widthM: g.widthM };
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

    const p = toLocal(prev, this.ref);
    const c = toLocal(fix, this.ref);
    const move = { x: c.x - p.x, y: c.y - p.y };

    // Every gate line the segment crosses, in time order. Which of them count is decided per
    // crossing (findStep), because one sample can start the race and pass the next gates too.
    const crossings: { gateIndex: number; f: number; u: number; forward: boolean }[] = [];
    for (let gi = 0; gi < this.lines.length; gi++) {
      const line = this.lines[gi]!;
      const x = segmentIntersection(p, c, line.a, line.b);
      if (!x) continue;
      crossings.push({ gateIndex: gi, f: x.t, u: x.u, forward: move.x * line.fwd.x + move.y * line.fwd.y > 0 });
    }
    crossings.sort((a, b) => a.f - b.f);

    const events: RaceEvent[] = [];
    for (const x of crossings) {
      if (this.isOver()) break; // a crossing earlier in this same segment ended the race
      const at = interpolate(prev, fix, x.f);
      const line = this.lines[x.gateIndex]!;
      const offsetM = this.course.gates[x.gateIndex]!.type === "turn" ? x.u * line.widthM : (x.u - 0.5) * line.widthM;
      if (x.forward) {
        const step = this.findStep(x.gateIndex);
        if (step !== null) events.push(...this.handlePass(step, at, offsetM));
      } else if (this.status === "running" && this.sequence[this.step] === x.gateIndex && !this.wrongWayPenalized.has(this.step)) {
        this.wrongWayPenalized.add(this.step);
        events.push(this.addPenalty("wrong-direction", this.step, at.t));
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

  private findStep(gateIndex: number): number | null {
    if (this.status === "waiting") return gateIndex === this.sequence[0] ? 0 : null;
    for (let s = this.step; s < this.sequence.length; s++) if (this.sequence[s] === gateIndex) return s;
    return null;
  }

  private handlePass(step: number, at: Fix, offsetM: number): RaceEvent[] {
    const events: RaceEvent[] = [];
    if (this.status === "waiting") {
      this.startT = at.t;
      this.status = "running";
      const pass = this.makePass(0, at, offsetM);
      this.passes.push(pass);
      this.step = 1;
      events.push({ kind: "started", pass });
      return events;
    }

    for (let s = this.step; s < step; s++) {
      if (this.course.rules.missedGateIsDnf) {
        this.status = "dnf";
        this.endT = at.t;
        events.push({ kind: "dnf", reason: "missed-gate", elapsed: this.raw(at.t) });
        return events;
      }
      events.push(this.addPenalty("missed-gate", s, at.t));
    }

    const pass = this.makePass(step, at, offsetM);
    this.passes.push(pass);
    this.step = step + 1;
    events.push({ kind: "pass", pass });

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

  private addPenalty(kind: PenaltyKind, step: number, t: number): RaceEvent {
    const r = this.course.rules;
    const penalty: Penalty = {
      kind,
      step,
      gateIndex: this.sequence[step]!,
      elapsed: this.raw(t),
      seconds: kind === "missed-gate" ? r.missedGatePenaltyS : r.wrongDirectionPenaltyS,
    };
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
