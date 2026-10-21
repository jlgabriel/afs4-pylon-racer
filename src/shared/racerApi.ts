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
  | { code: "afs4-not-found"; message: string; dir: string }
  | { code: "network"; message: string }
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
  /** Your best finished total on this revision (imported runs aside), seconds; null when none yet. */
  bestTotal: number | null;
  runs: number;
  /** Whether its pylons are installed in AFS4, and from which revision of the course. */
  install: { state: "none" | "current" | "outdated"; folderName: string | null };
}

export interface PlaceHit {
  label: string;
  lon: number;
  lat: number;
}

export interface SaveResult {
  course: CourseSummary;
  /** Non-fatal problems, e.g. the terrain elevation could not be fetched. */
  warnings: string[];
}

export interface RunSummary {
  id: string;
  /** Came from a .pylonrun file rather than flown here. */
  imported: boolean;
  courseId: string;
  courseRevision: string;
  status: Run["result"]["status"];
  dnfReason: Run["result"]["dnfReason"];
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

/** What an import did, file by file. */
export interface ImportReport {
  /** The course to show afterwards (the last course imported, or the course of the last run). */
  courseId: string | null;
  /** One line per file, e.g. "Daggett Sprint: course added." */
  lines: string[];
  /** Files that could not be imported (their lines say why). */
  failed: number;
}

/** A file dropped on the window: its name and bytes (never its path). */
export interface DroppedFile {
  name: string;
  data: Uint8Array;
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
  /** The AFS4 user folder pylons are installed into, and whether it exists. */
  afs4Dir: string;
  afs4DirFound: boolean;
  /** The course selected last time, to reopen it. */
  lastCourseId: string | null;
  prefs: Prefs;
}

export interface Prefs {
  /** The window stays above other windows, the simulator included. */
  onTop: boolean;
}

export interface RacerApi {
  getAppInfo(): Promise<AppInfo>;
  setPilot(name: string): Promise<AppInfo>;
  /** Opens a folder dialog to pick the AFS4 user folder (the one holding scenery/). */
  chooseAfs4Dir(): Promise<AppInfo>;
  /** Changes some of the preferences; main applies "on top" to the window itself. */
  setPrefs(patch: Partial<Prefs>): Promise<AppInfo>;

  listCourses(): Promise<CourseSummary[]>;
  getCourse(id: string): Promise<RacerResult<Course>>;
  /** Opens a file dialog for .pylonrace, .pylonrun and .json files (native courses and runs, and the
   *  old pylon-race tool's course.json). */
  importFiles(): Promise<RacerResult<ImportReport>>;
  /** Imports files dropped on the window, sent as bytes. */
  importDropped(files: DroppedFile[]): Promise<RacerResult<ImportReport>>;
  /** Saves the course as a .pylonrace through a save dialog; returns the file name. */
  exportCourse(id: string): Promise<RacerResult<string>>;
  /** Validates and stores a course from the designer. An empty id means a new course. Gates with
   *  no terrain elevation get one looked up. */
  saveCourse(draft: Course): Promise<RacerResult<SaveResult>>;
  duplicateCourse(id: string): Promise<RacerResult<CourseSummary>>;
  /** Deletes the course file and its installed pylons. Its runs are kept. */
  deleteCourse(id: string): Promise<RacerResult<void>>;
  /** Installs (or reinstalls) the course's pylons into AFS4. */
  installCourse(id: string): Promise<RacerResult<CourseSummary>>;
  uninstallCourse(id: string): Promise<RacerResult<CourseSummary>>;
  searchPlaces(query: string): Promise<RacerResult<PlaceHit[]>>;

  /** Makes this the active course and arms a fresh attempt. */
  selectCourse(id: string): Promise<RacerResult<CourseSummary>>;
  /** Discards the current attempt and arms a new one on the same course. */
  resetRace(): Promise<void>;

  /** Flies the active course with a synthetic aircraft (no simulator needed). */
  startDemo(): Promise<RacerResult<void>>;
  stopDemo(): Promise<void>;

  listRuns(courseId: string): Promise<RunSummary[]>;
  getRun(id: string): Promise<RacerResult<Run>>;
  /** Saves the run as a .pylonrun through a save dialog. Its course goes along when the course is
   *  still on the revision the run was flown on. */
  exportRun(id: string): Promise<RacerResult<{ fileName: string; withCourse: boolean }>>;

  /** Live state, pushed by main at up to ~20 Hz. Returns an unsubscribe function. */
  onLive(listener: (u: LiveUpdate) => void): () => void;
  /** A run was just finished and saved. */
  onRunSaved(listener: (r: RunSummary) => void): () => void;
  /** Files opened from the OS (double-click, "Open with") import on their own. The renderer calls
   *  this once it listens to onImported: it collects what was opened before it was ready. */
  takeOpenedFiles(): Promise<ImportReport | null>;
  /** Files opened from the OS while the app runs were imported. */
  onImported(listener: (r: ImportReport) => void): () => void;
}
