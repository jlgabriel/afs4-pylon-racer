import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleCourses } from "../src/core/demo/sampleCourses";
import { DEFAULT_PYLON, PYLONS, pylonFor } from "../src/core/export/pylons";
import { bankersRound, encodeLonLat, isOurPoiFolderName, planPoi, poiSlug } from "../src/core/export/poi";
import { haversine } from "../src/core/geo/geo";
import { makeCourse } from "./helpers";

const sprint = sampleCourses().find((c) => c.id === "munich-sprint")!;

describe("POI folder name", () => {
  it("encodes the coordinates the way AFS4 names POIs", () => {
    expect(encodeLonLat({ lon: 11.85, lat: 48.376 })).toBe("e01185n4838");
    expect(encodeLonLat({ lon: 174.73, lat: -36.85 })).toBe("e17473s3685");
    expect(encodeLonLat({ lon: -116.83, lat: 34.85 })).toBe("w11683n3485");
  });

  it("rounds halves to even, like the earlier tool", () => {
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(2.4)).toBe(2);
  });

  it("names a course's folder from its centroid and a pr_ slug", () => {
    expect(planPoi(sprint).folderName).toBe("e01187n4838_pr_munich_sprint");
    expect(poiSlug("Hello World--2")).toBe("pr_hello_world_2");
  });

  it("recognizes only folder names the app could have made", () => {
    expect(isOurPoiFolderName("e01187n4838_pr_munich_sprint")).toBe(true);
    expect(isOurPoiFolderName("e01187n4838_munich_sprint")).toBe(false); // the old tool's
    expect(isOurPoiFolderName("e01905n4750_budapestensemble_ro260507")).toBe(false);
    expect(isOurPoiFolderName("e01187n4838_pr_../x")).toBe(false);
  });
});

describe("the .tsl", () => {
  it("matches what the earlier exporter produced for the same gates (golden)", () => {
    const golden = readFileSync(new URL("fixtures/rct_munich_sprint.tsl", import.meta.url), "utf8");
    const mine = planPoi(sprint).tsl;
    // Same objects, models and positions to 7 decimals; only the place name differs.
    const body = (s: string): string => s.replace(/<\[string8\]\[name\]\[[^\]]*\]>/, "");
    expect(body(mine)).toBe(body(golden.replace(/\r\n/g, "\n")));
  });

  it("places two pylons per gate and one per turn pylon, each model bundled once", () => {
    const c = makeCourse([
      { type: "start", x: 0, y: -500, heading: 0 },
      { type: "turn", x: 0, y: 0, heading: 0, turnSide: "left" },
      { type: "gate", x: 0, y: 200, heading: 0 },
      { type: "finish", x: 0, y: 500, heading: 0 },
    ]);
    const plan = planPoi(c);
    expect(plan.pylonCount).toBe(7);
    expect(plan.modelDirs).toEqual(["pylon_1", "pylon_2", "pylon_green", "pylon_red"]);
    expect(plan.tsl.match(/tmsimulator_scenery_object\]\[element/g)).toHaveLength(7);
  });

  it("puts each pylon half the gate width from the center", () => {
    const plan = planPoi(sprint);
    const positions = [...plan.tsl.matchAll(/position\]\[(-?[\d.]+) (-?[\d.]+) 0\]/g)].map((m) => ({
      lon: Number(m[1]),
      lat: Number(m[2]),
    }));
    expect(positions).toHaveLength(10);
    expect(haversine(positions[0]!, positions[1]!)).toBeCloseTo(80, 0);
  });

  it("keeps the bracket grammar intact whatever the course is called", () => {
    const plan = planPoi({ ...sprint, name: "My [best] <course>\n" });
    expect(plan.tsl).toContain("<[string8][name][My  best   course]>");
  });
});

describe("pylon models", () => {
  it("every gate type has a default that exists", () => {
    for (const id of Object.values(DEFAULT_PYLON)) expect(PYLONS.some((p) => p.id === id)).toBe(true);
  });

  it("an unknown id falls back to the type's default", () => {
    expect(pylonFor({ type: "start", pylon: "nope" }).id).toBe("green");
    expect(pylonFor({ type: "gate", pylon: "blue" }).id).toBe("blue");
  });

  it("every model folder ships its .tmb and a texture", () => {
    for (const p of PYLONS) {
      expect(() => readFileSync(new URL(`../assets/pylons/${p.dir}/${p.tmb}.tmb`, import.meta.url))).not.toThrow();
      expect(readdirSync(new URL(`../assets/pylons/${p.dir}/`, import.meta.url)).some((f) => f.endsWith(".ttx"))).toBe(true);
    }
  });

  it("ids and folders are unique", () => {
    expect(new Set(PYLONS.map((p) => p.id)).size).toBe(PYLONS.length);
    expect(new Set(PYLONS.map((p) => p.dir)).size).toBe(PYLONS.length);
  });

  it("Rodeo's models carry their credits and their real height", () => {
    const rodeo = PYLONS.filter((p) => p.id.startsWith("rodeo-"));
    expect(rodeo.map((p) => [p.id, p.heightM])).toEqual([
      ["rodeo-reno", 15.18],
      ["rodeo-18", 18],
      ["rodeo-25", 25],
    ]);
    for (const p of rodeo) {
      const credits = readFileSync(new URL(`../assets/pylons/${p.dir}/__CREDITS.txt`, import.meta.url), "utf8");
      expect(credits).toContain("Rodeo");
      expect(credits).toContain("#257");
      // Text .tmb: the geometry's internal name matches the file, and its texture is in the folder.
      const tmb = readFileSync(new URL(`../assets/pylons/${p.dir}/${p.tmb}.tmb`, import.meta.url), "latin1");
      expect(tmb).toContain(`<[string8u][name][${p.tmb}]>`);
      const texture = /<\[string8\]\[name\]\[([^\]]+)\]>/.exec(tmb)?.[1];
      expect(readdirSync(new URL(`../assets/pylons/${p.dir}/`, import.meta.url))).toContain(`${texture}.ttx`);
    }
  });

  it("a gate can place one of Rodeo's models", () => {
    const course = makeCourse([
      { type: "start", x: 0, y: -500, heading: 0, pylon: "rodeo-reno" },
      { type: "turn", x: 0, y: 0, heading: 0, turnSide: "left", pylon: "rodeo-18" },
      { type: "finish", x: 0, y: 500, heading: 0, pylon: "rodeo-25" },
    ]);
    const plan = planPoi(course);
    expect(plan.modelDirs).toEqual(["rodeo_air_race_18_4", "rodeo_air_race_25_5", "rodeo_reno_3"]);
    expect(plan.tsl).toContain("<[string8][geometry][rodeo_air_race_18_4/pylon_air_race_18_4]>");
    expect(plan.pylonCount).toBe(5);
  });

  it("the KDAG Rodeo Test sample installs only Rodeo's three models", () => {
    const plan = planPoi(sampleCourses().find((c) => c.id === "kdag-rodeo-test")!);
    expect(plan.modelDirs).toEqual(["rodeo_air_race_18_4", "rodeo_air_race_25_5", "rodeo_reno_3"]);
    expect(plan.pylonCount).toBe(9); // four gates and one turn pylon
  });
});
