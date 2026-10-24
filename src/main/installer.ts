// Installs a course's pylons into AFS4 as a POI folder (scenery/poi/<coord>_pr_<slug>/). The app
// only ever creates, replaces or removes folders that BOTH have a name it could have produced AND
// contain its marker file: the user's scenery/poi/ holds other people's scenery and their own tests.
//
// A course has at most one installed folder. Moving its gates can change the coordinate prefix, so
// installing removes any older folder carrying the same course id. AFS4 reads POIs at startup: a
// new or changed install shows up after restarting the simulator.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Course } from "../core/course/course";
import { courseRevision } from "../core/course/course";
import { PYLON_LICENSE_FILE } from "../core/export/pylons";
import { MARKER_FILE, isOurPoiFolderName, planPoi, type PoiMarker } from "../core/export/poi";

const markerSchema = z.object({
  app: z.literal("pylon-racer"),
  courseId: z.string(),
  courseName: z.string(),
  revision: z.string(),
  sceneryId: z.string().optional(),
  installedAt: z.string(),
  appVersion: z.string(),
});

export interface InstalledPoi extends PoiMarker {
  folderName: string;
}

export class Afs4NotFoundError extends Error {
  constructor(readonly dir: string) {
    super(`Aerofly FS 4 user folder not found: ${dir}`);
  }
}

/** The AFS4 user folder (the one holding scenery/) for this OS. On Windows pass Electron's
 *  Documents path, which honours a Documents folder moved to OneDrive. */
export function defaultAfs4UserDir(documentsDir: string): string {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Aerofly FS 4");
  if (process.platform === "win32") return path.join(documentsDir, "Aerofly FS 4");
  return path.join(os.homedir(), "Aerofly FS 4");
}

export class Installer {
  constructor(
    private readonly userDir: () => string,
    private readonly assetsDir: string,
    private readonly appVersion: string,
  ) {}

  poiRoot(): string {
    return path.join(this.userDir(), "scenery", "poi");
  }

  userDirExists(): boolean {
    return existsSync(this.userDir());
  }

  list(): InstalledPoi[] {
    const root = this.poiRoot();
    let names: string[];
    try {
      names = readdirSync(root);
    } catch {
      return [];
    }
    const out: InstalledPoi[] = [];
    for (const folderName of names) {
      if (!isOurPoiFolderName(folderName)) continue;
      const marker = readMarker(path.join(root, folderName));
      if (marker) out.push({ ...marker, folderName });
    }
    return out;
  }

  install(course: Course): InstalledPoi {
    if (!this.userDirExists()) throw new Afs4NotFoundError(this.userDir());
    const root = this.poiRoot();
    mkdirSync(root, { recursive: true });
    const plan = planPoi(course);

    // Build beside the destination under a name AFS4 will not read (no coordinate prefix), then
    // swap it in with a rename.
    const staging = path.join(root, `.racer-staging-${plan.folderName}`);
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging);
    try {
      writeFileSync(path.join(staging, plan.tslName), plan.tsl, "utf8");
      for (const dir of plan.modelDirs) {
        cpSync(path.join(this.assetsDir, dir), path.join(staging, dir), { recursive: true });
      }
      cpSync(path.join(this.assetsDir, PYLON_LICENSE_FILE), path.join(staging, "PYLON_MODEL_LICENSE.txt"));
      const marker: PoiMarker = {
        app: "pylon-racer",
        courseId: course.id,
        courseName: course.name,
        revision: courseRevision(course),
        sceneryId: plan.sceneryId,
        installedAt: new Date().toISOString(),
        appVersion: this.appVersion,
      };
      writeFileSync(path.join(staging, MARKER_FILE), JSON.stringify(marker, null, 2) + "\n", "utf8");

      this.removeCourse(course.id);
      renameSync(staging, path.join(root, plan.folderName));
      return { ...marker, folderName: plan.folderName };
    } catch (e) {
      rmSync(staging, { recursive: true, force: true });
      throw e;
    }
  }

  /** Remove every folder this app installed for the course. Returns the folder names removed. */
  uninstall(courseId: string): string[] {
    return this.removeCourse(courseId);
  }

  private removeCourse(courseId: string): string[] {
    const removed: string[] = [];
    for (const poi of this.list()) {
      if (poi.courseId !== courseId) continue;
      rmSync(path.join(this.poiRoot(), poi.folderName), { recursive: true, force: true });
      removed.push(poi.folderName);
    }
    return removed;
  }
}

function readMarker(dir: string): PoiMarker | null {
  try {
    return markerSchema.parse(JSON.parse(readFileSync(path.join(dir, MARKER_FILE), "utf8")));
  } catch {
    return null;
  }
}
