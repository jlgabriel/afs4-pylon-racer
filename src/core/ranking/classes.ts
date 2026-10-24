// Aircraft classes: rankings compare runs within a class only. The keys are AFS4 aircraft folder ids
// exactly as they appear on disk and as AeroflyReader.dll reports them in `aircraft_name` — never
// typed from memory: a wrong id just falls through to "unclassified" without any error.

export const AIRCRAFT_CLASSES = [
  { id: "aerobatic", label: "Aerobatic" },
  { id: "vintage", label: "Vintage & warbird" },
  { id: "ga", label: "General aviation" },
  { id: "jet", label: "Jet" },
  { id: "helicopter", label: "Helicopter" },
  { id: "glider", label: "Glider" },
  { id: "heavy", label: "Heavy" },
] as const;

export type AircraftClassId = (typeof AIRCRAFT_CLASSES)[number]["id"];

const CLASS_OF: Readonly<Record<string, AircraftClassId>> = {
  extra330: "aerobatic",
  pitts: "aerobatic",
  jungmeister: "aerobatic",
  swift: "aerobatic",
  camel: "vintage",
  dr1: "vintage",
  bf109e: "vintage",
  f4u: "vintage",
  p38: "vintage",
  ju52: "vintage",
  c172: "ga",
  dr400: "ga",
  b58: "ga",
  c90gtx: "ga",
  mb339: "jet",
  me262: "jet",
  f15e: "jet",
  f18: "jet",
  lj45: "jet",
  r22: "helicopter",
  ec135: "helicopter",
  uh60: "helicopter",
  asg29: "glider",
  ask21: "glider",
  antares: "glider",
  a319: "heavy",
  a320: "heavy",
  a320_neo: "heavy",
  a321: "heavy",
  a321_xlr: "heavy",
  a350_1000: "heavy",
  a380: "heavy",
  b737: "heavy",
  b737_800: "heavy",
  b737_900: "heavy",
  b737_max9: "heavy",
  b747: "heavy",
  b777_300er: "heavy",
  b777f: "heavy",
  b787: "heavy",
  b787_9: "heavy",
  crj900: "heavy",
  q400: "heavy",
  concorde: "heavy",
};

/** The class of a built-in aircraft, or null for one we do not know (user aircraft, new releases). */
export function classOfAircraft(aircraftId: string | null): AircraftClassId | null {
  if (!aircraftId) return null;
  return CLASS_OF[aircraftId] ?? null;
}

export function classLabel(id: string | null): string {
  return AIRCRAFT_CLASSES.find((c) => c.id === id)?.label ?? "Unclassified";
}

export function isClassId(id: unknown): id is AircraftClassId {
  return AIRCRAFT_CLASSES.some((c) => c.id === id);
}

/** Classes the pilot chose where the app cannot tell: aircraft it does not know (user aircraft, new
 *  releases) and flying without an aircraft name (UDP). Built-in aircraft keep their own class. */
export interface ClassChoices {
  aircraft: Readonly<Record<string, string>>;
  noAircraft: string | null;
}

export const NO_CHOICES: ClassChoices = { aircraft: {}, noAircraft: null };

/** The class a run with this aircraft is ranked in; null = unclassified. */
export function resolveClass(aircraftId: string | null, choices: ClassChoices): AircraftClassId | null {
  if (!aircraftId) return isClassId(choices.noAircraft) ? choices.noAircraft : null;
  const chosen = choices.aircraft[aircraftId];
  return classOfAircraft(aircraftId) ?? (isClassId(chosen) ? chosen : null);
}
