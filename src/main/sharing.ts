// Exchange files on the main side: the zlib codec, packing a stored course or run, and importing
// whatever the user hands us (dialog, drop, or a double-clicked file) into storage.
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { ZodError } from "zod";
import { courseRevision, type Course } from "../core/course/course";
import { packCourse, packRun, unpack } from "../core/files/share";
import type { ZipCodec } from "../core/files/zip";
import type { Run } from "../core/run/run";
import type { ImportReport } from "../shared/racerApi";
import { log } from "./log";
import type { Storage } from "./storage";

export const zlibCodec: ZipCodec = {
  deflateRaw: (data) => deflateRawSync(data, { level: 9 }),
  inflateRaw: (data, maxBytes) => inflateRawSync(data, { maxOutputLength: Math.max(1, maxBytes) }),
};

/** A file bigger than this is not one of ours (a 10-minute run at 40 Hz packs to well under 1 MB). */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

export function courseFile(course: Course): Uint8Array {
  return packCourse(course, zlibCodec, new Date());
}

/** The run's file, with its course when the stored course is still on the run's revision. */
export function runFile(storage: Storage, run: Run): { data: Uint8Array; withCourse: boolean } {
  const course = storage.findCourseByRevision(run.courseRevision, run.courseId);
  return { data: packRun(run, course, zlibCodec, new Date()), withCourse: course !== null };
}

interface Outcome {
  courseId: string | null;
  line: string;
}

/** Import files one by one; a bad file is reported in its line and never stops the others. */
export function importFiles(storage: Storage, files: readonly { name: string; data: Uint8Array }[]): ImportReport {
  const report: ImportReport = { courseId: null, lines: [], failed: 0 };
  for (const f of files) {
    try {
      if (f.data.length > MAX_IMPORT_BYTES) throw new Error("The file is too big to be a course or a run");
      const o = importOne(storage, f.data);
      if (o.courseId) report.courseId = o.courseId;
      report.lines.push(o.line);
      log.info(`imported ${f.name}: ${o.line}`);
    } catch (e) {
      report.failed++;
      report.lines.push(`${f.name}: ${importErrorText(e)}`);
      log.warn(`import failed: ${f.name}`, e);
    }
  }
  return report;
}

function importOne(storage: Storage, data: Uint8Array): Outcome {
  const file = unpack(data, zlibCodec, new Date().toISOString());

  if (file.kind === "course") {
    const known = new Set(storage.listCourses().map((c) => c.id));
    const stored = storage.addCourse(file.course);
    return {
      courseId: stored.id,
      line: known.has(stored.id)
        ? `${stored.name}: already in your library.`
        : `${stored.name}: course added${stored.id !== file.course.id ? " (a different course with that name is kept too)" : ""}.`,
    };
  }

  // A run joins the course it was flown on, matched by revision (the course id is only local).
  const { run } = file;
  const who = `${run.courseName}, ${run.pilot}'s run`;
  let course = storage.findCourseByRevision(run.courseRevision, run.courseId);
  let courseNote = "";
  if (!course && file.course && courseRevision(file.course) === run.courseRevision) {
    course = storage.addCourse(file.course);
    courseNote = " Its course was added too.";
  }
  const added = storage.addImportedRun(course ? { ...run, courseId: course.id } : run);
  if (!added) return { courseId: course?.id ?? null, line: `${who}: already here.` };
  if (!course) {
    return {
      courseId: null,
      line: `${who}: added, but you don't have that version of its course. It will show up once you import the course.`,
    };
  }
  return { courseId: course.id, line: `${who}: added.${courseNote}` };
}

function importErrorText(e: unknown): string {
  if (e instanceof ZodError) return "not a valid Pylon Racer course or run (it may come from a newer version of the app).";
  return e instanceof Error ? e.message : String(e);
}
