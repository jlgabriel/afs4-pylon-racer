// The pylon models a course can use: krzysk1's Reno air-race pylons (MIT), vendored in
// assets/pylons/<dir>/<tmb>.tmb. Ids are stored in course files (gate.pylon), so they never change.
import type { GateType } from "../course/course";

export interface PylonModel {
  id: string;
  label: string;
  /** Map color (token-independent: it describes the model's real paint). */
  color: string;
  /** Folder under assets/pylons/, copied as-is into the installed scenery. */
  dir: string;
  /** .tmb base name inside `dir`; the .tsl references it as "<dir>/<tmb>". */
  tmb: string;
}

export const PYLONS: readonly PylonModel[] = [
  { id: "red", label: "Red", color: "#e23b3b", dir: "pylon_red", tmb: "_pylonred" },
  { id: "green", label: "Green", color: "#27a844", dir: "pylon_green", tmb: "_pylongreen" },
  { id: "blue", label: "Blue", color: "#2f6fd6", dir: "pylon_blue", tmb: "_pylonblue" },
  { id: "home", label: "Home (tall)", color: "#f59e0b", dir: "pylon_1", tmb: "_pylon1" },
  { id: "home2", label: "Home 2", color: "#eab308", dir: "pylon_2", tmb: "_pylon2" },
  { id: "rgb", label: "RGB", color: "#8b5cf6", dir: "pylon_rgb", tmb: "_pylonrgb" },
  { id: "rb", label: "Red-Blue", color: "#c0399b", dir: "pylon_rb", tmb: "_pylonrb" },
];

export const PYLON_LICENSE_FILE = "__LICENSE.txt";

export const DEFAULT_PYLON: Record<GateType, string> = {
  start: "green",
  finish: "home",
  gate: "red",
  level: "blue",
  knife: "rgb",
  turn: "home2",
};

/** The model a gate uses: its own choice if it is a known id, else the default for its type. */
export function pylonFor(gate: { type: GateType; pylon: string | null }): PylonModel {
  const byId = (id: string | null): PylonModel | undefined => PYLONS.find((p) => p.id === id);
  return byId(gate.pylon) ?? byId(DEFAULT_PYLON[gate.type]) ?? PYLONS[0]!;
}
