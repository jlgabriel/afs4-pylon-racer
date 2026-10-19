// Courses seeded into a fresh install so there is something to fly (or to watch in demo mode) on
// the first launch. Both sit just north-east of EDDM (Munich): take off there and head for them.
import { COURSE_FORMAT, COURSE_VERSION, parseCourse, type Course } from "../course/course";

const STAMP = "2026-10-18T00:00:00Z";

export function sampleCourses(): Course[] {
  return [
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
