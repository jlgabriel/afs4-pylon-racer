// AeroflyReader.dll (MIT, github.com/jlgabriel/Aerofly-FS4-Bridge, `simplified/`): an AFS4 external
// DLL, Windows only, that streams one JSON object per line over TCP (127.0.0.1:12345).
//
// Units as MEASURED in AFS4, which differ from the DLL's own README: latitude/longitude and angles
// in RADIANS; `altitude` and `height` in METERS (not feet); speeds in m/s. Longitude may come in
// [0, 2π) and is normalized to ±180°. `aircraft_name` is the aircraft's folder id (e.g. "c172").
// It runs at ~40 Hz with an aircraft loaded, ~10 Hz in the menus (with lat/lon 0).
import { z } from "zod";
import { wrap180, wrap360 } from "../geo/geo";
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
  velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  aircraft_name: z.string().optional(),
});

export interface ReaderSample {
  fix: Fix;
  aircraft: string | null;
  sourceHz: number | null;
}

const DEG = 180 / Math.PI;

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
  const heading = wrap360(d.true_heading * DEG);
  const name = d.aircraft_name && d.aircraft_name !== "Unknown" ? d.aircraft_name : null;
  return {
    fix: {
      t,
      lon: wrap180(d.longitude * DEG),
      lat: d.latitude * DEG,
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
