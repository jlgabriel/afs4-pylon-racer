// One ipcMain handler per RacerApi method, channel "racer:<method>". This is the app's single trust
// boundary: it owns every path and dialog, validates what comes in, and maps expected failures into
// RacerResult envelopes (a thrown error loses its fields crossing invoke).
import { BrowserWindow, dialog, ipcMain } from "electron";
import { readFileSync } from "node:fs";
import { ZodError } from "zod";
import { parseCourse } from "../core/course/course";
import { importRctCourse, isRctCourse } from "../core/course/importRct";
import { rankRuns, summarizeCourse } from "../core/run/summaries";
import type { AppInfo, RacerError, RacerResult } from "../shared/racerApi";
import { log } from "./log";
import type { RaceController } from "./race";
import type { Storage } from "./storage";

declare const __APP_VERSION__: string;

const ok = <T>(value: T): RacerResult<T> => ({ ok: true, value });
const fail = (code: RacerError["code"], message: string): RacerResult<never> => ({ ok: false, error: { code, message } });

export function registerIpc(storage: Storage, race: RaceController): void {
  const appInfo = (): AppInfo => ({ version: __APP_VERSION__, pilot: storage.readSettings().pilot });

  ipcMain.handle("racer:getAppInfo", () => appInfo());

  ipcMain.handle("racer:setPilot", (_e, name: unknown) => {
    const pilot = typeof name === "string" ? name.trim().slice(0, 32) : "";
    if (pilot) storage.writeSettings({ pilot });
    return appInfo();
  });

  ipcMain.handle("racer:listCourses", () => {
    const runs = storage.listRuns();
    return storage.listCourses().map((c) => summarizeCourse(c, runs));
  });

  ipcMain.handle("racer:getCourse", (_e, id: unknown) => {
    if (typeof id !== "string") return fail("not-found", "No course id");
    try {
      const c = storage.getCourse(id);
      return c ? ok(c) : fail("not-found", `No course ${id}`);
    } catch (e) {
      return fail("invalid-course", errorText(e));
    }
  });

  ipcMain.handle("racer:importCourse", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = {
      title: "Import a course",
      filters: [{ name: "Course", extensions: ["json"] }],
      properties: ["openFile" as const],
    };
    const pick = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const file = pick.filePaths[0];
    if (pick.canceled || !file) return fail("cancelled", "Import cancelled");
    try {
      const data: unknown = JSON.parse(readFileSync(file, "utf8"));
      const course = isRctCourse(data) ? importRctCourse(data, new Date().toISOString()) : parseCourse(data);
      const stored = storage.addCourse(course);
      log.info(`course imported: ${stored.name} (${stored.id}) from ${file}`);
      return ok(summarizeCourse(stored, storage.listRuns()));
    } catch (err) {
      log.warn(`course import failed: ${file}`, err);
      return fail("invalid-course", errorText(err));
    }
  });

  ipcMain.handle("racer:selectCourse", (_e, id: unknown) => {
    if (typeof id !== "string") return fail("not-found", "No course id");
    try {
      const c = storage.getCourse(id);
      return c ? ok(race.select(c)) : fail("not-found", `No course ${id}`);
    } catch (e) {
      return fail("invalid-course", errorText(e));
    }
  });

  ipcMain.handle("racer:resetRace", () => race.reset());

  ipcMain.handle("racer:startDemo", () =>
    race.startDemo() ? ok(undefined) : fail("not-found", "Select a course first"),
  );

  ipcMain.handle("racer:stopDemo", () => race.stopDemo());

  ipcMain.handle("racer:listRuns", (_e, courseId: unknown) =>
    rankRuns(storage.listRuns().filter((r) => r.courseId === courseId)),
  );

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
