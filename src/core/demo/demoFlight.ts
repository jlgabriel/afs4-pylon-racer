// A synthetic flight through a course, used by the demo mode (try the app without the sim), by the
// tests, and for screenshots. It flies straight lines through the gate centers in race order, at a
// constant speed, with a lead-in before the start and a lead-out after the end; the bank angle is the
// coordinated-turn bank for the heading change, so attitude-dependent screens have something to show.
import { raceSequence, type Course } from "../course/course";
import { destination, fromLocal, haversine, initialBearing, toLocal, wrap180, type LonLat } from "../geo/geo";
import type { Fix } from "../race/fix";

export interface DemoOptions {
  speedMs?: number;
  rateHz?: number;
  /** Height above the gates' terrain (or above sea level when the terrain is unknown). */
  heightM?: number;
  leadInM?: number;
  leadOutM?: number;
}

const G = 9.80665;

export function demoFlight(course: Course, opts: DemoOptions = {}): Fix[] {
  const speed = opts.speedMs ?? 80;
  const rate = opts.rateHz ?? 10;
  const height = opts.heightM ?? 30;
  const seq = raceSequence(course);
  const first = course.gates[seq[0]!]!;
  const last = course.gates[seq[seq.length - 1]!]!;

  const waypoints: LonLat[] = [destination(first.center, opts.leadInM ?? 400, first.headingDeg + 180)];
  for (const gi of seq) waypoints.push(course.gates[gi]!.center);
  waypoints.push(destination(last.center, opts.leadOutM ?? 300, last.headingDeg));

  const ref = waypoints[0]!;
  const pts = waypoints.map((w) => toLocal(w, ref));
  const lens = waypoints.slice(1).map((w, i) => haversine(waypoints[i]!, w));
  const totalLen = lens.reduce((a, b) => a + b, 0);
  const step = speed / rate;

  const raw: { p: LonLat; track: number }[] = [];
  for (let s = 0; s <= totalLen; s += step) {
    let rem = s;
    let i = 0;
    while (i < lens.length - 1 && rem > lens[i]!) rem -= lens[i++]!;
    const f = lens[i]! > 0 ? rem / lens[i]! : 0;
    const a = pts[i]!;
    const b = pts[i + 1]!;
    raw.push({
      p: fromLocal({ x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }, ref),
      track: initialBearing(waypoints[i]!, waypoints[i + 1]!),
    });
  }

  const elevAt = (p: LonLat): number => {
    let best = course.gates[0]!;
    for (const g of course.gates) if (haversine(g.center, p) < haversine(best.center, p)) best = g;
    return best.groundElevM ?? 0;
  };

  return raw.map((r, i) => {
    const before = raw[Math.max(0, i - 2)]!.track;
    const after = raw[Math.min(raw.length - 1, i + 2)]!.track;
    const turnRate = (wrap180(after - before) * Math.PI) / 180 / (4 / rate); // rad/s over ±2 samples
    const roll = (Math.atan((speed * turnRate) / G) * 180) / Math.PI;
    return {
      t: i / rate,
      lon: r.p.lon,
      lat: r.p.lat,
      altMslM: elevAt(r.p) + height,
      aglM: height,
      trackDeg: r.track,
      gsMs: speed,
      headingDeg: r.track,
      pitchDeg: 0,
      rollDeg: Math.max(-80, Math.min(80, roll)),
    };
  });
}
