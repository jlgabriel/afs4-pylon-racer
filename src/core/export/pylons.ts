// The pylon models a course can use, vendored in assets/pylons/<dir>/<tmb>.tmb (each folder also
// holds the model's texture, which AFS4 needs next to it):
// - krzysk1's Reno air-race pylons (MIT, assets/pylons/__LICENSE.txt). Compiled .tmb: height unknown.
// - Rodeo's air-race pylons, shipped with the author's permission (each folder has its __CREDITS.txt,
//   which travels with the model into the installed scenery). Heights read from their geometry.
// Ids are stored in course files (gate.pylon), so they never change.
import type { GateType, Rules } from "../course/course";

export interface PylonModel {
  id: string;
  label: string;
  /** Map color (token-independent: it describes the model's real paint; Rodeo's are placeholders
   *  until someone sees them in the sim). */
  color: string;
  /** Folder under assets/pylons/, copied as-is into the installed scenery. */
  dir: string;
  /** .tmb base name inside `dir`; the .tsl references it as "<dir>/<tmb>". */
  tmb: string;
  /** Real height of the model, m (top of its geometry); null = unknown, the course's
   *  `pylonHeightM` stands in for it. */
  heightM: number | null;
}

export const PYLONS: readonly PylonModel[] = [
  { id: "red", label: "Red", color: "#e23b3b", dir: "pylon_red", tmb: "_pylonred", heightM: null },
  { id: "green", label: "Green", color: "#27a844", dir: "pylon_green", tmb: "_pylongreen", heightM: null },
  { id: "blue", label: "Blue", color: "#2f6fd6", dir: "pylon_blue", tmb: "_pylonblue", heightM: null },
  { id: "home", label: "Home (tall)", color: "#f59e0b", dir: "pylon_1", tmb: "_pylon1", heightM: null },
  { id: "home2", label: "Home 2", color: "#eab308", dir: "pylon_2", tmb: "_pylon2", heightM: null },
  { id: "rgb", label: "RGB", color: "#8b5cf6", dir: "pylon_rgb", tmb: "_pylonrgb", heightM: null },
  { id: "rb", label: "Red-Blue", color: "#c0399b", dir: "pylon_rb", tmb: "_pylonrb", heightM: null },
  // Rodeo's: bounding boxes 2.10 × 2.10 × 15.18 m, 4 × 4 × 18 m and 5 × 5 × 25 m.
  { id: "rodeo-reno", label: "Rodeo Reno 15 m", color: "#ea580c", dir: "rodeo_reno_3", tmb: "pylon_reno_3", heightM: 15.18 },
  { id: "rodeo-18", label: "Rodeo Air Race 18 m", color: "#0891b2", dir: "rodeo_air_race_18_4", tmb: "pylon_air_race_18_4", heightM: 18 },
  { id: "rodeo-25", label: "Rodeo Air Race 25 m", color: "#0e7490", dir: "rodeo_air_race_25_5", tmb: "pylon_air_race_25_5", heightM: 25 },
];

export const PYLON_LICENSE_FILE = "__LICENSE.txt";

export const DEFAULT_PYLON: Record<GateType, string> = {
  start: "green",
  finish: "home",
  gate: "red",
  level: "blue",
  knife: "rgb",
  inverted: "rb",
  turn: "home2",
};

/** The model a gate uses: its own choice if it is a known id, else the default for its type. */
export function pylonFor(gate: { type: GateType; pylon: string | null }): PylonModel {
  const byId = (id: string | null): PylonModel | undefined => PYLONS.find((p) => p.id === id);
  return byId(gate.pylon) ?? byId(DEFAULT_PYLON[gate.type]) ?? PYLONS[0]!;
}

/** How tall a gate's pylons are for the pylon-hit rule: the model's own height when known, else
 *  the course-wide `pylonHeightM`. */
export function pylonHeightFor(gate: { type: GateType; pylon: string | null }, rules: Pick<Rules, "pylonHeightM">): number {
  return pylonFor(gate).heightM ?? rules.pylonHeightM;
}
