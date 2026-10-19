// The renderer's state. Main owns the race and the files; this mirrors what main pushes (live
// updates, saved runs), what the screens asked for (course list, the selected course, its runs) and
// the designer's unsaved draft.
import { create } from "zustand";
import { courseRevision, type Course } from "../../core/course/course";
import { draftOf, draftProblem, newDraft, type Draft } from "../../core/course/edit";
import type { Run } from "../../core/run/run";
import type { AppInfo, CourseSummary, LiveUpdate, RunSummary } from "../../shared/racerApi";
import { getRacer } from "../app/racer";

export interface TrailPoint {
  lon: number;
  lat: number;
}

export interface Message {
  kind: "info" | "error";
  text: string;
  /** Offer the AFS4-folder chooser next to the message. */
  chooseAfs4?: boolean;
}

const TRAIL_MAX = 2400;

let initStarted = false;

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
  message: Message | null;

  view: "race" | "design";
  /** The designer's working copy; an empty id means a course not saved yet. */
  draft: Draft | null;
  draftDirty: boolean;
  selectedGateId: string | null;
  /** Bumped to ask the map to bring a gate into view (selection from the list). */
  focusRequest: { id: string; n: number } | null;
  saving: boolean;
  busy: boolean;

  init(): Promise<void>;
  select(id: string): Promise<void>;
  importCourse(): Promise<void>;
  resetRace(): Promise<void>;
  startDemo(): Promise<void>;
  stopDemo(): Promise<void>;
  setPilot(name: string): Promise<void>;
  chooseAfs4Dir(): Promise<void>;
  dismissMessage(): void;

  newCourse(): void;
  editCourse(): void;
  closeDesigner(): void;
  editDraft(fn: (d: Draft) => Draft): void;
  selectGate(id: string | null): void;
  focusGate(id: string): void;
  saveDraft(): Promise<void>;
  duplicateCourse(): Promise<void>;
  deleteCourse(): Promise<void>;
  installCourse(): Promise<void>;
  uninstallCourse(): Promise<void>;
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

  /** Unsaved designer changes are only dropped with the user's consent. */
  const mayLeaveDraft = (): boolean => !get().draftDirty || window.confirm("Discard your unsaved changes to this course?");

  const afterInstallChange = (summary: CourseSummary): void => {
    set({ courses: get().courses.map((c) => (c.id === summary.id ? summary : c)) });
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
    view: "race",
    draft: null,
    draftDirty: false,
    selectedGateId: null,
    focusRequest: null,
    saving: false,
    busy: false,

    async init() {
      const racer = getRacer();
      // Once per page: React's dev StrictMode runs effects twice, which would subscribe twice.
      if (!racer || initStarted) return;
      initStarted = true;
      const app = await racer.getAppInfo();
      set({ bridge: true, app });
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
      const first = courses.find((c) => c.id === app.lastCourseId) ?? courses[0];
      if (first) await get().select(first.id);
    },

    async select(id) {
      const racer = getRacer();
      if (!racer || !mayLeaveDraft()) return;
      const [sel, course] = await Promise.all([racer.selectCourse(id), racer.getCourse(id)]);
      if (!sel.ok || !course.ok) {
        set({ message: { kind: "error", text: !sel.ok ? sel.error.message : course.ok ? "" : course.error.message } });
        return;
      }
      set({ selected: course.value, trail: [], runs: [], bestRun: null, targetRun: null, view: "race", draft: null, draftDirty: false });
      await refreshCourseData(true);
    },

    async importCourse() {
      const racer = getRacer();
      if (!racer) return;
      const r = await racer.importCourse();
      if (!r.ok) {
        if (r.error.code !== "cancelled") set({ message: { kind: "error", text: `Couldn't import that course. ${r.error.message}` } });
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
      if (r && !r.ok) set({ message: { kind: "error", text: r.error.message } });
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

    async chooseAfs4Dir() {
      const racer = getRacer();
      if (!racer) return;
      const app = await racer.chooseAfs4Dir();
      set({ app, message: app.afs4DirFound ? null : get().message, courses: await racer.listCourses() });
    },

    dismissMessage() {
      set({ message: null });
    },

    // --- designer -----------------------------------------------------------------------------------

    newCourse() {
      if (!mayLeaveDraft()) return;
      const draft = newDraft("", get().app?.pilot ?? "", new Date().toISOString());
      set({ view: "design", draft, draftDirty: false, selectedGateId: null });
    },

    editCourse() {
      const c = get().selected;
      if (!c) return;
      set({ view: "design", draft: draftOf(c), draftDirty: false, selectedGateId: null });
    },

    closeDesigner() {
      if (!mayLeaveDraft()) return;
      set({ view: "race", draft: null, draftDirty: false, selectedGateId: null });
    },

    editDraft(fn) {
      const d = get().draft;
      if (d) set({ draft: fn(d), draftDirty: true });
    },

    selectGate(id) {
      set({ selectedGateId: id });
    },

    focusGate(id) {
      set({ selectedGateId: id, focusRequest: { id, n: (get().focusRequest?.n ?? 0) + 1 } });
    },

    async saveDraft() {
      const racer = getRacer();
      const draft = get().draft;
      if (!racer || !draft) return;
      const problem = draftProblem(draft);
      if (problem) {
        set({ message: { kind: "error", text: problem } });
        return;
      }
      set({ saving: true });
      try {
        const r = await racer.saveCourse(draft as Course);
        if (!r.ok) {
          set({ message: { kind: "error", text: `Couldn't save the course. ${r.error.message}` } });
          return;
        }
        set({ draftDirty: false });
        await get().select(r.value.course.id);
        const outdated = r.value.course.install.state === "outdated";
        const notes = [...r.value.warnings, ...(outdated ? ["The pylons installed in AFS4 are from before this change: reinstall them."] : [])];
        set({ message: notes.length ? { kind: "info", text: notes.join(" ") } : { kind: "info", text: "Course saved." } });
      } finally {
        set({ saving: false });
      }
    },

    async duplicateCourse() {
      const racer = getRacer();
      const c = get().selected;
      if (!racer || !c) return;
      const r = await racer.duplicateCourse(c.id);
      if (!r.ok) {
        set({ message: { kind: "error", text: r.error.message } });
        return;
      }
      await get().select(r.value.id);
      get().editCourse();
    },

    async deleteCourse() {
      const racer = getRacer();
      const c = get().selected;
      if (!racer || !c) return;
      const installed = get().courses.find((s) => s.id === c.id)?.install.state !== "none";
      const ok = window.confirm(
        `Delete "${c.name}"?${installed ? " Its pylons will be removed from Aerofly FS 4." : ""} Your runs on it are kept.`,
      );
      if (!ok) return;
      const r = await racer.deleteCourse(c.id);
      if (!r.ok) {
        set({ message: { kind: "error", text: r.error.message } });
        return;
      }
      set({ selected: null, view: "race", draft: null, draftDirty: false });
      const courses = await racer.listCourses();
      set({ courses });
      if (courses[0]) await get().select(courses[0].id);
    },

    async installCourse() {
      const racer = getRacer();
      const c = get().selected;
      if (!racer || !c) return;
      set({ busy: true });
      try {
        const r = await racer.installCourse(c.id);
        if (!r.ok) {
          set({
            message:
              r.error.code === "afs4-not-found"
                ? { kind: "error", text: `Aerofly FS 4's user folder wasn't found at ${r.error.dir}.`, chooseAfs4: true }
                : { kind: "error", text: `Couldn't install the pylons. ${r.error.message}` },
          });
          return;
        }
        afterInstallChange(r.value);
        set({ message: { kind: "info", text: "Pylons installed. Restart Aerofly FS 4 to see them." } });
      } finally {
        set({ busy: false });
      }
    },

    async uninstallCourse() {
      const racer = getRacer();
      const c = get().selected;
      if (!racer || !c) return;
      const r = await racer.uninstallCourse(c.id);
      if (!r.ok) {
        set({ message: { kind: "error", text: r.error.message } });
        return;
      }
      afterInstallChange(r.value);
      set({ message: { kind: "info", text: "Pylons removed from Aerofly FS 4." } });
    },
  };
});
