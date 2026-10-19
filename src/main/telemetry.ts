// Telemetry from AFS4: the UDP broadcast (every OS) and AeroflyReader.dll over TCP (Windows), plus
// the synthetic demo flight. The hub forwards fixes from ONE source at a time — the best one that
// is alive — so the race never mixes two clocks:
//   demo (while running) > reader (fresh within 1 s) > udp (fresh within 2 s).
// Timestamps are this process's monotonic clock at receive time, in seconds.
import dgram from "node:dgram";
import net from "node:net";
import { performance } from "node:perf_hooks";
import type { Course } from "../core/course/course";
import { demoFlight } from "../core/demo/demoFlight";
import { isNullIsland, type Fix } from "../core/race/fix";
import type { SourceKind } from "../core/run/run";
import type { SourceInfo } from "../core/session/raceSession";
import { FOREFLIGHT_PORT, ForeFlightAssembler } from "../core/telemetry/foreflight";
import { LineSplitter, READER_PORT, parseReaderLine } from "../core/telemetry/reader";
import { RateMeter } from "../core/telemetry/rate";
import type { TelemetryStatus } from "../shared/racerApi";
import { log } from "./log";

const now = (): number => performance.now() / 1000;

const READER_FRESH_S = 1;
const UDP_FRESH_S = 2;
const READER_RETRY_MS = 2000;
const DEMO_RATE_HZ = 20;

export type FixListener = (fix: Fix, source: SourceInfo) => void;

export class TelemetryHub {
  private listener: FixListener | null = null;

  private udp: dgram.Socket | null = null;
  private readonly udpAssembler = new ForeFlightAssembler();
  private readonly udpRate = new RateMeter();
  private udpError: string | null = null;

  private reader: net.Socket | null = null;
  private readerConnected = false;
  private readerRetry: NodeJS.Timeout | null = null;
  private readonly readerRate = new RateMeter();
  private readerHz = 0;
  private readerError: string | null = null;
  private lastReaderT = 0;
  private aircraft: string | null = null;

  private demoTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  onFix(listener: FixListener): void {
    this.listener = listener;
  }

  start(): void {
    this.stopped = false;
    this.startUdp();
    this.connectReader();
  }

  stop(): void {
    this.stopped = true;
    this.stopDemo();
    this.udp?.close();
    this.udp = null;
    if (this.readerRetry) clearTimeout(this.readerRetry);
    this.reader?.destroy();
    this.reader = null;
  }

  status(): TelemetryStatus {
    const t = now();
    const age = (m: RateMeter): number | null => {
      const last = m.lastT();
      return last === null ? null : t - last;
    };
    return {
      active: this.activeSource(t),
      aircraft: this.aircraft,
      udp: { ageS: age(this.udpRate), hz: this.udpRate.hz(t), error: this.udpError },
      reader: {
        ageS: age(this.readerRate),
        hz: this.readerRate.hz(t),
        error: this.readerError,
        connected: this.readerConnected,
      },
      demo: { running: this.demoTimer !== null },
    };
  }

  // --- demo -----------------------------------------------------------------------------------------

  startDemo(course: Course, onDone: () => void): void {
    this.stopDemo();
    const fixes = demoFlight(course, { rateHz: DEMO_RATE_HZ });
    const t0 = now();
    let i = 0;
    this.demoTimer = setInterval(() => {
      const elapsed = now() - t0;
      while (i < fixes.length && fixes[i]!.t <= elapsed) {
        const f = fixes[i++]!;
        this.listener?.({ ...f, t: t0 + f.t }, { kind: "demo", hz: DEMO_RATE_HZ, aircraft: "extra330" });
      }
      if (i >= fixes.length) {
        this.stopDemo();
        onDone();
      }
    }, 1000 / DEMO_RATE_HZ);
  }

  stopDemo(): void {
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null;
  }

  // --- source selection -----------------------------------------------------------------------------

  private activeSource(t: number): SourceKind | null {
    if (this.demoTimer) return "demo";
    const r = this.readerRate.lastT();
    if (r !== null && t - r <= READER_FRESH_S) return "reader";
    const u = this.udpRate.lastT();
    if (u !== null && t - u <= UDP_FRESH_S) return "udp";
    return null;
  }

  private emit(kind: SourceKind, fix: Fix, hz: number): void {
    if (isNullIsland(fix)) return; // AFS4 is in its menus
    if (kind === "udp") this.udpRate.tick(fix.t);
    else this.readerRate.tick(fix.t);
    if (this.activeSource(fix.t) !== kind) return;
    this.listener?.(fix, { kind, hz, aircraft: this.aircraft });
  }

  // --- UDP ----------------------------------------------------------------------------------------

  private startUdp(): void {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    sock.on("message", (msg) => {
      const t = now();
      for (const line of msg.toString("ascii").split(/\r?\n/)) {
        const fix = this.udpAssembler.feed(line.trim(), t);
        if (fix) this.emit("udp", fix, this.udpRate.hz(t));
      }
    });
    sock.on("error", (e) => {
      this.udpError = e.message;
      log.warn(`UDP ${FOREFLIGHT_PORT} error`, e);
    });
    sock.bind(FOREFLIGHT_PORT, () => {
      this.udpError = null;
      log.info(`listening for AFS4 UDP on port ${FOREFLIGHT_PORT}`);
    });
    this.udp = sock;
  }

  // --- AeroflyReader.dll ----------------------------------------------------------------------------

  private connectReader(): void {
    if (this.stopped) return;
    const sock = net.connect(READER_PORT, "127.0.0.1");
    const splitter = new LineSplitter();
    sock.setEncoding("utf8");
    sock.on("connect", () => {
      this.readerConnected = true;
      this.readerError = null;
      log.info(`connected to AeroflyReader.dll on port ${READER_PORT}`);
    });
    sock.on("data", (chunk: string) => {
      const lines = splitter.push(chunk);
      const t = now();
      // TCP delivers several samples per chunk at 40 Hz. Spread them back over the sample period
      // so each gets its own instant (identical timestamps would be dropped as duplicates).
      const dt = 1 / Math.max(this.readerHz, 10);
      lines.forEach((line, i) => {
        const ti = Math.max(t - (lines.length - 1 - i) * dt, this.lastReaderT + 1e-4);
        const sample = parseReaderLine(line, ti);
        if (!sample) return;
        this.lastReaderT = ti;
        if (sample.sourceHz) this.readerHz = sample.sourceHz;
        if (sample.aircraft) this.aircraft = sample.aircraft;
        this.emit("reader", sample.fix, this.readerHz);
      });
    });
    sock.on("error", (e: NodeJS.ErrnoException) => {
      this.readerError = e.code ?? e.message;
    });
    sock.on("close", () => {
      if (this.readerConnected) log.info("AeroflyReader.dll connection closed");
      this.readerConnected = false;
      this.reader = null;
      if (!this.stopped) this.readerRetry = setTimeout(() => this.connectReader(), READER_RETRY_MS);
    });
    this.reader = sock;
  }
}
