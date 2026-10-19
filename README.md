# Pylon Racer

Pylon racing for **Aerofly FS 4**. Pick a course, fly through its gates in order, and race the clock:
Pylon Racer follows your flight live, times every gate, applies the penalties and keeps your runs.

> **Early development (v0.1).** The race engine, live telemetry and run history work today. The course
> designer, scenery install, rankings by aircraft class, sharing, sound and the final look are on the
> way.

## What works in v0.1

- **Live race screen**: race time, delta to your best at each gate, the gate sequence, the next gate and
  its distance, a course map with your trail, and speed, height, altitude and bank.
- **Gate detection that does not depend on the update rate**: a pass is found by crossing the gate line
  between two samples, and its instant is interpolated, so times stay accurate even with the ~5 Hz UDP
  feed.
- **Multi-lap courses**: the start line closes each lap; lap times are shown at the finish.
- **Penalties** for missed gates and wrong-direction passes.
- **Your runs are saved** and listed per course, best first.
- **Demo flight**: watch any course being flown without the simulator.
- **Import** courses made with the earlier pylon-race web editor (`course.json`).

## Connecting to Aerofly FS 4

Pylon Racer reads your flight from one of two sources and uses the best one available:

| Source | Systems | Rate | Extras |
|--------|---------|------|--------|
| **UDP broadcast** (built into AFS4) | Windows, macOS, Linux | ~5 Hz | — |
| **AeroflyReader.dll** ([Aerofly-FS4-Bridge](https://github.com/jlgabriel/Aerofly-FS4-Bridge), `simplified/`) | Windows | ~40 Hz | height above ground, aircraft |

**UDP:** in AFS4's settings, turn on the flight-info broadcast to the network, port **49002**.

**AeroflyReader.dll (optional, Windows):** copy `AeroflyReader.dll` into
`Documents\Aerofly FS 4\external_dll\` and restart AFS4.

The top bar shows which source is live and at what rate.

## Flying a race

1. Pick a course on the left. The two sample courses are just north-east of **EDDM** (Munich).
2. Take off and fly to the course. The race arms itself: it starts when you fly through the start gate
   in the right direction.
3. Fly the gates in order. Your run is saved at the finish. **Race again** arms a new attempt.

The pylons themselves are not placed in the simulator yet in v0.1 (that arrives with the course
designer): the map shows where every gate is.

## Building from source

Requires Node 24.

```bash
npm install
npm run dev            # run the app
npm run typecheck      # both tsconfigs
npm test               # unit tests
npm run test:e2e       # builds, then drives the Electron app
npm run build:win      # or build:mac / build:linux
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Pylon Racer ships no Aerofly FS 4 content.
