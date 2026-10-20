// AeroflyReader.dll (MIT, github.com/jlgabriel/Aerofly-FS4-Bridge, `simplified/`): an AFS4 external
// DLL, Windows only, that streams one JSON object per line over TCP (127.0.0.1:12345).
//
// Units as MEASURED in AFS4, which differ from the DLL's own README: latitude/longitude and angles
// in RADIANS; `altitude` and `height` in METERS (not feet); speeds in m/s. Longitude may come in
// [0, 2π) and is normalized to ±180°. `aircraft_name` is the aircraft's folder id (e.g. "c172").
//
// `true_heading` is NOT a compass heading: it is a math angle, counter-clockwise from east, so
// compass = 90° − true_heading (same instant on a runway: UDP heading 69.9°, DLL 20.1°). The sign
// lives only in compassFromReader(). Pitch and bank match the UDP's signs as they are.
// It runs at ~40 Hz with an aircraft loaded, ~10 Hz in the menus (with lat/lon 0).
//
// Position: `latitude`/`longitude` are printed with 6 decimals of a RADIAN, i.e. steps of ~6.4 m
// north–south (measured at KDAG, 2026-10-19) — as coarse as the pylon-hit radius. `position` is the
// same point as WGS84 ECEF meters with 2 decimals (1 cm), so it is used whenever it is there.
import { z } from "zod";
import { ecefToGeodetic, wrap180, wrap360 } from "../geo/geo";
import type { Fix } from "../race/fix";

export const READER_PORT = 12345;

const readerLine = z.object({
  data_valid: z.number(),
  update_hz: z.number().optional(),
  latitude: z.number(),
  longitude: z.number(),
  altitude: z.number(),
  height: z.number(),
  pitch: z.number(),
  bank: z.number(),
  true_heading: z.number(),
  ground_speed: z.number(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  aircraft_name: z.string().optional(),
});

export interface ReaderSample {
  fix: Fix;
  aircraft: string | null;
  sourceHz: number | null;
}

const DEG = 180 / Math.PI;

/** The DLL's heading (radians, counter-clockwise from east) as a compass heading in degrees. */
export function compassFromReader(rad: number): number {
  return wrap360(90 - rad * DEG);
}

/** Parse one JSON line. `t` is the receive time in seconds. Null for anything unusable. */
export function parseReaderLine(line: string, t: number): ReaderSample | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const r = readerLine.safeParse(json);
  if (!r.success || r.data.data_valid !== 1) return null;
  const d = r.data;
  const heading = compassFromReader(d.true_heading);
  const name = d.aircraft_name && d.aircraft_name !== "Unknown" ? d.aircraft_name : null;
  const where = fromPosition(d.position) ?? { lon: wrap180(d.longitude * DEG), lat: d.latitude * DEG };
  return {
    fix: {
      t,
      lon: where.lon,
      lat: where.lat,
      altMslM: d.altitude,
      aglM: d.height,
      // The DLL has no ground track; heading is the closest it offers. The engine never reads it.
      trackDeg: heading,
      gsMs: d.ground_speed,
      headingDeg: heading,
      pitchDeg: d.pitch * DEG,
      rollDeg: d.bank * DEG,
    },
    aircraft: name,
    sourceHz: d.update_hz ?? null,
  };
}

/** The fine position from the ECEF vector; null when absent or not on the Earth (menus send 0s). */
function fromPosition(p: { x: number; y: number; z: number } | undefined): { lon: number; lat: number } | null {
  if (!p) return null;
  const r = Math.hypot(p.x, p.y, p.z);
  if (r < 6_300_000 || r > 6_450_000) return null;
  const g = ecefToGeodetic(p.x, p.y, p.z);
  return { lon: g.lon, lat: g.lat };
}

/** Splits a TCP byte stream into lines, keeping a partial tail between chunks. */
export class LineSplitter {
  private buf = "";

  push(chunk: string): string[] {
    this.buf += chunk;
    const parts = this.buf.split("\n");
    this.buf = parts.pop() ?? "";
    return parts.map((p) => p.trim()).filter((p) => p.length > 0);
  }
}
