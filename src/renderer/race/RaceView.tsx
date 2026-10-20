// The race screen: timer, deltas, gate strip, next gate, map, flight values, result and the runs of
// this course. Everything shown comes from main's live updates; nothing here judges the race.
import { useMemo } from "react";
import type { Course, Gate, GateType } from "../../core/course/course";
import { relativeBearing } from "../../core/geo/geo";
import type { Fix } from "../../core/race/fix";
import type { Pass, Penalty, PenaltyKind, RaceSnapshot } from "../../core/race/engine";
import type { Run } from "../../core/run/run";
import { classLabel } from "../../core/ranking/classes";
import type { LiveState } from "../../core/session/raceSession";
import type { RunSummary, TelemetryStatus } from "../../shared/racerApi";
import { KMH_PER_MS, fmtDelta, fmtDistance, fmtTime } from "../app/format";
import { useStore } from "../state/store";
import { MiniMap } from "./MiniMap";
import { dnfShort, dnfText, gateRequirements, penaltyReason } from "./rulesText";

const GATE_NAME: Record<GateType, string> = {
  start: "Start",
  finish: "Finish",
  gate: "Gate",
  level: "Level gate",
  knife: "Knife-edge gate",
  turn: "Turn pylon",
};

/** Penalties that mean the gate itself was not flown; the others are about HOW it was flown. */
const GATE_LOST: ReadonlySet<PenaltyKind> = new Set(["missed-gate"]);

export function RaceView() {
  const course = useStore((s) => s.selected);
  const update = useStore((s) => s.update);
  const trail = useStore((s) => s.trail);
  const runs = useStore((s) => s.runs);
  const bestRun = useStore((s) => s.bestRun);
  const targetRun = useStore((s) => s.targetRun);
  const resetRace = useStore((s) => s.resetRace);
  const startDemo = useStore((s) => s.startDemo);
  const stopDemo = useStore((s) => s.stopDemo);

  const live = update?.live && course && update.live.courseId === course.id ? update.live : null;
  const race = live?.race ?? null;
  const passed = useMemo(() => new Set(race?.passes.map((p) => p.gateIndex) ?? []), [race]);

  if (!course) {
    return <main className="race empty muted">Select a course on the left.</main>;
  }

  const demoRunning = update?.telemetry.demo.running ?? false;
  const nextGateIndex = live?.nextGate?.index ?? null;
  const lastPass = race && race.passes.length > 0 ? race.passes[race.passes.length - 1]! : null;
  const lastDelta = lastPass && targetRun ? passDelta(lastPass, targetRun) : null;

  return (
    <main className="race">
      <header className="race-head">
        <div className="race-title">
          <h1>{course.name}</h1>
          <div className="muted">
            {course.gates.length} gates{course.laps > 1 ? ` · ${course.laps} laps` : ""}
            {course.author ? ` · by ${course.author}` : ""}
          </div>
          {course.description && <div className="muted race-desc">{course.description}</div>}
          <CourseTools />
        </div>
        <div className="race-actions">
          {demoRunning ? (
            <button onClick={() => void stopDemo()}>Stop demo</button>
          ) : (
            <button onClick={() => void startDemo()} title="Fly this course with a synthetic aircraft, no simulator needed">
              Watch demo
            </button>
          )}
          <button className="primary" onClick={() => void resetRace()}>
            Race again
          </button>
        </div>
      </header>

      <div className="race-grid">
        <section className="panel race-main">
          <StatusLine race={race} telemetry={update?.telemetry ?? null} />
          <div className="label">Race time</div>
          <div className="timer num">{fmtTime(race?.total ?? 0)}</div>
          <div className="deltas">
            {race && race.penaltyTotal > 0 && <span className="bad num">incl. +{race.penaltyTotal.toFixed(1)} s penalties</span>}
            {lastDelta !== null && (
              <span className={`num ${lastDelta < 0 ? "good" : "bad"}`}>
                {fmtDelta(lastDelta)} vs best at gate {lastPass!.gateIndex + 1}
              </span>
            )}
            {course && bestRun && <span className="muted num">best {fmtTime(bestRun.result.total)}</span>}
          </div>

          <GateStrip race={race} />
          {race?.status === "running" && race.penalties.length > 0 && <PenaltyList penalties={race.penalties} course={course} />}

          {nextGateIndex !== null && live?.nextGate && (
            <div className="next-gate">
              <div className="label">Next{race?.status === "waiting" ? " · fly through the start to begin" : ""}</div>
              <div className="next-gate-name">
                {nextGateIndex + 1} · {GATE_NAME[course.gates[nextGateIndex]!.type]}
                {race && race.laps > 1 && race.status === "running" && <span className="muted"> · lap {race.lap} of {race.laps}</span>}
              </div>
              {gateRequirements(course.gates[nextGateIndex]!, course).length > 0 && (
                <div className="next-gate-needs">{gateRequirements(course.gates[nextGateIndex]!, course).join(" · ")}</div>
              )}
              <div className="next-gate-where">
                <span className="num muted">{fmtDistance(live.nextGate.distanceM)}</span>
                {live.fix && <TurnCue fix={live.fix} gate={course.gates[nextGateIndex]!} />}
              </div>
            </div>
          )}

          {race && (race.status === "finished" || race.status === "dnf") && <Result race={race} target={targetRun} course={course} />}
        </section>

        <section className="panel race-side">
          <MiniMap course={course} nextGate={nextGateIndex} passed={passed} fix={live?.fix ?? null} trail={trail} />
          <FlightValues live={live} course={course} />
        </section>
      </div>

      <Runs runs={runs} />
    </main>
  );
}

/** Edit, copy, delete, and the course's pylons in AFS4. */
function CourseTools() {
  const summary = useStore((s) => s.courses.find((c) => c.id === s.selected?.id));
  const busy = useStore((s) => s.busy);
  const edit = useStore((s) => s.editCourse);
  const duplicate = useStore((s) => s.duplicateCourse);
  const remove = useStore((s) => s.deleteCourse);
  const install = useStore((s) => s.installCourse);
  const uninstall = useStore((s) => s.uninstallCourse);
  const state = summary?.install.state ?? "none";
  return (
    <div className="course-tools">
      <button onClick={edit}>Edit</button>
      <button onClick={() => void duplicate()}>Duplicate</button>
      <button onClick={() => void remove()}>Delete</button>
      <span className="course-tools-sep" />
      <span className={`install-state ${state}`}>
        {state === "current" ? "Pylons in AFS4" : state === "outdated" ? "Pylons in AFS4 are out of date" : "Pylons not in AFS4"}
      </span>
      <button disabled={busy} onClick={() => void install()}>
        {state === "none" ? "Install pylons" : "Reinstall"}
      </button>
      {state !== "none" && <button onClick={() => void uninstall()}>Remove</button>}
    </div>
  );
}

/** Which way to turn for the next gate: its center relative to the nose. */
function TurnCue({ fix, gate }: { fix: Fix; gate: Gate }) {
  const rel = relativeBearing(fix, fix.headingDeg, gate.center);
  const abs = Math.abs(Math.round(rel));
  const text = abs <= 10 ? "ahead" : abs >= 170 ? "behind you" : `${abs}° ${rel < 0 ? "left" : "right"}`;
  return (
    <span className={`turn-cue ${abs <= 10 ? "on-course" : ""}`} aria-label={`Next gate ${text}`}>
      <svg viewBox="-12 -12 24 24" className="turn-cue-arrow" aria-hidden>
        <path d="M0,-10 L7,6 L0,2 L-7,6 Z" transform={`rotate(${rel})`} />
      </svg>
      <span className="num">{text}</span>
    </span>
  );
}

function passDelta(pass: Pass, best: Run): number | null {
  const ref = best.passes.find((p) => p.step === pass.step);
  return ref && pass.step > 0 ? pass.elapsed - ref.elapsed : null;
}

function StatusLine({ race, telemetry }: { race: RaceSnapshot | null; telemetry: TelemetryStatus | null }) {
  const text =
    race?.status === "finished"
      ? "Finished"
      : race?.status === "dnf"
        ? "Did not finish"
        : !telemetry?.active
          ? "Waiting for Aerofly FS 4…"
          : race?.status === "running"
            ? "Racing"
            : "Armed — fly through the start gate";
  return <div className={`status-line status-${race?.status ?? "none"}`}>{text}</div>;
}

function GateStrip({ race }: { race: RaceSnapshot | null }) {
  if (!race) return null;
  const missed = new Set(race.penalties.filter((p) => GATE_LOST.has(p.kind)).map((p) => p.step));
  const penalized = new Set(race.penalties.filter((p) => !GATE_LOST.has(p.kind)).map((p) => p.step));
  return (
    <div className="gate-strip" aria-label="Gates">
      {race.sequence.map((gi, step) => {
        const state = missed.has(step)
          ? "missed"
          : penalized.has(step) && step < race.step
            ? "penalized"
            : step < race.step
            ? "done"
            : step === race.step && (race.status === "running" || race.status === "waiting")
              ? "next"
              : "todo";
        return <span key={step} className={`gate-cell ${state}`} title={`Gate ${gi + 1}`} />;
      })}
    </div>
  );
}

function Result({ race, target, course }: { race: RaceSnapshot; target: Run | null; course: Course }) {
  const newBest = race.status === "finished" && (!target || race.total < target.result.total);
  const why = race.status === "dnf" ? dnfText(race) : null;
  return (
    <div className="result">
      {race.status === "dnf" ? (
        <div className="result-title bad">Did not finish{why ? ` · ${why}` : ""}</div>
      ) : newBest ? (
        <div className="result-title best">New best</div>
      ) : (
        <div className="result-title">
          Finished <span className="bad num">{fmtDelta(race.total - target!.result.total)}</span>
        </div>
      )}
      <div className="result-rows num">
        <span className="muted">Flight time</span>
        <span>{fmtTime(race.raw)}</span>
        {race.penalties.map((p, i) => (
          <PenaltyRow key={i} penalty={p} course={course} />
        ))}
        {race.penalties.length === 0 && race.status === "finished" && (
          <>
            <span className="good">Clean run</span>
            <span className="good">+0.0 s</span>
          </>
        )}
        <span className="muted">Total</span>
        <span>{fmtTime(race.total)}</span>
      </div>
      {race.laps > 1 && (
        <div className="muted num laps">
          {race.lapTimes.map((t, i) => `Lap ${i + 1} ${fmtTime(t)}`).join("   ")}
        </div>
      )}
    </div>
  );
}

/** The penalties so far, newest first, while racing. */
function PenaltyList({ penalties, course }: { penalties: Penalty[]; course: Course }) {
  return (
    <div className="result-rows num live-penalties">
      {[...penalties].reverse().map((p, i) => (
        <PenaltyRow key={penalties.length - i} penalty={p} course={course} />
      ))}
    </div>
  );
}

function PenaltyRow({ penalty: p, course }: { penalty: Penalty; course: Course }) {
  return (
    <>
      <span className="bad">
        Gate {p.gateIndex + 1} · {penaltyReason(p, course)}
      </span>
      <span className="bad">+{p.seconds.toFixed(1)} s</span>
    </>
  );
}

function FlightValues({ live, course }: { live: LiveState | null; course: Course }) {
  const fix = live?.fix ?? null;
  const groundAt = live?.nextGate ? course.gates[live.nextGate.index]?.groundElevM ?? null : null;
  const agl = fix ? (fix.aglM ?? (groundAt !== null ? fix.altMslM - groundAt : null)) : null;
  return (
    <div className="flight-values">
      <Value label="Speed" value={fix ? Math.round(fix.gsMs * KMH_PER_MS) : null} unit="km/h" />
      <Value label="Height" value={agl !== null ? Math.round(agl) : null} unit="m AGL" />
      <Value label="Altitude" value={fix ? Math.round(fix.altMslM) : null} unit="m MSL" />
      <Value label="Bank" value={fix ? Math.round(fix.rollDeg) : null} unit="°" />
    </div>
  );
}

function Value({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="value">
      <div className="label">{label}</div>
      <div className="num value-n">
        {value ?? "—"}
        <span className="muted value-u"> {unit}</span>
      </div>
    </div>
  );
}

function Runs({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return <section className="panel runs muted">No runs on this course yet.</section>;
  return (
    <section className="panel runs">
      <div className="label">Your runs on this course</div>
      <table className="num">
        <thead>
          <tr>
            <th>#</th>
            <th>Total</th>
            <th>Penalties</th>
            <th>Aircraft</th>
            <th>Class</th>
            <th>Source</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, 20).map((r, i) => (
            <tr key={r.id} className={r.status === "dnf" ? "muted" : undefined}>
              <td>{r.status === "dnf" ? "DNF" : i + 1}</td>
              <td>
                {fmtTime(r.total)}
                {r.status === "dnf" && dnfShort(r.dnfReason) ? ` · ${dnfShort(r.dnfReason)}` : ""}
              </td>
              <td>{r.penaltyTotal > 0 ? `+${r.penaltyTotal.toFixed(1)}` : "—"}</td>
              <td>{r.aircraftId ?? "—"}</td>
              <td>{classLabel(r.classId)}</td>
              <td>
                {r.source} {r.sourceHz ? `${Math.round(r.sourceHz)} Hz` : ""}
              </td>
              <td>{new Date(r.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
