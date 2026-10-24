import { useEffect, useState } from "react";
import type { TelemetryStatus } from "../shared/racerApi";
import { fmtDistance, fmtTime } from "./app/format";
import { Designer } from "./design/Designer";
import { RaceView } from "./race/RaceView";
import { useStore } from "./state/store";

export function App() {
  const init = useStore((s) => s.init);
  const bridge = useStore((s) => s.bridge);
  const message = useStore((s) => s.message);
  const dismiss = useStore((s) => s.dismissMessage);
  const chooseAfs4Dir = useStore((s) => s.chooseAfs4Dir);
  const view = useStore((s) => s.view);
  const pinned = useStore((s) => s.app?.prefs.onTop ?? false);
  const dropping = useFileDrop();

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className={`app ${pinned ? "pinned" : ""} ${dropping ? "dropping" : ""}`}>
      <TopBar />
      {message && (
        <div className={`message message-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          <span>{message.text}</span>
          <span className="message-actions">
            {message.chooseAfs4 && <button onClick={() => void chooseAfs4Dir()}>Choose folder…</button>}
            <button onClick={dismiss}>Dismiss</button>
          </span>
        </div>
      )}
      {bridge ? (
        <div className="body">
          <CourseList />
          {view === "design" ? <Designer /> : <RaceView />}
        </div>
      ) : (
        <div className="body empty muted">
          This page needs the Pylon Racer app. In the browser preview, open it with ?mockracer.
        </div>
      )}
    </div>
  );
}

/** Files dragged onto the window import as if picked with Import…; true while a drag is over it. */
function useFileDrop(): boolean {
  const importDropped = useStore((s) => s.importDropped);
  const [over, setOver] = useState(false);
  useEffect(() => {
    // Every drag event must be cancelled, or the browser opens the dropped file in the window.
    let depth = 0;
    const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes("Files") ?? false;
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overHandler = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      void importDropped([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overHandler);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overHandler);
      window.removeEventListener("drop", drop);
    };
  }, [importDropped]);
  return over;
}

function TopBar() {
  const app = useStore((s) => s.app);
  const telemetry = useStore((s) => s.update?.telemetry ?? null);
  const setPilot = useStore((s) => s.setPilot);
  const setPrefs = useStore((s) => s.setPrefs);
  const onTop = app?.prefs.onTop ?? false;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <header className="topbar">
      <div className="brand">
        Pylon Racer <span className="muted num">{app?.version ?? __APP_VERSION__}</span>
      </div>
      <div className="topbar-right">
        <TelemetryPills t={telemetry} />
        {app && (
          <button
            className={`toggle ${onTop ? "on" : ""}`}
            aria-pressed={onTop}
            title="Keep this window above the simulator (run AFS4 windowed or borderless)"
            onClick={() => void setPrefs({ onTop: !onTop })}
          >
            {onTop ? "Pinned on top" : "Pin on top"}
          </button>
        )}
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void setPilot(draft);
              setEditing(false);
            }}
          >
            <input autoFocus value={draft} maxLength={32} onChange={(e) => setDraft(e.target.value)} onBlur={() => setEditing(false)} />
          </form>
        ) : (
          <button
            className="pilot"
            title="Change your pilot name"
            onClick={() => {
              setDraft(app?.pilot ?? "");
              setEditing(true);
            }}
          >
            {app?.pilot ?? "Pilot"}
          </button>
        )}
      </div>
    </header>
  );
}

function TelemetryPills({ t }: { t: TelemetryStatus | null }) {
  if (!t) return null;
  const readerOn = t.reader.connected && t.reader.ageS !== null && t.reader.ageS < 1;
  const udpOn = t.udp.ageS !== null && t.udp.ageS < 2;
  return (
    <div className="pills">
      {t.demo.running && (
        <span className="pill on">
          <span className="dot" /> Demo flight
        </span>
      )}
      <span
        className={`pill ${readerOn ? "on" : t.reader.connected ? "warn" : ""}`}
        title="AeroflyReader.dll: high-rate data with height above ground and the aircraft (Windows)"
      >
        <span className="dot" /> DLL {readerOn ? `${Math.round(t.reader.hz)} Hz` : t.reader.connected ? "connected, no flight" : "off"}
      </span>
      <span className={`pill ${udpOn ? "on" : ""}`} title={t.udp.error ?? "AFS4 UDP broadcast on port 49002"}>
        <span className="dot" /> UDP {udpOn ? `${Math.round(t.udp.hz)} Hz` : t.udp.error ? "error" : "off"}
      </span>
      {t.aircraft && <span className="pill">{t.aircraft}</span>}
    </div>
  );
}

function CourseList() {
  const courses = useStore((s) => s.courses);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const importFiles = useStore((s) => s.importFiles);
  const newCourse = useStore((s) => s.newCourse);

  return (
    <nav className="courses">
      <div className="courses-head">
        <span className="label">Courses</span>
        <span className="courses-tools">
          <button onClick={newCourse}>New</button>
          <button
            onClick={() => void importFiles()}
            title="Import courses (.pylonrace) from other pilots, or the old pylon-race course.json. You can also drop the files on the window."
          >
            Import…
          </button>
        </span>
      </div>
      <ul>
        {courses.map((c) => (
          <li key={c.id}>
            <button className={`course ${selected?.id === c.id ? "active" : ""}`} onClick={() => void select(c.id)}>
              <span className="course-name">{c.name}</span>
              <span className="muted course-meta num">
                {c.gates} gates · {fmtDistance(c.lapLengthM * c.laps)}
                {c.laps > 1 ? ` · ${c.laps} laps` : ""}
              </span>
              <span className="course-best num">
                {c.bestTotal !== null ? `Best ${fmtTime(c.bestTotal)}` : "No runs yet"}
                {c.install.state !== "none" && (
                  <span className={c.install.state === "current" ? "good" : "warn"}>
                    {c.install.state === "current" ? " · in AFS4" : " · reinstall"}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
