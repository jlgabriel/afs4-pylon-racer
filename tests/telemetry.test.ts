import { describe, expect, it } from "vitest";
import { ForeFlightAssembler, parseXatt, parseXgps } from "../src/core/telemetry/foreflight";
import { LineSplitter, parseReaderLine } from "../src/core/telemetry/reader";
import { RateMeter } from "../src/core/telemetry/rate";
import { isNullIsland } from "../src/core/race/fix";

// Captured from AFS4 on 2026-10-18 (c172 on the runway at EDDG).
const XGPS = "XGPSAerofly FS 4,7.6703,52.1316,47.4,69.9,0.1";
const XATT = "XATTAerofly FS 4,69.9,5.94,-0.23";
const READER =
  '{"schema":"aerofly-reader-telemetry","version":"1.1.0","update_hz":40,"timestamp":2083269509,"data_valid":1,"update_counter":7356,"latitude":0.909868,"longitude":0.133873,"altitude":47.44,"height":1.25,"pitch":0.103556,"bank":-0.003913,"true_heading":0.351285,"magnetic_heading":0.34124,"indicated_airspeed":0.08,"ground_speed":0,"vertical_speed":0,"on_ground":1,"position":{"x":3888336.54,"y":523674.64,"z":5011841.75},"velocity":{"x":0,"y":0,"z":0},"aircraft_name":"c172","nearest_airport_id":"EDDG"}';

describe("ForeFlight UDP", () => {
  it("parses XGPS in lon,lat order", () => {
    expect(parseXgps(XGPS)).toEqual({ lon: 7.6703, lat: 52.1316, altMslM: 47.4, trackDeg: 69.9, gsMs: 0.1 });
  });

  it("parses XATT", () => {
    expect(parseXatt(XATT)).toEqual({ headingDeg: 69.9, pitchDeg: 5.94, rollDeg: -0.23 });
  });

  it("rejects the other sentence, short and malformed lines", () => {
    expect(parseXgps(XATT)).toBeNull();
    expect(parseXatt(XGPS)).toBeNull();
    expect(parseXgps("XGPSAerofly FS 4,7.67")).toBeNull();
    expect(parseXgps("XGPSAerofly FS 4,a,b,c,d,e")).toBeNull();
  });

  it("merges the latest attitude into each position fix", () => {
    const a = new ForeFlightAssembler();
    expect(a.feed(XATT, 1)).toBeNull();
    const fix = a.feed(XGPS, 1.2)!;
    expect(fix).toMatchObject({ t: 1.2, lon: 7.6703, lat: 52.1316, rollDeg: -0.23, pitchDeg: 5.94, aglM: null });
  });
});

describe("AeroflyReader.dll", () => {
  it("converts radians to degrees and keeps meters as meters", () => {
    const s = parseReaderLine(READER, 3)!;
    expect(s.fix.lat).toBeCloseTo(52.1316, 3);
    expect(s.fix.lon).toBeCloseTo(7.6704, 3);
    // Same airport elevation the UDP feed reports (47.4 m): the DLL's altitude is in meters.
    expect(s.fix.altMslM).toBeCloseTo(47.44, 2);
    expect(s.fix.aglM).toBeCloseTo(1.25, 2);
    expect(s.fix.headingDeg).toBeCloseTo(20.13, 1);
    expect(s.fix.rollDeg).toBeCloseTo(-0.224, 2);
    expect(s.aircraft).toBe("c172");
    expect(s.sourceHz).toBe(40);
  });

  it("normalizes a longitude reported in [0, 2π)", () => {
    const west = READER.replace('"longitude":0.133873', `"longitude":${2 * Math.PI - 0.5}`);
    expect(parseReaderLine(west, 0)!.fix.lon).toBeCloseTo(-28.648, 2);
  });

  it("drops invalid samples and treats 'Unknown' as no aircraft", () => {
    expect(parseReaderLine(READER.replace('"data_valid":1', '"data_valid":0'), 0)).toBeNull();
    expect(parseReaderLine("{not json", 0)).toBeNull();
    expect(parseReaderLine(READER.replace('"c172"', '"Unknown"'), 0)!.aircraft).toBeNull();
  });

  it("splits a byte stream into lines across chunks", () => {
    const s = new LineSplitter();
    expect(s.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(s.push(':2}\n\n')).toEqual(['{"b":2}']);
  });
});

describe("helpers", () => {
  it("measures a rate over the window", () => {
    const m = new RateMeter(3);
    for (let i = 0; i <= 10; i++) m.tick(i * 0.2);
    expect(m.hz(2)).toBeCloseTo(5, 6);
    expect(m.hz(10)).toBe(0);
  });

  it("recognizes the menu's 0,0 position", () => {
    expect(isNullIsland({ lon: 0, lat: 0 })).toBe(true);
    expect(isNullIsland({ lon: 7.67, lat: 52.13 })).toBe(false);
  });
});
