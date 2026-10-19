// DEV ONLY (tree-shaken from production): a fake window.racer for the browser preview
// (`npm run preview:renderer`, then open with ?mockracer). It runs the REAL core — sample courses,
// race session, demo flight — in the page, so the race screen can be exercised without Electron or
// the simulator. Runs live in memory and vanish on reload.
import type { Course } from "../../core/course/course";
import { demoFlight } from "../../core/demo/demoFlight";
import { sampleCourses } from "../../core/demo/sampleCourses";
import type { Run } from "../../core/run/run";
import { rankRuns, summarizeCourse, summarizeRun } from "../../core/run/summaries";
import { RaceSession } from "../../core/session/raceSession";
import type { LiveUpdate, RacerApi, RacerResult, RunSummary, TelemetryStatus } from "../../shared/racerApi";

export function installMockBridge(): void {
  const courses = new Map<string, Course>(sampleCourses().map((c) => [c.id, c]));
  const runs = new Map<string, Run>();
  const liveListeners = new Set<(u: LiveUpdate) => void>();
  const savedListeners = new Set<(r: RunSummary) => void>();
  let pilot = "Preview";
  let session: RaceSession | null = null;
  let demo: number | null = null;

  const summaries = (): RunSummary[] => [...runs.values()].map(summarizeRun);
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
    getAppInfo: async () => ({ version: __APP_VERSION__, pilot }),
    setPilot: async (name) => {
      pilot = name.trim().slice(0, 32) || pilot;
      return { version: __APP_VERSION__, pilot };
    },
    listCourses: async () => [...courses.values()].map((c) => summarizeCourse(c, summaries())),
    getCourse: async (id) => {
      const c = courses.get(id);
      return c ? ok(c) : { ok: false, error: { code: "not-found", message: id } };
    },
    importCourse: async () => ({ ok: false, error: { code: "cancelled", message: "No file dialog in the preview" } }),
    selectCourse: async (id) => {
      const c = courses.get(id);
      if (!c) return { ok: false, error: { code: "not-found", message: id } };
      stopDemo();
      session = new RaceSession(c, {
        pilot,
        appVersion: __APP_VERSION__,
        newId: () => crypto.randomUUID(),
        nowIso: () => new Date().toISOString(),
      });
      push();
      return ok(summarizeCourse(c, summaries()));
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
      const fixes = demoFlight(s.course, { rateHz: 20 });
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
