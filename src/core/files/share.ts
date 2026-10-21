// The exchange files — how courses and runs travel between pilots without a server:
//   .pylonrace  ZIP with course.json
//   .pylonrun   ZIP with run.json, plus course.json when the run was flown on the course as it is now
// The scenery is never shipped: the receiving app builds it on install. Each JSON keeps its own
// format/version fields and is validated with zod on the way in, like a file from disk.
//
// Unpacking also accepts bare JSON (a native course or run, or the old pylon-race tool's
// course.json), so one "Import…" takes every file the app understands.
import { parseCourse, type Course } from "../course/course";
import { importRctCourse, isRctCourse } from "../course/importRct";
import { parseRun, RUN_FORMAT, type Run } from "../run/run";
import { isZip, readZip, writeZip, type ZipCodec, type ZipEntry } from "./zip";

export const COURSE_EXT = "pylonrace";
export const RUN_EXT = "pylonrun";
export const IMPORT_EXTS = [COURSE_EXT, RUN_EXT, "json"] as const;

const COURSE_ENTRY = "course.json";
const RUN_ENTRY = "run.json";

export class ShareFileError extends Error {}

export type Unpacked = { kind: "course"; course: Course } | { kind: "run"; run: Run; course: Course | null };

const enc = new TextEncoder();
const json = (value: unknown): Uint8Array => enc.encode(JSON.stringify(value, null, 1) + "\n");

export function packCourse(course: Course, codec: ZipCodec, modified?: Date): Uint8Array {
  return writeZip([{ name: COURSE_ENTRY, data: json(course) }], codec, modified);
}

/** `course` goes along only when given; pass it only if it is the revision the run was flown on. */
export function packRun(run: Run, course: Course | null, codec: ZipCodec, modified?: Date): Uint8Array {
  const entries: ZipEntry[] = [{ name: RUN_ENTRY, data: enc.encode(JSON.stringify(run) + "\n") }];
  if (course) entries.push({ name: COURSE_ENTRY, data: json(course) });
  return writeZip(entries, codec, modified);
}

/** Read any file the app can import. Throws ShareFileError, ZipError or a ZodError. */
export function unpack(bytes: Uint8Array, codec: ZipCodec, nowIso: string): Unpacked {
  if (isZip(bytes)) {
    const entries = new Map(readZip(bytes, codec).map((e) => [e.name, e.data]));
    const courseBytes = entries.get(COURSE_ENTRY);
    const runBytes = entries.get(RUN_ENTRY);
    const course = courseBytes ? parseCourse(parseJson(courseBytes)) : null;
    if (runBytes) return { kind: "run", run: parseRun(parseJson(runBytes)), course };
    if (course) return { kind: "course", course };
    throw new ShareFileError("This ZIP has no course or run in it");
  }

  const data = parseJson(bytes);
  if (isRctCourse(data)) return { kind: "course", course: importRctCourse(data, nowIso) };
  const format = typeof data === "object" && data !== null ? (data as { format?: unknown }).format : undefined;
  if (format === RUN_FORMAT) return { kind: "run", run: parseRun(data), course: null };
  return { kind: "course", course: parseCourse(data) };
}

/** A file name for sharing: "Daggett Sprint.pylonrace", "Daggett Sprint - Juan 25.93.pylonrun". */
export function courseFileName(course: Pick<Course, "name">): string {
  return `${fileSafe(course.name) || "course"}.${COURSE_EXT}`;
}

export function runFileName(run: Run): string {
  const time = run.result.status === "finished" ? run.result.total.toFixed(2) : "DNF";
  return `${fileSafe(run.courseName) || "run"} - ${fileSafe(run.pilot) || "pilot"} ${time}.${RUN_EXT}`;
}

/** Keep letters, digits, spaces and a few marks; drop what Windows, macOS or Linux refuse. */
function fileSafe(text: string): string {
  return text
    .replace(/[^\p{L}\p{N} ._()'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 60)
    .trim();
}

function parseJson(bytes: Uint8Array): unknown {
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
  try {
    return JSON.parse(text);
  } catch {
    throw new ShareFileError("This isn't a Pylon Racer file (not a ZIP or JSON)");
  }
}
