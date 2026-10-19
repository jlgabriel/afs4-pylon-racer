# Pylon Racer

Pylon racing for **Aerofly FS 4**. Pick a course, fly through its gates in order, and race the clock:
Pylon Racer follows your flight live, times every gate, applies the penalties and keeps your runs.

> **Early development.** The race engine, live telemetry, run history and the course designer work
> today. Rankings by aircraft class, sharing, sound and the final look are on the way.

## Design your own courses

- **Course designer on a satellite map**: click to place gates, drag a gate to move it, drag its arrow
  to turn it, drag a pylon to make it wider or narrower. Search for an airport or a place to start.
- **Gate kinds**: start, finish, gate, level gate, knife-edge gate and turn pylon (go around a single
  pylon on the side you are told). Start and finish follow the order of the gates.
- **Laps and penalties** per course.
- **Install pylons in Aerofly FS 4 with one click**, and remove them the same way. Pylon Racer only ever
  touches the scenery folders it created. Restart AFS4 after installing to see them.
- **Edit, duplicate and delete** courses. Changing the gates of a course starts a new leaderboard for it.

## Racing

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
- **Three sample courses**: *Daggett Sprint* at KDAG (take off on runway 26 and hold runway heading),
  *Munich Sprint* and *Munich Diamond* near EDDM.

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

1. Pick a course on the left and click **Install pylons**, then restart Aerofly FS 4.
2. Take off and fly to the course. The race arms itself: it starts when you fly through the start gate
   in the right direction.
3. Fly the gates in order. Your run is saved at the finish. **Race again** arms a new attempt.

If your Aerofly FS 4 user folder is not in the usual place (for example, Documents moved to OneDrive),
Pylon Racer won't find it on its own: it tells you so when you install pylons and lets you choose it.

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

Pylon Racer ships no Aerofly FS 4 content. The pylon models are krzysk1's Reno air-race pylons (MIT);
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
