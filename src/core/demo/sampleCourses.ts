// Courses seeded so there is something to fly (or to watch in demo mode) from the first launch.
// Two sit just north-east of EDDM (Munich); three are in the open Mojave desert at KDAG: a sprint,
// a flight test of every rule and a flight test of Rodeo's pylons.
import { COURSE_FORMAT, COURSE_VERSION, parseCourse, type Course } from "../course/course";

const STAMP = "2026-10-18T00:00:00Z";

export function sampleCourses(): Course[] {
  return [
    parseCourse({
      format: COURSE_FORMAT,
      version: COURSE_VERSION,
      id: "daggett-sprint",
      name: "Daggett Sprint",
      author: "Pylon Racer",
      description:
        "Five gates in a straight line on the extended centerline of KDAG runway 26, 600 m apart. Take off on 26 and hold runway heading: the start is 2 km past the end of the runway.",
      createdAt: STAMP,
      updatedAt: STAMP,
      laps: 1,
      // On the extended centerline of runway 08/26 (true heading 90/270). Open desert, terrain ~588 m.
      gates: [
        { id: "g1", type: "start", center: { lon: -116.8197763, lat: 34.8514715 }, widthM: 100, headingDeg: 270, pylon: "green", groundElevM: 588 },
        { id: "g2", type: "gate", center: { lon: -116.8263516, lat: 34.8514701 }, widthM: 100, headingDeg: 270, pylon: "red", groundElevM: 588 },
        { id: "g3", type: "gate", center: { lon: -116.8329268, lat: 34.8514684 }, widthM: 100, headingDeg: 270, pylon: "blue", groundElevM: 588 },
        { id: "g4", type: "gate", center: { lon: -116.8395021, lat: 34.8514663 }, widthM: 100, headingDeg: 270, pylon: "red", groundElevM: 588 },
        { id: "g5", type: "finish", center: { lon: -116.8460774, lat: 34.8514639 }, widthM: 100, headingDeg: 270, pylon: "home", groundElevM: 588 },
      ],
    }),
    parseCourse({
      format: COURSE_FORMAT,
      version: COURSE_VERSION,
      id: "kdag-rules-test",
      name: "KDAG Rules Test",
      author: "Pylon Racer",
      description:
        "One gate of each kind, westbound, 1.5 km north of KDAG and parallel to Daggett Sprint: 2 wings level, 3 knife edge, 4 single turn pylon, pass to its right (north), 5 below 40 m.",
      createdAt: STAMP,
      updatedAt: "2026-10-19T00:00:00Z", // the turn pylon text changed
      laps: 1,
      // Lat 34.8665, 600 m apart, terrain from Open-Meteo (591–597 m).
      gates: [
        { id: "g1", type: "start", center: { lon: -116.8198, lat: 34.8665 }, widthM: 100, headingDeg: 270, pylon: null, groundElevM: 591 },
        { id: "g2", type: "level", center: { lon: -116.8263691, lat: 34.8665 }, widthM: 100, headingDeg: 270, pylon: null, groundElevM: 592 },
        { id: "g3", type: "knife", center: { lon: -116.8329382, lat: 34.8665 }, widthM: 100, headingDeg: 270, pylon: null, groundElevM: 594 },
        { id: "g4", type: "turn", center: { lon: -116.8395073, lat: 34.8665 }, widthM: 150, headingDeg: 270, pylon: null, groundElevM: 596, turnSide: "left" },
        { id: "g5", type: "gate", center: { lon: -116.8460765, lat: 34.8665 }, widthM: 100, headingDeg: 270, pylon: null, groundElevM: 596, topM: 40 },
        { id: "g6", type: "finish", center: { lon: -116.8526456, lat: 34.8665 }, widthM: 100, headingDeg: 270, pylon: null, groundElevM: 597 },
      ],
    }),
    parseCourse({
      format: COURSE_FORMAT,
      version: COURSE_VERSION,
      id: "kdag-rodeo-test",
      name: "KDAG Rodeo Test",
      author: "Pylon Racer",
      description:
        "Rodeo's three pylons, westbound, 1.5 km north of KDAG Rules Test: 1 Reno 15 m, 2 Air Race 18 m, 3 Air Race 25 m, 4 single turn pylon 18 m, pass to its right (north), 5 Reno 15 m. Pylons have collision in AFS4.",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
      laps: 1,
      // Lat 34.8815, same longitudes as KDAG Rules Test (600 m apart), terrain from Open-Meteo (584–590 m).
      gates: [
        { id: "g1", type: "start", center: { lon: -116.8198, lat: 34.8815 }, widthM: 100, headingDeg: 270, pylon: "rodeo-reno", groundElevM: 590 },
        { id: "g2", type: "gate", center: { lon: -116.8263691, lat: 34.8815 }, widthM: 100, headingDeg: 270, pylon: "rodeo-18", groundElevM: 584 },
        { id: "g3", type: "gate", center: { lon: -116.8329382, lat: 34.8815 }, widthM: 100, headingDeg: 270, pylon: "rodeo-25", groundElevM: 587 },
        { id: "g4", type: "turn", center: { lon: -116.8395073, lat: 34.8815 }, widthM: 150, headingDeg: 270, pylon: "rodeo-18", groundElevM: 589, turnSide: "left" },
        { id: "g5", type: "finish", center: { lon: -116.8460765, lat: 34.8815 }, widthM: 100, headingDeg: 270, pylon: "rodeo-reno", groundElevM: 590 },
      ],
    }),
    parseCourse({
      format: COURSE_FORMAT,
      version: COURSE_VERSION,
      id: "munich-sprint",
      name: "Munich Sprint",
      author: "Pylon Racer",
      description: "Five gates in a straight line heading east, 600 m apart. Start at 48.376 N, 11.850 E.",
      createdAt: STAMP,
      updatedAt: STAMP,
      laps: 1,
      gates: [
        { id: "g1", type: "start", center: { lon: 11.85, lat: 48.376 }, widthM: 80, headingDeg: 90, pylon: "green" },
        { id: "g2", type: "gate", center: { lon: 11.8581, lat: 48.376 }, widthM: 80, headingDeg: 90, pylon: "red" },
        { id: "g3", type: "gate", center: { lon: 11.8662, lat: 48.376 }, widthM: 80, headingDeg: 90, pylon: "blue" },
        { id: "g4", type: "gate", center: { lon: 11.8743, lat: 48.376 }, widthM: 80, headingDeg: 90, pylon: "red" },
        { id: "g5", type: "finish", center: { lon: 11.8824, lat: 48.376 }, widthM: 80, headingDeg: 90, pylon: "home" },
      ],
    }),
    parseCourse({
      format: COURSE_FORMAT,
      version: COURSE_VERSION,
      id: "munich-diamond",
      name: "Munich Diamond",
      author: "Pylon Racer",
      description: "Two laps around a diamond of 1.4 km legs, clockwise. The start line closes each lap.",
      createdAt: STAMP,
      updatedAt: STAMP,
      laps: 2,
      // Each corner gate faces the bisector of the leg in and the leg out, so the line is crossed
      // squarely while turning.
      gates: [
        { id: "g1", type: "start", center: { lon: 11.85, lat: 48.39 }, widthM: 100, headingDeg: 0, pylon: "green" },
        { id: "g2", type: "gate", center: { lon: 11.8635, lat: 48.399 }, widthM: 100, headingDeg: 90, pylon: "red" },
        { id: "g3", type: "gate", center: { lon: 11.877, lat: 48.39 }, widthM: 100, headingDeg: 180, pylon: "blue" },
        { id: "g4", type: "gate", center: { lon: 11.8635, lat: 48.381 }, widthM: 100, headingDeg: 270, pylon: "red" },
      ],
    }),
  ];
}
