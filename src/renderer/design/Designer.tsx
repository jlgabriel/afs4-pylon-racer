// The course designer: the map on the left, the course and its gates on the right. Edits go to the
// store's draft through the pure functions in core/course/edit; nothing is written until Save.
import { useEffect } from "react";
import type { Gate, GateType } from "../../core/course/course";
import {
  MIDDLE_KINDS,
  addGate,
  draftProblem,
  moveGate,
  moveGateInOrder,
  removeGate,
  setKind,
  setLaps,
  updateGate,
  type Draft,
} from "../../core/course/edit";
import { DEFAULT_PYLON, PYLONS } from "../../core/export/pylons";
import { lapLength } from "../../core/run/summaries";
import { fmtDistance } from "../app/format";
import { useStore } from "../state/store";
import { DesignMap } from "./DesignMap";

const KIND_LABEL: Record<GateType, string> = {
  start: "Start",
  finish: "Finish",
  gate: "Gate",
  level: "Level gate",
  knife: "Knife-edge gate",
  turn: "Turn pylon",
};

export function Designer() {
  const draft = useStore((s) => s.draft);
  const dirty = useStore((s) => s.draftDirty);
  const saving = useStore((s) => s.saving);
  const selectedGateId = useStore((s) => s.selectedGateId);
  const runs = useStore((s) => s.runs);
  const editDraft = useStore((s) => s.editDraft);
  const selectGate = useStore((s) => s.selectGate);
  const focusGate = useStore((s) => s.focusGate);
  const focusRequest = useStore((s) => s.focusRequest);
  const save = useStore((s) => s.saveDraft);
  const close = useStore((s) => s.closeDesigner);

  // Delete removes the selected gate, unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      const id = useStore.getState().selectedGateId;
      if ((e.key === "Delete" || e.key === "Backspace") && id) {
        useStore.getState().editDraft((d) => removeGate(d, id));
        useStore.getState().selectGate(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!draft) return null;
  const problem = draftProblem(draft);
  const isNew = draft.id === "";

  return (
    <main className="designer">
      <header className="designer-head">
        <input
          className="designer-name"
          value={draft.name}
          maxLength={80}
          onChange={(e) => editDraft((d) => ({ ...d, name: e.target.value }))}
          aria-label="Course name"
        />
        <div className="designer-actions">
          <span className={`designer-status ${problem ? "bad" : "muted"}`}>
            {problem ?? (dirty ? "Unsaved changes" : "Saved")}
          </span>
          <button onClick={close}>{dirty ? "Cancel" : "Close"}</button>
          <button className="primary" disabled={!!problem || saving || (!dirty && !isNew)} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="designer-body">
        <DesignMap
          draft={draft}
          selectedGateId={selectedGateId}
          focusRequest={focusRequest}
          onAdd={(at) => {
            editDraft((d) => addGate(d, at));
            const gates = useStore.getState().draft?.gates;
            selectGate(gates?.[gates.length - 1]?.id ?? null);
          }}
          onSelect={selectGate}
          onMove={(id, to) => editDraft((d) => moveGate(d, id, to))}
          onHeading={(id, headingDeg) => editDraft((d) => updateGate(d, id, { headingDeg }))}
          onWidth={(id, widthM) => editDraft((d) => updateGate(d, id, { widthM }))}
        />

        <aside className="designer-side">
          <section className="panel">
            <div className="label">Course</div>
            <label className="field">
              <span>Laps</span>
              <input
                type="number"
                min={1}
                max={50}
                value={draft.laps}
                onChange={(e) => editDraft((d) => setLaps(d, Number(e.target.value) || 1))}
              />
            </label>
            <label className="field">
              <span>Missed gate</span>
              <span className="field-inline">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.rules.missedGatePenaltyS}
                  disabled={draft.rules.missedGateIsDnf}
                  onChange={(e) =>
                    editDraft((d) => ({ ...d, rules: { ...d.rules, missedGatePenaltyS: Math.max(0, Number(e.target.value) || 0) } }))
                  }
                />
                <span className="muted">s</span>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={draft.rules.missedGateIsDnf}
                    onChange={(e) => editDraft((d) => ({ ...d, rules: { ...d.rules, missedGateIsDnf: e.target.checked } }))}
                  />
                  ends the run
                </label>
              </span>
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                rows={2}
                maxLength={500}
                value={draft.description}
                onChange={(e) => editDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
            {draft.gates.length >= 2 && (
              <div className="muted num designer-length">
                {draft.gates.length} gates · {fmtDistance(lapLength(draft) * draft.laps)}
                {draft.laps > 1 ? ` (${draft.laps} laps)` : ""}
              </div>
            )}
            {!isNew && runs.length > 0 && (
              <div className="muted designer-note">Changing gates or rules starts a new leaderboard for this course.</div>
            )}
          </section>

          <section className="panel designer-gates">
            <div className="label">Gates · click the map to add</div>
            {draft.gates.length === 0 && <div className="muted">No gates yet.</div>}
            <ol>
              {draft.gates.map((g, i) => (
                <GateRow
                  key={g.id}
                  gate={g}
                  index={i}
                  count={draft.gates.length}
                  selected={g.id === selectedGateId}
                  onSelect={() => focusGate(g.id)}
                  edit={(fn) => editDraft(fn)}
                />
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}

interface RowProps {
  gate: Gate;
  index: number;
  count: number;
  selected: boolean;
  onSelect(): void;
  edit(fn: (d: Draft) => Draft): void;
}

function GateRow({ gate: g, index, count, selected, onSelect, edit }: RowProps) {
  const positional = g.type === "start" || g.type === "finish";
  return (
    <li className={`gate-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="gate-row-head">
        <span className={`gate-dot type-${g.type}`} />
        <span className="gate-row-title">
          {index + 1} · {KIND_LABEL[g.type]}
        </span>
        <span className="gate-row-tools">
          <button disabled={index === 0} onClick={() => edit((d) => moveGateInOrder(d, g.id, -1))} aria-label="Move earlier">
            ▲
          </button>
          <button disabled={index === count - 1} onClick={() => edit((d) => moveGateInOrder(d, g.id, 1))} aria-label="Move later">
            ▼
          </button>
          <button onClick={() => edit((d) => removeGate(d, g.id))} aria-label="Delete gate">
            ✕
          </button>
        </span>
      </div>
      {selected && (
        <div className="gate-row-body" onClick={(e) => e.stopPropagation()}>
          {!positional && (
            <label className="field">
              <span>Kind</span>
              <select value={g.type} onChange={(e) => edit((d) => setKind(d, g.id, e.target.value as GateType))}>
                {MIDDLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {g.type === "turn" ? (
            <label className="field">
              <span>Keep pylon on</span>
              <select value={g.turnSide ?? "left"} onChange={(e) => edit((d) => updateGate(d, g.id, { turnSide: e.target.value as "left" | "right" }))}>
                <option value="left">your left</option>
                <option value="right">your right</option>
              </select>
            </label>
          ) : (
            <label className="field">
              <span>Width</span>
              <span className="field-inline">
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={g.widthM}
                  onChange={(e) => edit((d) => updateGate(d, g.id, { widthM: Math.max(10, Number(e.target.value) || 10) }))}
                />
                <span className="muted">m</span>
              </span>
            </label>
          )}
          <label className="field">
            <span>Heading</span>
            <span className="field-inline">
              <input
                type="number"
                min={0}
                max={359}
                value={g.headingDeg}
                onChange={(e) => edit((d) => updateGate(d, g.id, { headingDeg: ((Math.round(Number(e.target.value) || 0) % 360) + 360) % 360 }))}
              />
              <span className="muted">°</span>
            </span>
          </label>
          <label className="field">
            <span>Pylon</span>
            <select value={g.pylon ?? ""} onChange={(e) => edit((d) => updateGate(d, g.id, { pylon: e.target.value || null }))}>
              <option value="">Default ({PYLONS.find((p) => p.id === DEFAULT_PYLON[g.type])?.label})</option>
              {PYLONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="muted num gate-row-elev">
            {g.groundElevM !== null ? `Terrain ${Math.round(g.groundElevM)} m` : "Terrain looked up on save"}
          </div>
        </div>
      )}
    </li>
  );
}
