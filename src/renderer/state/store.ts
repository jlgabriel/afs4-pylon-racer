// The renderer's state. Main owns the race; this only mirrors what main pushes (live updates, saved
// runs) plus what the screens asked for (course list, the selected course, its runs).
import { create } from "zustand";
import { courseRevision, type Course } from "../../core/course/course";
import type { Run } from "../../core/run/run";
import type { AppInfo, CourseSummary, LiveUpdate, RunSummary } from "../../shared/racerApi";
import { getRacer } from "../app/racer";

export interface TrailPoint {
  lon: number;
  lat: number;
}

const TRAIL_MAX = 2400;

interface State {
  bridge: boolean;
  app: AppInfo | null;
  courses: CourseSummary[];
  selected: Course | null;
  runs: RunSummary[];
  /** Best finished run of the selected course revision. */
  bestRun: Run | null;
  /** The best run as it was when the current attempt was armed: what this attempt races against.
   *  It stays put when the attempt itself becomes the new best, so it is never compared to itself. */
  targetRun: Run | null;
  update: LiveUpdate | null;
  trail: TrailPoint[];
  message: string | null;

  init(): Promise<void>;
  select(id: string): Promise<void>;
  importCourse(): Promise<void>;
  resetRace(): Promise<void>;
  startDemo(): Promise<void>;
  stopDemo(): Promise<void>;
  setPilot(name: string): Promise<void>;
  dismissMessage(): void;
}

export const useStore = create<State>((set, get) => {
  const refreshCourseData = async (arm: boolean): Promise<void> => {
    const racer = getRacer();
    const course = get().selected;
    if (!racer) return;
    const courses = await racer.listCourses();
    if (!course) {
      set({ courses });
      return;
    }
    const revision = courseRevision(course);
    const runs = (await racer.listRuns(course.id)).filter((r) => r.courseRevision === revision);
    const best = runs.find((r) => r.status === "finished");
    const bestRun = best ? await racer.getRun(best.id) : null;
    const value = bestRun?.ok ? bestRun.value : null;
    set(arm ? { courses, runs, bestRun: value, targetRun: value } : { courses, runs, bestRun: value });
  };

  return {
    bridge: false,
    app: null,
    courses: [],
    selected: null,
    runs: [],
    bestRun: null,
    targetRun: null,
    update: null,
    trail: [],
    message: null,

    async init() {
      const racer = getRacer();
      if (!racer) return;
      set({ bridge: true, app: await racer.getAppInfo() });
      racer.onLive((update) => {
        const fix = update.live?.fix;
        const trail = get().trail;
        const last = trail[trail.length - 1];
        if (fix && (!last || last.lon !== fix.lon || last.lat !== fix.lat)) {
          const next = trail.length >= TRAIL_MAX ? trail.slice(-TRAIL_MAX / 2) : trail.slice();
          next.push({ lon: fix.lon, lat: fix.lat });
          set({ update, trail: next });
        } else {
          set({ update });
        }
      });
      racer.onRunSaved(() => void refreshCourseData(false));
      const courses = await racer.listCourses();
      set({ courses });
      if (courses[0]) await get().select(courses[0].id);
    },

    async select(id) {
      const racer = getRacer();
      if (!racer) return;
      const [sel, course] = await Promise.all([racer.selectCourse(id), racer.getCourse(id)]);
      if (!sel.ok || !course.ok) {
        set({ message: (sel.ok ? null : sel.error.message) ?? (course.ok ? "" : course.error.message) });
        return;
      }
      set({ selected: course.value, trail: [], runs: [], bestRun: null, targetRun: null });
      await refreshCourseData(true);
    },

    async importCourse() {
      const racer = getRacer();
      if (!racer) return;
      const r = await racer.importCourse();
      if (!r.ok) {
        if (r.error.code !== "cancelled") set({ message: `Couldn't import that course. ${r.error.message}` });
        return;
      }
      await get().select(r.value.id);
    },

    async resetRace() {
      await getRacer()?.resetRace();
      set({ trail: [], targetRun: get().bestRun });
    },

    async startDemo() {
      const r = await getRacer()?.startDemo();
      if (r && !r.ok) set({ message: r.error.message });
      set({ trail: [], targetRun: get().bestRun });
    },

    async stopDemo() {
      await getRacer()?.stopDemo();
    },

    async setPilot(name) {
      const racer = getRacer();
      if (!racer) return;
      set({ app: await racer.setPilot(name) });
    },

    dismissMessage() {
      set({ message: null });
    },
  };
});
