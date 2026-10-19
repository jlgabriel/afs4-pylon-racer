// The BUILT app against a throwaway AFS4 user folder: install a course's pylons, check the folder
// AFS4 would load, save an edit through the real IPC, and remove the pylons again. No network: the
// edited course already has its terrain elevations, so saving does not look them up.
import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");

test("installs, edits and removes a course's pylons", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "racer-e2e-"));
  const afs4 = mkdtempSync(path.join(tmpdir(), "racer-afs4-"));
  mkdirSync(path.join(afs4, "scenery", "poi", "e01905n4750_someone_elses_poi"), { recursive: true });
  writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ afs4Dir: afs4, lastCourseId: "daggett-sprint" }));
  const poi = path.join(afs4, "scenery", "poi");

  const app = await electron.launch({ args: [MAIN, `--user-data-dir=${userData}`], cwd: ROOT });
  try {
    const win = await app.firstWindow();
    win.on("dialog", (d) => void d.accept());
    await expect(win.getByRole("heading", { name: "Daggett Sprint" })).toBeVisible();
    await expect(win.getByText("Pylons not in AFS4")).toBeVisible();

    await win.getByRole("button", { name: "Install pylons" }).click();
    await expect(win.getByText("Pylons installed. Restart Aerofly FS 4 to see them.")).toBeVisible();
    const folder = path.join(poi, "w11683n3485_pr_daggett_sprint");
    expect(readdirSync(folder).sort()).toEqual(
      ["PYLON_MODEL_LICENSE.txt", "pr_daggett_sprint.tsl", "pylon-racer.json", "pylon_1", "pylon_blue", "pylon_green", "pylon_red"].sort(),
    );
    expect(readFileSync(path.join(folder, "pr_daggett_sprint.tsl"), "utf8").match(/scenery_object\]\[element/g)).toHaveLength(10);

    // Edit the description and save: the gates are unchanged, so the install stays current.
    await win.getByRole("button", { name: "Edit" }).click();
    await win.getByRole("textbox").last().fill("Edited in the e2e.");
    await win.getByRole("button", { name: "Save" }).click();
    await expect(win.getByText("Course saved.")).toBeVisible();
    await expect(win.getByText("Pylons in AFS4", { exact: true })).toBeVisible();
    const stored = JSON.parse(readFileSync(path.join(userData, "courses", "daggett-sprint.json"), "utf8"));
    expect(stored.description).toBe("Edited in the e2e.");

    await win.getByRole("button", { name: "Remove" }).click();
    await expect(win.getByText("Pylons removed from Aerofly FS 4.")).toBeVisible();
    expect(existsSync(folder)).toBe(false);
    expect(readdirSync(poi)).toEqual(["e01905n4750_someone_elses_poi"]);
  } finally {
    await app.close();
  }
});
