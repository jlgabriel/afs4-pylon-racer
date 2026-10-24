// A course as installable AFS4 scenery: a POI folder under scenery/poi/ holding one .tsl text file
// (a "simple scenery place" in lon/lat with one object per pylon) and the pylon model folders it
// uses. Pure: this builds the plan; main/installer.ts does the file I/O.
//
// AFS4 only loads a POI whose folder name starts with the coordinates of the place, encoded as
// e/w + |lon|×100 (5 digits) + n/s + |lat|×100 (4 digits), e.g. "e01185n4838_…". A wrong or
// missing prefix fails silently: the objects never appear.
import { fnv1a64, type Course } from "../course/course";
import { centroid, pylonsOfGate, type LonLat } from "../geo/geo";
import { pylonFor } from "./pylons";

/** Marker file written into every folder the app installs; nothing else is ever touched or removed. */
export const MARKER_FILE = "pylon-racer.json";

/** Python-compatible round-half-to-even, so names match the earlier tool's for the same course. */
export function bankersRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function encodeLonLat(p: LonLat): string {
  const ew = p.lon >= 0 ? "e" : "w";
  const ns = p.lat >= 0 ? "n" : "s";
  const lon = String(bankersRound(Math.abs(p.lon) * 100)).padStart(5, "0");
  const lat = String(bankersRound(Math.abs(p.lat) * 100)).padStart(4, "0");
  return `${ew}${lon}${ns}${lat}`;
}

/** A folder name the app could have produced: coordinate prefix + "pr_" + lowercase slug. */
export function isOurPoiFolderName(name: string): boolean {
  return /^[ew]\d{5}[ns]\d{4}_pr_[a-z0-9_]{1,80}$/.test(name);
}

export function poiSlug(courseId: string): string {
  return (
    "pr_" +
    courseId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80)
  );
}

export interface PoiPlan {
  folderName: string;
  tslName: string;
  tsl: string;
  /** Pylon model folders to copy next to the .tsl. */
  modelDirs: string[];
  pylonCount: number;
  /** Changes whenever a pylon moves or changes model, even when the course revision does not (a
   *  model of the same height): the installed folder is then out of date. The name is left out. */
  sceneryId: string;
}

export interface PoiMarker {
  app: "pylon-racer";
  courseId: string;
  courseName: string;
  revision: string;
  /** PoiPlan.sceneryId of what was installed; absent in folders installed before v0.4. */
  sceneryId?: string;
  installedAt: string;
  appVersion: string;
}

/** Strip what would break the bracketed text grammar of the .tsl. */
function tslText(s: string): string {
  return s.replace(/[[\]<>\r\n]/g, " ").trim() || "Pylon course";
}

export function planPoi(course: Course): PoiPlan {
  const objects: { at: LonLat; geometry: string }[] = [];
  const dirs = new Set<string>();
  for (const g of course.gates) {
    const model = pylonFor(g);
    dirs.add(model.dir);
    const geometry = `${model.dir}/${model.tmb}`;
    if (g.type === "turn") {
      objects.push({ at: g.center, geometry });
    } else {
      const { left, right } = pylonsOfGate(g.center, g.widthM, g.headingDeg);
      objects.push({ at: left, geometry }, { at: right, geometry });
    }
  }

  const slug = poiSlug(course.id);
  const blocks = objects.map(
    (o, i) =>
      `            <[tmsimulator_scenery_object][element][${i}]\n` +
      `                <[string8][type][object]>\n` +
      `                <[string8][geometry][${o.geometry}]>\n` +
      `                <[vector3_float64][position][${o.at.lon.toFixed(7)} ${o.at.lat.toFixed(7)} 0]>\n` +
      `                <[int32][autoheight_override][-1]>\n` +
      `            >\n`,
  );

  // autoheight: the pylons sit on AFS4's own terrain wherever they are placed.
  const tsl =
    "<[file][][]\n" +
    "    <[tmsimulator_scenery_place_simple][][]\n" +
    `        <[string8][name][${tslText(course.name)}]>\n` +
    "        <[string8u][coordinate_system][lonlat]>\n" +
    "        <[bool][autoheight][true]>\n" +
    "        <[string8u][geometry][]>\n" +
    "        <[string8u][cultivation][]>\n" +
    "        <[list_tmsimulator_scenery_object][objects][]\n" +
    blocks.join("\n") +
    "        >\n" +
    "    >\n" +
    ">\n";

  return {
    folderName: `${encodeLonLat(centroid(course.gates.map((g) => g.center)))}_${slug}`,
    tslName: `${slug}.tsl`,
    tsl,
    modelDirs: [...dirs].sort(),
    pylonCount: objects.length,
    sceneryId: fnv1a64(blocks.join("")),
  };
}
