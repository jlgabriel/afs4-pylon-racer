import { useEffect, useState } from "react";
import type { TelemetryStatus } from "../shared/racerApi";
import { fmtDistance, fmtTime } from "./app/format";
import { RaceView } from "./race/RaceView";
import { useStore } from "./state/store";

export function App() {
  const init = useStore((s) => s.init);
  const bridge = useStore((s) => s.bridge);
  const message = useStore((s) => s.message);
  const dismiss = useStore((s) => s.dismissMessage);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app">
      <TopBar />
      {message && (
        <div className="message" role="alert">
          {message}
          <button onClick={dismiss}>Dismiss</button>
        </div>
      )}
      {bridge ? (
        <div className="body">
          <CourseList />
          <RaceView />
        </div>
      ) : (
        <div className="body empty muted">
          This page needs the Pylon Racer app. In the browser preview, open it with ?mockracer.
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const app = useStore((s) => s.app);
  const telemetry = useStore((s) => s.update?.telemetry ?? null);
  const setPilot = useStore((s) => s.setPilot);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <header className="topbar">
      <div className="brand">
        Pylon Racer <span className="muted num">{app?.version ?? __APP_VERSION__}</span>
      </div>
      <div className="topbar-right">
        <TelemetryPills t={telemetry} />
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
  const importCourse = useStore((s) => s.importCourse);

  return (
    <nav className="courses">
      <div className="courses-head">
        <span className="label">Courses</span>
        <button onClick={() => void importCourse()} title="Import a course file, including the old pylon-race course.json">
          Import…
        </button>
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
              <span className="course-best num">{c.bestTotal !== null ? `Best ${fmtTime(c.bestTotal)}` : "No runs yet"}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
