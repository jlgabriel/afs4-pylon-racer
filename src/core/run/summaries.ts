// Small views over courses and runs for lists. Pure, shared by main and the preview's mock bridge.
import { courseRevision, raceSequence, type Course } from "../course/course";
import { haversine } from "../geo/geo";
import type { CourseSummary, RunSummary } from "../../shared/racerApi";
import type { Run } from "./run";

/** `imported`: the run came from a .pylonrun (another pilot's, or one of ours shared back). */
export function summarizeRun(r: Run, imported = false): RunSummary {
  return {
    id: r.id,
    imported,
    courseId: r.courseId,
    courseRevision: r.courseRevision,
    status: r.result.status,
    dnfReason: r.result.dnfReason,
    total: r.result.total,
    raw: r.result.raw,
    penaltyTotal: r.result.penaltyTotal,
    aircraftId: r.aircraft.id,
    classId: r.aircraft.classId,
    source: r.source.kind,
    sourceHz: r.source.hz,
    pilot: r.pilot,
    startedAt: r.startedAt,
  };
}

/** Length of one lap through the gate centers. */
export function lapLength(c: Course): number {
  const seq = raceSequence({ gates: c.gates, laps: 1 });
  if (c.laps > 1) seq.push(0);
  let len = 0;
  for (let i = 1; i < seq.length; i++) len += haversine(c.gates[seq[i - 1]!]!.center, c.gates[seq[i]!]!.center);
  return len;
}

export interface InstalledRef {
  courseId: string;
  revision: string;
  folderName: string;
}

export function summarizeCourse(c: Course, runs: readonly RunSummary[], installed: readonly InstalledRef[] = []): CourseSummary {
  const revision = courseRevision(c);
  const mine = runs.filter((r) => r.courseId === c.id && r.courseRevision === revision);
  const finished = mine.filter((r) => r.status === "finished" && !r.imported).map((r) => r.total);
  const poi = installed.find((p) => p.courseId === c.id);
  return {
    install: poi
      ? { state: poi.revision === revision ? "current" : "outdated", folderName: poi.folderName }
      : { state: "none", folderName: null },
    id: c.id,
    name: c.name,
    author: c.author,
    gates: c.gates.length,
    laps: c.laps,
    revision,
    lapLengthM: lapLength(c),
    bestTotal: finished.length > 0 ? Math.min(...finished) : null,
    runs: mine.length,
  };
}

/** Runs of a course revision, best first: finished by total, then DNFs by date. */
export function rankRuns(runs: readonly RunSummary[]): RunSummary[] {
  return [...runs].sort((a, b) => {
    if (a.status !== b.status) return a.status === "finished" ? -1 : 1;
    if (a.status === "finished") return a.total - b.total;
    return b.startedAt.localeCompare(a.startedAt);
  });
}
