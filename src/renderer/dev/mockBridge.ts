// DEV ONLY (tree-shaken from production): a fake window.racer for the browser preview
// (`npm run preview:renderer`, then open with ?mockracer). It runs the REAL core — sample courses,
// race session, demo flight — in the page, so the race screen can be exercised without Electron or
// the simulator. Runs live in memory and vanish on reload.
import { courseRevision, parseCourse, type Course } from "../../core/course/course";
import { demoFlight } from "../../core/demo/demoFlight";
import { sampleCourses } from "../../core/demo/sampleCourses";
import { courseFileName, packCourse, packRun, runFileName, unpack } from "../../core/files/share";
import type { ZipCodec } from "../../core/files/zip";
import { destination } from "../../core/geo/geo";
import type { Run } from "../../core/run/run";
import { rankRuns, summarizeCourse, summarizeRun } from "../../core/run/summaries";
import { RaceSession } from "../../core/session/raceSession";
import type { AppInfo, ImportReport, LiveUpdate, Prefs, RacerApi, RacerResult, RunSummary, TelemetryStatus } from "../../shared/racerApi";

/** No synchronous deflate in a browser: the preview writes stored (uncompressed) ZIPs and can only
 *  read those back. The real app reads and writes both. */
const storeOnly: ZipCodec = {
  deflateRaw: (d) => d,
  inflateRaw: () => {
    throw new Error("Compressed files open in the app, not in the preview");
  },
};

/** The preview's "save dialog": the browser downloads the file. */
function download(name: string, data: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function installMockBridge(): void {
  const courses = new Map<string, Course>(sampleCourses().map((c) => [c.id, c]));
  const runs = new Map<string, Run>();
  const importedRuns = new Set<string>();
  const liveListeners = new Set<(u: LiveUpdate) => void>();
  const savedListeners = new Set<(r: RunSummary) => void>();
  let pilot = "Preview";
  let lastCourseId: string | null = null;
  let prefs: Prefs = { onTop: false };
  let session: RaceSession | null = null;
  let demo: number | null = null;
  /** courseId → installed revision: a pretend scenery/poi/. */
  const installed = new Map<string, string>();

  const summaries = (): RunSummary[] => [...runs.values()].map((r) => summarizeRun(r, importedRuns.has(r.id)));
  const installedRefs = () => [...installed].map(([courseId, revision]) => ({ courseId, revision, folderName: `mock_${courseId}` }));
  const summary = (c: Course) => summarizeCourse(c, summaries(), installedRefs());
  const info = (): AppInfo => ({ version: __APP_VERSION__, pilot, afs4Dir: "(preview)", afs4DirFound: true, lastCourseId, prefs });
  const notFound = (id: string): RacerResult<never> => ({ ok: false, error: { code: "not-found", message: id } });
  const ok = <T>(value: T): RacerResult<T> => ({ ok: true, value });

  const telemetry = (): TelemetryStatus => ({
    active: demo !== null ? "demo" : null,
    aircraft: demo !== null ? "extra330" : null,
    udp: { ageS: null, hz: 0, error: null },
    reader: { ageS: null, hz: 0, error: "ECONNREFUSED", connected: false },
    demo: { running: demo !== null },
  });
  const push = (): void => {
    const u: LiveUpdate = { telemetry: telemetry(), live: session?.live() ?? null };
    liveListeners.forEach((l) => l(u));
  };
  const stopDemo = (): void => {
    if (demo !== null) window.clearInterval(demo);
    demo = null;
  };
  window.setInterval(push, 500);

  const api: RacerApi = {
    getAppInfo: async () => info(),
    setPilot: async (name) => {
      pilot = name.trim().slice(0, 32) || pilot;
      return info();
    },
    chooseAfs4Dir: async () => info(),
    setPrefs: async (patch) => {
      prefs = { ...prefs, ...patch };
      return info();
    },
    listCourses: async () => [...courses.values()].sort((a, b) => a.name.localeCompare(b.name)).map(summary),
    saveCourse: async (draft) => {
      try {
        const now = new Date().toISOString();
        const id = draft.id || `${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${courses.size + 1}`;
        // The real app looks the terrain up on Open-Meteo; the preview pretends it is flat at 588 m.
        const c = parseCourse({ ...draft, id, updatedAt: now, gates: draft.gates.map((g) => ({ ...g, groundElevM: g.groundElevM ?? 588 })) });
        courses.set(c.id, c);
        return ok({ course: summary(c), warnings: [] });
      } catch (e) {
        return { ok: false, error: { code: "invalid-course", message: String(e) } };
      }
    },
    duplicateCourse: async (id) => {
      const c = courses.get(id);
      if (!c) return notFound(id);
      const copy = { ...structuredClone(c), id: `${c.id}-copy-${courses.size + 1}`, name: `Copy of ${c.name}` };
      courses.set(copy.id, copy);
      return ok(summary(copy));
    },
    deleteCourse: async (id) => {
      courses.delete(id);
      installed.delete(id);
      return ok(undefined);
    },
    installCourse: async (id) => {
      const c = courses.get(id);
      if (!c) return notFound(id);
      installed.set(id, courseRevision(c));
      return ok(summary(c));
    },
    uninstallCourse: async (id) => {
      const c = courses.get(id);
      if (!c) return notFound(id);
      installed.delete(id);
      return ok(summary(c));
    },
    searchPlaces: async (q) =>
      ok(q.toLowerCase().includes("dag") ? [{ label: "Barstow-Daggett Airport (KDAG), California", lon: -116.787, lat: 34.8537 }] : []),
    getCourse: async (id) => {
      const c = courses.get(id);
      return c ? ok(c) : { ok: false, error: { code: "not-found", message: id } };
    },
    importFiles: async () => ({ ok: false, error: { code: "cancelled", message: "No file dialog in the preview" } }),
    importDropped: async (files) => {
      const report: ImportReport = { courseId: null, lines: [], failed: 0 };
      for (const f of files) {
        try {
          const u = unpack(f.data, storeOnly, new Date().toISOString());
          const course = u.course && (courses.get(u.course.id) ?? (courses.set(u.course.id, u.course), u.course));
          if (u.kind === "run") {
            const home = [...courses.values()].find((c) => courseRevision(c) === u.run.courseRevision);
            const added = !runs.has(u.run.id);
            if (added) {
              runs.set(u.run.id, { ...u.run, courseId: home?.id ?? u.run.courseId });
              importedRuns.add(u.run.id);
            }
            report.courseId = home?.id ?? null;
            report.lines.push(`${u.run.courseName}, ${u.run.pilot}'s run: ${added ? "added" : "already here"}.`);
          } else {
            report.courseId = course!.id;
            report.lines.push(`${course!.name}: course added.`);
          }
        } catch (e) {
          report.failed++;
          report.lines.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return ok(report);
    },
    exportCourse: async (id) => {
      const c = courses.get(id);
      if (!c) return notFound(id);
      download(courseFileName(c), packCourse(c, storeOnly));
      return ok(courseFileName(c));
    },
    exportRun: async (id) => {
      const r = runs.get(id);
      if (!r) return notFound(id);
      const course = [...courses.values()].find((c) => courseRevision(c) === r.courseRevision) ?? null;
      download(runFileName(r), packRun(r, course, storeOnly));
      return ok({ fileName: runFileName(r), withCourse: course !== null });
    },
    takeOpenedFiles: async () => null,
    onImported: () => () => undefined,
    selectCourse: async (id) => {
      const c = courses.get(id);
      if (!c) return notFound(id);
      lastCourseId = id;
      stopDemo();
      session = new RaceSession(c, {
        pilot,
        appVersion: __APP_VERSION__,
        newId: () => crypto.randomUUID(),
        nowIso: () => new Date().toISOString(),
      });
      push();
      return ok(summary(c));
    },
    resetRace: async () => {
      stopDemo();
      session?.reset();
      push();
    },
    startDemo: async () => {
      if (!session) return { ok: false, error: { code: "not-found", message: "Select a course first" } };
      stopDemo();
      session.reset();
      const s = session;
      // ?sloppy flies the demo badly on purpose (banked and high), to see the penalties on screen.
      // ?reset crashes halfway: AFS4 puts the aircraft back on a runway 3 km away, stopped.
      const query = new URLSearchParams(window.location.search);
      const sloppy = query.has("sloppy");
      const flown = demoFlight(s.course, { rateHz: 20 });
      const runway = destination(flown[0]!, 3000, 180);
      const fixes = flown.map((f, i) => {
        if (query.has("reset") && i > flown.length / 2) return { ...f, ...runway, gsMs: 0, aglM: 0, rollDeg: 0, pitchDeg: 0 };
        return sloppy ? { ...f, rollDeg: f.rollDeg + 35, altMslM: f.altMslM + 30, aglM: f.aglM === null ? null : f.aglM + 30 } : f;
      });
      const t0 = performance.now() / 1000;
      let i = 0;
      demo = window.setInterval(() => {
        const elapsed = performance.now() / 1000 - t0;
        while (i < fixes.length && fixes[i]!.t <= elapsed) {
          const f = fixes[i++]!;
          const { run } = s.feed({ ...f, t: t0 + f.t }, { kind: "demo", hz: 20, aircraft: "extra330" });
          if (run) {
            runs.set(run.id, run);
            savedListeners.forEach((l) => l(summarizeRun(run)));
          }
        }
        if (i >= fixes.length) stopDemo();
        push();
      }, 50);
      return ok(undefined);
    },
    stopDemo: async () => {
      stopDemo();
      push();
    },
    listRuns: async (courseId) => rankRuns(summaries().filter((r) => r.courseId === courseId)),
    getRun: async (id) => {
      const r = runs.get(id);
      return r ? ok(r) : { ok: false, error: { code: "not-found", message: id } };
    },
    onLive: (l) => {
      liveListeners.add(l);
      return () => liveListeners.delete(l);
    },
    onRunSaved: (l) => {
      savedListeners.add(l);
      return () => savedListeners.delete(l);
    },
  };
  window.racer = api;
}
