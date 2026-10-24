import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { courseRevision } from "../src/core/course/course";
import { sampleCourses } from "../src/core/demo/sampleCourses";
import { MARKER_FILE } from "../src/core/export/poi";
import { summarizeCourse } from "../src/core/run/summaries";
import { Afs4NotFoundError, Installer } from "../src/main/installer";

const ASSETS = path.resolve(import.meta.dirname, "..", "assets", "pylons");
const sprint = sampleCourses().find((c) => c.id === "munich-sprint")!;

let userDir: string;
let poi: string;
let installer: Installer;

beforeEach(() => {
  userDir = mkdtempSync(path.join(tmpdir(), "racer-afs4-"));
  poi = path.join(userDir, "scenery", "poi");
  installer = new Installer(() => userDir, ASSETS, "0.2.0-test");
});

describe("installing a course", () => {
  it("writes the .tsl, the models it uses, the license and the marker", () => {
    const got = installer.install(sprint);
    expect(got.folderName).toBe("e01187n4838_pr_munich_sprint");
    const dir = path.join(poi, got.folderName);
    expect(readdirSync(dir).sort()).toEqual(
      ["PYLON_MODEL_LICENSE.txt", "pr_munich_sprint.tsl", MARKER_FILE, "pylon_1", "pylon_blue", "pylon_green", "pylon_red"].sort(),
    );
    expect(existsSync(path.join(dir, "pylon_red", "_pylonred.tmb"))).toBe(true);
    const marker = JSON.parse(readFileSync(path.join(dir, MARKER_FILE), "utf8"));
    expect(marker).toMatchObject({ app: "pylon-racer", courseId: "munich-sprint", revision: courseRevision(sprint) });
    expect(installer.list().map((p) => p.courseId)).toEqual(["munich-sprint"]);
  });

  it("copies Rodeo's models, with their credits, for a course that uses them", () => {
    const course = { ...sprint, gates: sprint.gates.map((g, i) => ({ ...g, pylon: i === 0 ? "rodeo-reno" : "rodeo-18" })) };
    const dir = path.join(poi, installer.install(course).folderName);
    expect(readdirSync(dir).sort()).toEqual(
      ["PYLON_MODEL_LICENSE.txt", "pr_munich_sprint.tsl", MARKER_FILE, "rodeo_air_race_18_4", "rodeo_reno_3"].sort(),
    );
    expect(readdirSync(path.join(dir, "rodeo_air_race_18_4")).sort()).toEqual(
      ["__CREDITS.txt", "pylon_air_race.ttx", "pylon_air_race_18_4.tmb"].sort(),
    );
    expect(readdirSync(path.join(dir, "rodeo_reno_3")).sort()).toEqual(["__CREDITS.txt", "pylon_reno.ttx", "pylon_reno_3.tmb"].sort());
  });

  it("is out of date when a pylon model changed, even one of the same height", () => {
    installer.install(sprint);
    const state = (c: typeof sprint) => summarizeCourse(c, [], installer.list()).install.state;
    expect(state(sprint)).toBe("current");
    // Red → Rodeo 25 m: the course's own pylon height is 25 m, so the revision does not change.
    const swapped = { ...sprint, gates: sprint.gates.map((g, i) => (i === 1 ? { ...g, pylon: "rodeo-25" } : g)) };
    expect(courseRevision(swapped)).toBe(courseRevision(sprint));
    expect(state(swapped)).toBe("outdated");
    expect(state({ ...sprint, name: "Renamed" })).toBe("current");
  });

  it("trusts the revision alone for folders installed before the scenery id existed", () => {
    const dir = path.join(poi, installer.install(sprint).folderName);
    const marker = JSON.parse(readFileSync(path.join(dir, MARKER_FILE), "utf8"));
    delete marker.sceneryId;
    writeFileSync(path.join(dir, MARKER_FILE), JSON.stringify(marker));
    const swapped = { ...sprint, gates: sprint.gates.map((g, i) => (i === 1 ? { ...g, pylon: "rodeo-25" } : g)) };
    expect(summarizeCourse(swapped, [], installer.list()).install.state).toBe("current");
  });

  it("leaves no staging folder behind", () => {
    installer.install(sprint);
    expect(readdirSync(poi).filter((n) => n.startsWith("."))).toEqual([]);
  });

  it("replaces the course's previous folder when its gates moved the coordinate prefix", () => {
    installer.install(sprint);
    const moved = { ...sprint, gates: sprint.gates.map((g) => ({ ...g, center: { lon: g.center.lon + 0.5, lat: g.center.lat } })) };
    const got = installer.install(moved);
    expect(readdirSync(poi)).toEqual([got.folderName]);
    expect(got.folderName.startsWith("e01237n4838")).toBe(true);
  });

  it("refuses when the AFS4 user folder does not exist", () => {
    const missing = new Installer(() => path.join(userDir, "nope"), ASSETS, "x");
    expect(() => missing.install(sprint)).toThrow(Afs4NotFoundError);
  });
});

describe("never touching what is not ours", () => {
  it("ignores and keeps other POIs, even with our name pattern but no marker", () => {
    mkdirSync(path.join(poi, "e01905n4750_budapestensemble"), { recursive: true });
    mkdirSync(path.join(poi, "e01187n4838_munich_sprint"), { recursive: true }); // the old tool's
    mkdirSync(path.join(poi, "e01187n4838_pr_munich_sprint_lookalike"), { recursive: true }); // no marker
    installer.install(sprint);
    installer.uninstall("munich-sprint");
    expect(readdirSync(poi).sort()).toEqual(
      ["e01187n4838_munich_sprint", "e01187n4838_pr_munich_sprint_lookalike", "e01905n4750_budapestensemble"].sort(),
    );
  });

  it("does not trust a marker inside a folder whose name it could not have made", () => {
    const foreign = path.join(poi, "e01187n4838_someone_else");
    mkdirSync(foreign, { recursive: true });
    writeFileSync(
      path.join(foreign, MARKER_FILE),
      JSON.stringify({ app: "pylon-racer", courseId: "munich-sprint", courseName: "x", revision: "r", installedAt: "t", appVersion: "v" }),
    );
    installer.uninstall("munich-sprint");
    expect(existsSync(foreign)).toBe(true);
  });
});
