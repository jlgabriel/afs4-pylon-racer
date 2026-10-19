// AFS4's UDP broadcast (ForeFlight protocol, port 49002), plain text, one sentence per packet:
//
//   XGPS<sim>,<lon>,<lat>,<alt MSL m>,<track deg>,<groundspeed m/s>
//   XATT<sim>,<heading deg>,<pitch deg>,<roll deg>
//
// Measured on AFS4: ~4.9 Hz each with an aircraft loaded, ~3.3 Hz in the menus (with lon/lat 0,0).
// XATT carries no position, so the assembler merges the latest attitude into each XGPS fix.
import type { Fix } from "../race/fix";

export const FOREFLIGHT_PORT = 49002;

export interface Xgps {
  lon: number;
  lat: number;
  altMslM: number;
  trackDeg: number;
  gsMs: number;
}

export interface Xatt {
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

function numbers(line: string, prefix: string, count: number): number[] | null {
  if (!line.startsWith(prefix)) return null;
  const parts = line.trim().split(",");
  if (parts.length < count + 1) return null;
  const values = parts.slice(1, count + 1).map(Number);
  return values.every(Number.isFinite) ? values : null;
}

export function parseXgps(line: string): Xgps | null {
  const v = numbers(line, "XGPS", 5);
  if (!v) return null;
  return { lon: v[0]!, lat: v[1]!, altMslM: v[2]!, trackDeg: v[3]!, gsMs: v[4]! };
}

export function parseXatt(line: string): Xatt | null {
  const v = numbers(line, "XATT", 3);
  if (!v) return null;
  return { headingDeg: v[0]!, pitchDeg: v[1]!, rollDeg: v[2]! };
}

/** Turns a stream of sentences into fixes. `t` is supplied by the caller (receive time, seconds). */
export class ForeFlightAssembler {
  private att: Xatt = { headingDeg: 0, pitchDeg: 0, rollDeg: 0 };

  /** Returns a fix for an XGPS sentence, null for anything else. */
  feed(line: string, t: number): Fix | null {
    const att = parseXatt(line);
    if (att) {
      this.att = att;
      return null;
    }
    const gps = parseXgps(line);
    if (!gps) return null;
    return { t, ...gps, aglM: null, ...this.att };
  }
}
