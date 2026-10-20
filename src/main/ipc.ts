// One ipcMain handler per RacerApi method, channel "racer:<method>". This is the app's single trust
// boundary: it owns every path and dialog, validates what comes in, and maps expected failures into
// RacerResult envelopes (a thrown error loses its fields crossing invoke).
import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type WebContents } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { ZodError } from "zod";
import { parseCourse, type Course } from "../core/course/course";
import { importRctCourse, isRctCourse } from "../core/course/importRct";
import { rankRuns, summarizeCourse } from "../core/run/summaries";
import type { AppInfo, CourseSummary, Prefs, RacerError, RacerResult, SaveResult } from "../shared/racerApi";
import { Afs4NotFoundError, type Installer } from "./installer";
import { log } from "./log";
import type { RaceController } from "./race";
import { SAFE_ID, type Storage } from "./storage";
import { elevations, searchPlaces } from "./web";

declare const __APP_VERSION__: string;

const ok = <T>(value: T): RacerResult<T> => ({ ok: true, value });
const fail = (code: Exclude<RacerError["code"], "afs4-not-found">, message: string): RacerResult<never> => ({
  ok: false,
  error: { code, message },
});

export interface IpcDeps {
  storage: Storage;
  race: RaceController;
  installer: Installer;
  /** The AFS4 user folder currently in use (settings override or the detected default). */
  afs4Dir: () => string;
  userData: string;
}

export function registerIpc({ storage, race, installer, afs4Dir, userData }: IpcDeps): void {
  const appInfo = (): AppInfo => {
    const s = storage.readSettings();
    return {
      version: __APP_VERSION__,
      pilot: s.pilot,
      afs4Dir: afs4Dir(),
      afs4DirFound: existsSync(afs4Dir()),
      lastCourseId: s.lastCourseId,
      prefs: { onTop: s.onTop },
    };
  };
  const summary = (c: Course): CourseSummary => summarizeCourse(c, storage.listRuns(), installer.list());
  const dialogParent = (sender: WebContents): BrowserWindow | undefined => BrowserWindow.fromWebContents(sender) ?? undefined;
  const withCourse = <T>(id: unknown, fn: (c: Course) => RacerResult<T>): RacerResult<T> => {
    if (typeof id !== "string" || !SAFE_ID.test(id)) return fail("not-found", "No such course");
    try {
      const c = storage.getCourse(id);
      return c ? fn(c) : fail("not-found", `No course ${id}`);
    } catch (e) {
      return fail("invalid-course", errorText(e));
    }
  };

  // --- app ------------------------------------------------------------------------------------------

  ipcMain.handle("racer:getAppInfo", () => appInfo());

  ipcMain.handle("racer:setPilot", (_e, name: unknown) => {
    const pilot = typeof name === "string" ? name.trim().slice(0, 32) : "";
    if (pilot) storage.writeSettings({ pilot });
    return appInfo();
  });

  ipcMain.handle("racer:chooseAfs4Dir", async (e) => {
    const opts: OpenDialogOptions = {
      title: "Choose your Aerofly FS 4 user folder (the one that contains 'scenery')",
      defaultPath: afs4Dir(),
      properties: ["openDirectory"],
    };
    const parent = dialogParent(e.sender);
    const pick = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    const dir = pick.filePaths[0];
    if (!pick.canceled && dir) {
      storage.writeSettings({ afs4Dir: dir });
      log.info(`AFS4 user folder set to ${dir}`);
    }
    return appInfo();
  });

  ipcMain.handle("racer:setPrefs", (e, patch: unknown) => {
    const p = (typeof patch === "object" && patch !== null ? patch : {}) as Record<string, unknown>;
    const next: Partial<Prefs> = {};
    if (typeof p["onTop"] === "boolean") next.onTop = p["onTop"];
    const s = storage.writeSettings(next);
    const win = dialogParent(e.sender);
    if (win && next.onTop !== undefined) applyOnTop(win, s.onTop);
    return appInfo();
  });

  // --- courses --------------------------------------------------------------------------------------

  ipcMain.handle("racer:listCourses", () => {
    const runs = storage.listRuns();
    const installed = installer.list();
    return storage.listCourses().map((c) => summarizeCourse(c, runs, installed));
  });

  ipcMain.handle("racer:getCourse", (_e, id: unknown) => withCourse(id, (c) => ok(c)));

  ipcMain.handle("racer:importCourse", async (e) => {
    const opts: OpenDialogOptions = {
      title: "Import a course",
      filters: [{ name: "Course", extensions: ["json"] }],
      properties: ["openFile"],
    };
    const parent = dialogParent(e.sender);
    const pick = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    const file = pick.filePaths[0];
    if (pick.canceled || !file) return fail("cancelled", "Import cancelled");
    try {
      const data: unknown = JSON.parse(readFileSync(file, "utf8"));
      const course = isRctCourse(data) ? importRctCourse(data, new Date().toISOString()) : parseCourse(data);
      const stored = storage.addCourse(course);
      log.info(`course imported: ${stored.name} (${stored.id}) from ${file}`);
      return ok(summary(stored));
    } catch (err) {
      log.warn(`course import failed: ${file}`, err);
      return fail("invalid-course", errorText(err));
    }
  });

  ipcMain.handle("racer:saveCourse", async (_e, draft: unknown): Promise<RacerResult<SaveResult>> => {
    const now = new Date().toISOString();
    let course: Course;
    try {
      const d = draft as Partial<Course>;
      const isNew = typeof d.id !== "string" || d.id === "";
      const existing = !isNew && typeof d.id === "string" ? storage.getCourse(d.id) : null;
      if (!isNew && !existing) return fail("not-found", `No course ${String(d.id)}`);
      course = parseCourse({
        ...d,
        id: isNew ? storage.newCourseId(String(d.name ?? "")) : d.id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    } catch (err) {
      return fail("invalid-course", errorText(err));
    }

    const warnings: string[] = [];
    const missing = course.gates.filter((g) => g.groundElevM === null);
    if (missing.length > 0) {
      try {
        const elev = await elevations(missing.map((g) => g.center), userData, __APP_VERSION__);
        const byId = new Map(missing.map((g, i) => [g.id, Math.round(elev[i]! * 10) / 10]));
        course = { ...course, gates: course.gates.map((g) => (byId.has(g.id) ? { ...g, groundElevM: byId.get(g.id)! } : g)) };
      } catch (err) {
        log.warn("terrain elevation lookup failed", err);
        warnings.push("Couldn't look up the terrain elevation (no connection?). Save again later to add it.");
      }
    }

    try {
      storage.saveCourse(course);
      if (race.activeCourse?.id === course.id) race.select(course);
      log.info(`course saved: ${course.name} (${course.id}), ${course.gates.length} gates`);
      return ok({ course: summary(course), warnings });
    } catch (err) {
      return fail("io", errorText(err));
    }
  });

  ipcMain.handle("racer:duplicateCourse", (_e, id: unknown) =>
    withCourse(id, (c) => {
      const now = new Date().toISOString();
      const name = `Copy of ${c.name}`.slice(0, 80);
      const copy: Course = { ...structuredClone(c), id: storage.newCourseId(name), name, createdAt: now, updatedAt: now };
      storage.saveCourse(copy);
      return ok(summary(copy));
    }),
  );

  ipcMain.handle("racer:deleteCourse", (_e, id: unknown) =>
    withCourse(id, (c) => {
      const removed = installer.uninstall(c.id);
      storage.deleteCourse(c.id);
      log.info(`course deleted: ${c.name} (${c.id})${removed.length ? `, uninstalled ${removed.join(", ")}` : ""}`);
      return ok(undefined);
    }),
  );

  ipcMain.handle("racer:installCourse", (_e, id: unknown) =>
    withCourse(id, (c): RacerResult<CourseSummary> => {
      try {
        const poi = installer.install(c);
        log.info(`installed ${c.name} as ${poi.folderName}`);
        return ok(summary(c));
      } catch (err) {
        if (err instanceof Afs4NotFoundError) {
          return { ok: false, error: { code: "afs4-not-found", message: err.message, dir: err.dir } };
        }
        log.error(`install failed for ${c.id}`, err);
        return fail("io", errorText(err));
      }
    }),
  );

  ipcMain.handle("racer:uninstallCourse", (_e, id: unknown) =>
    withCourse(id, (c) => {
      const removed = installer.uninstall(c.id);
      log.info(`uninstalled ${c.id}: ${removed.join(", ") || "nothing installed"}`);
      return ok(summary(c));
    }),
  );

  ipcMain.handle("racer:searchPlaces", async (_e, query: unknown) => {
    if (typeof query !== "string") return ok([]);
    try {
      return ok(await searchPlaces(query, __APP_VERSION__));
    } catch (err) {
      log.warn("place search failed", err);
      return fail("network", "Couldn't search right now. Check your connection.");
    }
  });

  // --- race -----------------------------------------------------------------------------------------

  ipcMain.handle("racer:selectCourse", (_e, id: unknown) =>
    withCourse(id, (c) => {
      race.select(c);
      storage.writeSettings({ lastCourseId: c.id });
      return ok(summary(c));
    }),
  );

  ipcMain.handle("racer:resetRace", () => race.reset());

  ipcMain.handle("racer:startDemo", () => (race.startDemo() ? ok(undefined) : fail("not-found", "Select a course first")));

  ipcMain.handle("racer:stopDemo", () => race.stopDemo());

  ipcMain.handle("racer:listRuns", (_e, courseId: unknown) => rankRuns(storage.listRuns().filter((r) => r.courseId === courseId)));

  ipcMain.handle("racer:getRun", (_e, id: unknown) => {
    if (typeof id !== "string") return fail("not-found", "No run id");
    try {
      const r = storage.getRun(id);
      return r ? ok(r) : fail("not-found", `No run ${id}`);
    } catch (e) {
      return fail("io", errorText(e));
    }
  });
}

function errorText(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".") || "course"}: ${i.message}`).join("; ");
  if (e instanceof SyntaxError) return `Not valid JSON: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/** "screen-saver" is the level that stays above a borderless-windowed game on Windows. */
export function applyOnTop(win: BrowserWindow, on: boolean): void {
  win.setAlwaysOnTop(on, "screen-saver");
}
