// Courses seeded so there is something to fly (or to watch in demo mode) from the first launch.
// Two sit just north-east of EDDM (Munich); one is in the open Mojave desert at KDAG.
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
