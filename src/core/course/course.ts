// The course (pista): the shared document between the designer, the scenery exporter and the race
// engine. Validated with zod on every way in (disk, import, IPC) — the engine assumes a valid course.
//
// Gate roles are positional and checked here, so the engine never sees an impossible course:
// - gates[0] is always the start.
// - laps === 1: the last gate is the finish; no other finish/start.
// - laps > 1: there is NO finish gate — the start line closes each lap and the race ends on the
//   start-line crossing that completes the last lap.
import { z } from "zod";

export const COURSE_FORMAT = "pylon-racer/course";
export const COURSE_VERSION = 1;

export const GATE_TYPES = ["start", "finish", "gate", "level", "knife", "turn"] as const;
export type GateType = (typeof GATE_TYPES)[number];

const lonLat = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

export const gateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(GATE_TYPES),
  center: lonLat,
  /** Distance between the two pylons (ignored for `turn`, which is a single pylon). */
  widthM: z.number().positive(),
  /** Direction of a correct pass through the gate, compass degrees. */
  headingDeg: z.number(),
  /** Pylon model id; null = the default for the gate type. */
  pylon: z.string().nullable().default(null),
  /** Terrain elevation at the gate center (DEM), meters MSL; null = unknown. */
  groundElevM: z.number().nullable().default(null),
  /** Highest allowed pass above the terrain, meters; null = no limit. */
  topM: z.number().positive().nullable().default(null),
  /** `turn` only: the side the pylon must be kept on. */
  turnSide: z.enum(["left", "right"]).nullable().default(null),
});
export type Gate = z.infer<typeof gateSchema>;

export const rulesSchema = z.object({
  missedGatePenaltyS: z.number().min(0).default(10),
  /** A missed gate ends the run instead of adding time. */
  missedGateIsDnf: z.boolean().default(false),
  wrongDirectionPenaltyS: z.number().min(0).default(10),
  attitudePenaltyS: z.number().min(0).default(2),
  tooHighPenaltyS: z.number().min(0).default(2),
  pylonHitPenaltyS: z.number().min(0).default(3),
  turnCutPenaltyS: z.number().min(0).default(10),
  levelToleranceDeg: z.number().min(0).max(90).default(10),
  knifeToleranceDeg: z.number().min(0).max(90).default(15),
});
export type Rules = z.infer<typeof rulesSchema>;

export const medalsSchema = z.object({
  gold: z.number().positive(),
  silver: z.number().positive(),
  bronze: z.number().positive(),
});

export const courseSchema = z
  .object({
    format: z.literal(COURSE_FORMAT),
    version: z.literal(COURSE_VERSION),
    id: z.string().min(1),
    name: z.string().min(1),
    author: z.string().default(""),
    description: z.string().default(""),
    createdAt: z.string(),
    updatedAt: z.string(),
    laps: z.number().int().min(1).max(50).default(1),
    gates: z.array(gateSchema).min(2),
    rules: rulesSchema.default(rulesSchema.parse({})),
    /** Medal times per aircraft class id. */
    medals: z.record(z.string(), medalsSchema).default({}),
  })
  .superRefine((c, ctx) => {
    const problem = gateRoleProblem(c.gates, c.laps);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["gates"] });
    const ids = new Set<string>();
    for (const g of c.gates) {
      if (ids.has(g.id)) ctx.addIssue({ code: "custom", message: `Duplicate gate id ${g.id}`, path: ["gates"] });
      ids.add(g.id);
    }
  });
export type Course = z.infer<typeof courseSchema>;

/** Why this gate sequence cannot be raced, or null if it can. */
export function gateRoleProblem(gates: readonly Pick<Gate, "type">[], laps: number): string | null {
  if (gates.length < 2) return "A course needs at least two gates";
  if (gates[0]?.type !== "start") return "The first gate must be the start";
  const starts = gates.filter((g) => g.type === "start").length;
  if (starts !== 1) return "A course has exactly one start gate";
  const finishes = gates.filter((g) => g.type === "finish").length;
  if (laps === 1) {
    if (gates[gates.length - 1]?.type !== "finish") return "The last gate must be the finish";
    if (finishes !== 1) return "A single-lap course has exactly one finish gate";
  } else if (finishes !== 0) {
    return "A multi-lap course has no finish gate: the start line closes every lap";
  }
  return null;
}

/** Parse untrusted JSON into a Course (throws ZodError). */
export function parseCourse(data: unknown): Course {
  return courseSchema.parse(data);
}

/**
 * The text that decides the course revision: everything that changes how a run is scored, nothing
 * cosmetic (name, description, medals). Two runs are comparable only on the same revision. Keys
 * are emitted in a fixed order so the same course always gives the same string.
 */
export function revisionInput(c: Course): string {
  const r = c.rules;
  const rules = [
    r.missedGatePenaltyS,
    r.missedGateIsDnf,
    r.wrongDirectionPenaltyS,
    r.attitudePenaltyS,
    r.tooHighPenaltyS,
    r.pylonHitPenaltyS,
    r.turnCutPenaltyS,
    r.levelToleranceDeg,
    r.knifeToleranceDeg,
  ];
  const gates = c.gates.map((g) => [
    g.type,
    g.center.lon.toFixed(7),
    g.center.lat.toFixed(7),
    g.widthM.toFixed(2),
    g.headingDeg.toFixed(2),
    g.topM === null ? null : g.topM.toFixed(2),
    g.groundElevM === null ? null : g.groundElevM.toFixed(2),
    g.turnSide,
  ]);
  return JSON.stringify({ laps: c.laps, rules, gates });
}

/** Short, stable revision id (FNV-1a 64-bit, hex). Not a security hash — it only detects change. */
export function courseRevision(c: Course): string {
  return fnv1a64(revisionInput(c));
}

export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/** The gate the pilot must aim for at each step of a race: one lap expanded `laps` times. */
export function raceSequence(c: Pick<Course, "gates" | "laps">): number[] {
  const n = c.gates.length;
  if (c.laps === 1) return Array.from({ length: n }, (_, i) => i);
  const seq = [0];
  for (let lap = 0; lap < c.laps; lap++) {
    for (let i = 1; i < n; i++) seq.push(i);
    seq.push(0);
  }
  return seq;
}
