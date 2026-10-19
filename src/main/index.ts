// Electron main — window lifecycle, IPC registration and the hardening: sandboxed renderer, no
// navigation, no permissions, and a CSP on the packaged renderer. All I/O lives behind main/ipc.ts.
import { join } from "node:path";
import { app, BrowserWindow, session, shell } from "electron";
import { Installer, defaultAfs4UserDir } from "./installer";
import { registerIpc } from "./ipc";
import { LOG_FILE_NAME, log } from "./log";
import { mayNavigate } from "./navigation";
import { RaceController } from "./race";
import { Storage } from "./storage";
import { TelemetryHub } from "./telemetry";

declare const __APP_VERSION__: string;

// electron-vite sets this in dev (the Vite dev-server URL); undefined in a packaged build.
const RENDERER_URL = process.env["ELECTRON_RENDERER_URL"];

log.init(join(app.getPath("userData"), LOG_FILE_NAME));

// Log, then crash as Node would have: registering these handlers suppresses the default exit, and a
// main process limping on in an unknown state is worse than a crash.
const fatal = (what: string) => (e: unknown) => {
  log.error(`${what} — quitting`, e);
  console.error(`[main] ${what}:`, e);
  process.exit(1);
};
process.on("uncaughtException", fatal("uncaught exception in main"));
process.on("unhandledRejection", fatal("unhandled promise rejection in main"));

// Packaged renderer only: Vite's dev HMR needs inline scripts and a websocket. img-src allows https
// for the designer's map tiles; every other fetch goes through main.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

const storage = new Storage(app.getPath("userData"));
const hub = new TelemetryHub();
const race = new RaceController(storage, hub);
const afs4Dir = (): string => storage.readSettings().afs4Dir ?? defaultAfs4UserDir(app.getPath("documents"));
// Pylon models: extraResources in a packaged build; the repo's assets/ (two levels above out/main/)
// in dev and when the e2e launches the built main by path.
const pylonAssets = app.isPackaged
  ? join(process.resourcesPath, "assets", "pylons")
  : join(import.meta.dirname, "..", "..", "assets", "pylons");
const installer = new Installer(afs4Dir, pylonAssets, __APP_VERSION__);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#111114",
    title: `Pylon Racer ${__APP_VERSION__}`,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The page's <title> would otherwise replace the versioned window title on load.
  win.on("page-title-updated", (event) => event.preventDefault());
  win.once("ready-to-show", () => win.show());

  race.attach({
    live: (u) => {
      if (!win.isDestroyed()) win.webContents.send("racer:live", u);
    },
    runSaved: (r) => {
      if (!win.isDestroyed()) win.webContents.send("racer:runSaved", r);
    },
  });
  win.on("closed", () => race.detach());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const guard = (event: { preventDefault(): void }, url: string): void => {
    if (mayNavigate(url, RENDERER_URL)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  };
  win.webContents.on("will-navigate", guard);
  win.webContents.on("will-redirect", guard);
  win.webContents.on("did-fail-load", (_e, code, desc, url) => log.error(`renderer failed to load (${code} ${desc}): ${url}`));
  win.webContents.on("render-process-gone", (_e, d) => log.error(`renderer gone: ${d.reason} (exit ${d.exitCode})`));

  if (RENDERER_URL) void win.loadURL(RENDERER_URL);
  else void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  log.info(
    `Pylon Racer ${__APP_VERSION__} · Electron ${process.versions.electron} · ${process.platform} ${process.arch} · ` +
      `${app.isPackaged ? "packaged" : "dev"} · userData ${app.getPath("userData")}`,
  );
  log.info(`AFS4 user folder ${afs4Dir()} · pylon models ${pylonAssets}`);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  if (!RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
    });
  }

  storage.init();
  registerIpc({ storage, race, installer, afs4Dir, userData: app.getPath("userData") });
  hub.start();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  hub.stop();
  log.info("quitting");
});
