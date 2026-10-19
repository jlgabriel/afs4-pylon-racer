// North-up course map: the gate pass lines exactly as the engine judges them, the next gate
// highlighted, the flown trail and the aircraft. Fits the course (and the aircraft, when it is near)
// into the box.
import { useMemo } from "react";
import type { Course, GateType } from "../../core/course/course";
import { centroid, haversine, toLocal, type LonLat, type Xy } from "../../core/geo/geo";
import { gatePassLine } from "../../core/race/engine";
import type { Fix } from "../../core/race/fix";
import type { TrailPoint } from "../state/store";

const W = 400;
const H = 300;
const PAD = 28;
/** The aircraft only joins the framing while it is this close to the course. */
const FRAME_AIRCRAFT_WITHIN_M = 3000;

const GATE_COLOR: Record<GateType, string> = {
  start: "var(--gate-start)",
  finish: "var(--gate-finish)",
  gate: "var(--gate-gate)",
  level: "var(--gate-level)",
  knife: "var(--gate-knife)",
  turn: "var(--gate-turn)",
};

interface Props {
  course: Course;
  nextGate: number | null;
  passed: ReadonlySet<number>;
  fix: Fix | null;
  trail: readonly TrailPoint[];
}

export function MiniMap({ course, nextGate, passed, fix, trail }: Props) {
  const ref = useMemo(() => centroid(course.gates.map((g) => g.center)), [course]);
  const lines = useMemo(
    () =>
      course.gates.map((g) => {
        const { a, b } = gatePassLine(g);
        return { a: toLocal(a, ref), b: toLocal(b, ref), type: g.type };
      }),
    [course, ref],
  );

  const near = fix !== null && haversine(fix, ref) < FRAME_AIRCRAFT_WITHIN_M;
  const framed: Xy[] = lines.flatMap((l) => [l.a, l.b]);
  if (near && fix) framed.push(toLocal(fix, ref));
  const xs = framed.map((p) => p.x);
  const ys = framed.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((W - 2 * PAD) / Math.max(maxX - minX, 1), (H - 2 * PAD) / Math.max(maxY - minY, 1));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const sx = (p: Xy): number => W / 2 + (p.x - cx) * scale;
  const sy = (p: Xy): number => H / 2 - (p.y - cy) * scale;
  const at = (p: LonLat): Xy => toLocal(p, ref);

  const centers = course.gates.map((g) => at(g.center));
  const route = [...centers, ...(course.laps > 1 ? [centers[0]!] : [])];

  const trailPath = trail
    .map((p, i) => {
      const q = at(p);
      return `${i === 0 ? "M" : "L"}${sx(q).toFixed(1)},${sy(q).toFixed(1)}`;
    })
    .join("");

  const plane = fix ? at(fix) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="minimap" role="img" aria-label="Course map">
      <polyline
        points={route.map((p) => `${sx(p)},${sy(p)}`).join(" ")}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {trailPath && <path d={trailPath} fill="none" stroke="var(--info)" strokeWidth={2} />}
      {lines.map((l, i) => {
        const isNext = i === nextGate;
        const done = passed.has(i) && !isNext;
        return (
          <g key={i} opacity={done ? 0.45 : 1}>
            {isNext && (
              <line x1={sx(l.a)} y1={sy(l.a)} x2={sx(l.b)} y2={sy(l.b)} stroke="var(--text-1)" strokeWidth={9} strokeLinecap="round" opacity={0.25} />
            )}
            <line x1={sx(l.a)} y1={sy(l.a)} x2={sx(l.b)} y2={sy(l.b)} stroke={GATE_COLOR[l.type]} strokeWidth={3} strokeLinecap="round" />
            <circle cx={sx(l.a)} cy={sy(l.a)} r={4} fill={GATE_COLOR[l.type]} />
            {l.type !== "turn" && <circle cx={sx(l.b)} cy={sy(l.b)} r={4} fill={GATE_COLOR[l.type]} />}
            <text x={sx(centers[i]!) + 8} y={sy(centers[i]!) - 8} className="minimap-label">
              {i + 1}
            </text>
          </g>
        );
      })}
      {plane && near && fix && (
        <g transform={`translate(${sx(plane)},${sy(plane)}) rotate(${fix.headingDeg})`}>
          <path d="M0,-9 L6,7 L0,3 L-6,7 Z" fill="var(--text-1)" stroke="var(--surface-0)" strokeWidth={1} />
        </g>
      )}
      {fix && !near && (
        <text x={W / 2} y={H - 8} textAnchor="middle" className="minimap-label">
          Aircraft {(haversine(fix, ref) / 1000).toFixed(1)} km from the course
        </text>
      )}
    </svg>
  );
}
