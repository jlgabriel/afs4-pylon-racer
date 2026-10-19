// The ONE typed contract between the sandboxed renderer and Electron main. Types only — safe to
// import from main, preload and renderer.
//
// Rules:
// 1. A thrown error does not survive ipcRenderer.invoke intact, so calls that can fail in an
//    expected way return a RacerResult with a discriminated error code.
// 2. No file path travels from the renderer into main. The renderer says WHAT (import a course),
//    main decides WHERE through its own dialogs.
// Adding a method = its type here + the preload + a handler in main/ipc.ts (channel "racer:<name>").
import type { Course } from "../core/course/course";
import type { LiveState } from "../core/session/raceSession";
import type { Run, SourceKind } from "../core/run/run";

export type RacerError =
  | { code: "cancelled"; message: string }
  | { code: "invalid-course"; message: string }
  | { code: "not-found"; message: string }
  | { code: "io"; message: string };

export type RacerResult<T> = { ok: true; value: T } | { ok: false; error: RacerError };

export interface CourseSummary {
  id: string;
  name: string;
  author: string;
  gates: number;
  laps: number;
  revision: string;
  /** Length of one lap through the gate centers, meters. */
  lapLengthM: number;
  /** Best finished total on this revision, seconds; null when none yet. */
  bestTotal: number | null;
  runs: number;
}

export interface RunSummary {
  id: string;
  courseId: string;
  courseRevision: string;
  status: Run["result"]["status"];
  total: number;
  raw: number;
  penaltyTotal: number;
  aircraftId: string | null;
  classId: string | null;
  source: SourceKind;
  sourceHz: number;
  pilot: string;
  startedAt: string;
}

export interface SourceStatus {
  /** Seconds since the last usable fix; null = never. */
  ageS: number | null;
  hz: number;
  /** A transport-level problem (port taken, connection refused…), if any. */
  error: string | null;
}

export interface TelemetryStatus {
  /** The source currently feeding the race, if any. */
  active: SourceKind | null;
  aircraft: string | null;
  udp: SourceStatus;
  reader: SourceStatus & { connected: boolean };
  demo: { running: boolean };
}

export interface LiveUpdate {
  telemetry: TelemetryStatus;
  /** Null while no course is selected. */
  live: LiveState | null;
}

export interface AppInfo {
  version: string;
  pilot: string;
}

export interface RacerApi {
  getAppInfo(): Promise<AppInfo>;
  setPilot(name: string): Promise<AppInfo>;

  listCourses(): Promise<CourseSummary[]>;
  getCourse(id: string): Promise<RacerResult<Course>>;
  /** Opens a file dialog; accepts native courses and the old pylon-race tool's course.json. */
  importCourse(): Promise<RacerResult<CourseSummary>>;

  /** Makes this the active course and arms a fresh attempt. */
  selectCourse(id: string): Promise<RacerResult<CourseSummary>>;
  /** Discards the current attempt and arms a new one on the same course. */
  resetRace(): Promise<void>;

  /** Flies the active course with a synthetic aircraft (no simulator needed). */
  startDemo(): Promise<RacerResult<void>>;
  stopDemo(): Promise<void>;

  listRuns(courseId: string): Promise<RunSummary[]>;
  getRun(id: string): Promise<RacerResult<Run>>;

  /** Live state, pushed by main at up to ~20 Hz. Returns an unsubscribe function. */
  onLive(listener: (u: LiveUpdate) => void): () => void;
  /** A run was just finished and saved. */
  onRunSaved(listener: (r: RunSummary) => void): () => void;
}
