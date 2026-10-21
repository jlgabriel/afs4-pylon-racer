import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { courseRevision, type Course } from "../src/core/course/course";
import { demoFlight } from "../src/core/demo/demoFlight";
import { sampleCourses } from "../src/core/demo/sampleCourses";
import { packCourse, packRun } from "../src/core/files/share";
import type { Run } from "../src/core/run/run";
import { RaceSession } from "../src/core/session/raceSession";
import { courseFile, importFiles, runFile, zlibCodec } from "../src/main/sharing";
import { Storage } from "../src/main/storage";

const daggett = sampleCourses().find((c) => c.id === "daggett-sprint")!;
let userData: string;
let storage: Storage;

beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), "racer-share-"));
  storage = new Storage(userData);
  storage.init();
});

function fly(course: Course, pilot: string, id: string): Run {
  const session = new RaceSession(course, { pilot, appVersion: "0.4.0", newId: () => id, nowIso: () => "2026-10-21T12:00:00Z" });
  let run: Run | null = null;
  for (const f of demoFlight(course, { rateHz: 10 })) run = session.feed(f, { kind: "demo", hz: 10, aircraft: "extra330" }).run ?? run;
  return run!;
}

const file = (name: string, data: Uint8Array) => ({ name, data });

describe("importing a course", () => {
  it("adds a new course and opens it", () => {
    const course = { ...daggett, id: "friends-course", name: "Friend's Course" };
    const r = importFiles(storage, [file("Friend's Course.pylonrace", packCourse(course, zlibCodec))]);
    expect(r).toEqual({ courseId: "friends-course", lines: ["Friend's Course: course added."], failed: 0 });
    expect(storage.getCourse("friends-course")).toEqual(course);
  });

  it("recognizes a course it already has", () => {
    const r = importFiles(storage, [file("d.pylonrace", courseFile(daggett))]);
    expect(r.lines).toEqual(["Daggett Sprint: already in your library."]);
    expect(storage.listCourses().filter((c) => c.name === "Daggett Sprint")).toHaveLength(1);
  });

  it("keeps both when a different course has the same id", () => {
    const moved = { ...daggett, gates: daggett.gates.map((g) => ({ ...g, widthM: g.widthM + 10 })) };
    const r = importFiles(storage, [file("d.pylonrace", courseFile(moved))]);
    expect(r.courseId).toBe("daggett-sprint-2");
    expect(r.lines[0]).toMatch(/course added \(a different course/);
    expect(courseRevision(storage.getCourse("daggett-sprint")!)).toBe(courseRevision(daggett));
  });

  it("reports bad files one by one and imports the good ones", () => {
    const r = importFiles(storage, [
      file("notes.txt", new TextEncoder().encode("hello")),
      file("ok.pylonrace", courseFile({ ...daggett, id: "other", name: "Other" })),
    ]);
    expect(r.failed).toBe(1);
    expect(r.courseId).toBe("other");
    expect(r.lines[0]).toMatch(/^notes\.txt: This isn't a Pylon Racer file/);
  });
});

describe("importing a run", () => {
  it("joins the course with the same revision and counts as imported", () => {
    const run = fly(daggett, "Rodeo", "rodeo-run");
    const r = importFiles(storage, [file("r.pylonrun", packRun(run, null, zlibCodec))]);
    expect(r).toEqual({ courseId: "daggett-sprint", lines: ["Daggett Sprint, Rodeo's run: added."], failed: 0 });
    expect(storage.listRuns()).toMatchObject([{ id: "rodeo-run", imported: true, courseId: "daggett-sprint", pilot: "Rodeo" }]);
    expect(readdirSync(path.join(userData, "runs", "imported"))).toEqual(["rodeo-run.json"]);
    expect(storage.getRun("rodeo-run")).toEqual(run);
  });

  it("matches by revision even when the course has another id here", () => {
    const theirs = { ...daggett, id: "kdag-sprint-by-rodeo" };
    const run = fly(theirs, "Rodeo", "rodeo-run");
    const r = importFiles(storage, [file("r.pylonrun", packRun(run, theirs, zlibCodec))]);
    expect(r.courseId).toBe("daggett-sprint");
    expect(storage.getRun("rodeo-run")!.courseId).toBe("daggett-sprint");
    expect(storage.getCourse("kdag-sprint-by-rodeo")).toBeNull();
  });

  it("brings its course along when it is new here", () => {
    const course = { ...daggett, id: "new-one", name: "New One", gates: daggett.gates.map((g) => ({ ...g, widthM: 120 })) };
    const run = fly(course, "Rodeo", "rodeo-run");
    const r = importFiles(storage, [file("r.pylonrun", packRun(run, course, zlibCodec))]);
    expect(r.lines).toEqual(["New One, Rodeo's run: added. Its course was added too."]);
    expect(r.courseId).toBe("new-one");
  });

  it("keeps a run whose course is missing, and says so", () => {
    const course = { ...daggett, id: "unknown", gates: daggett.gates.map((g) => ({ ...g, widthM: 120 })) };
    const r = importFiles(storage, [file("r.pylonrun", packRun(fly(course, "Rodeo", "rodeo-run"), null, zlibCodec))]);
    expect(r.courseId).toBeNull();
    expect(r.lines[0]).toMatch(/you don't have that version of its course/);
    expect(storage.listRuns()).toHaveLength(1);
  });

  it("does not import the same run twice, nor one flown here", () => {
    const mine = fly(daggett, "Juan", "my-run");
    storage.saveRun(mine);
    const r = importFiles(storage, [file("mine.pylonrun", runFile(storage, mine).data)]);
    expect(r.lines).toEqual(["Daggett Sprint, Juan's run: already here."]);
    expect(storage.listRuns()).toMatchObject([{ id: "my-run", imported: false }]);
  });
});

describe("sharing a run", () => {
  it("includes the course only while it is on the run's revision", () => {
    const run = fly(daggett, "Juan", "my-run");
    expect(runFile(storage, run).withCourse).toBe(true);
    storage.saveCourse({ ...daggett, gates: daggett.gates.map((g) => ({ ...g, widthM: 120 })) });
    expect(runFile(storage, run).withCourse).toBe(false);
  });

  it("re-reads imported runs from disk after a restart", () => {
    importFiles(storage, [file("r.pylonrun", packRun(fly(daggett, "Rodeo", "rodeo-run"), null, zlibCodec))]);
    storage.saveRun(fly(daggett, "Juan", "my-run"));
    const again = new Storage(userData);
    expect(
      again
        .listRuns()
        .map((r) => [r.id, r.imported])
        .sort(),
    ).toEqual([
      ["my-run", false],
      ["rodeo-run", true],
    ]);
  });
});
