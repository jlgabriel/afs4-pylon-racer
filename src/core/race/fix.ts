// One aircraft state sample, whatever the telemetry source. Units are fixed here so every source
// converts on the way in: degrees, meters, meters per second, seconds.

export interface Fix {
  /** Source timestamp in seconds, monotonic within one session. */
  t: number;
  lon: number;
  lat: number;
  altMslM: number;
  /** Height above the ground from the sim itself; null when the source has none (UDP). */
  aglM: number | null;
  trackDeg: number;
  gsMs: number;
  headingDeg: number;
  pitchDeg: number;
  /** Bank, positive = right wing down. */
  rollDeg: number;
}

/** AFS4 reports lon 0, lat 0 while it sits in the menus; that is "no flight", not a position. */
export function isNullIsland(f: Pick<Fix, "lon" | "lat">): boolean {
  return Math.abs(f.lon) < 1e-6 && Math.abs(f.lat) < 1e-6;
}
