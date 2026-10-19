// The only privileged bridge: RacerApi as thin ipcRenderer calls, exposed as window.racer. Adding a
// method here means adding its handler in main/ipc.ts on the same channel.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { LiveUpdate, RacerApi, RunSummary } from "../shared/racerApi";

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const racer: RacerApi = {
  getAppInfo: () => ipcRenderer.invoke("racer:getAppInfo"),
  setPilot: (name) => ipcRenderer.invoke("racer:setPilot", name),
  listCourses: () => ipcRenderer.invoke("racer:listCourses"),
  getCourse: (id) => ipcRenderer.invoke("racer:getCourse", id),
  importCourse: () => ipcRenderer.invoke("racer:importCourse"),
  selectCourse: (id) => ipcRenderer.invoke("racer:selectCourse", id),
  resetRace: () => ipcRenderer.invoke("racer:resetRace"),
  startDemo: () => ipcRenderer.invoke("racer:startDemo"),
  stopDemo: () => ipcRenderer.invoke("racer:stopDemo"),
  listRuns: (courseId) => ipcRenderer.invoke("racer:listRuns", courseId),
  getRun: (id) => ipcRenderer.invoke("racer:getRun", id),
  onLive: (listener) => subscribe<LiveUpdate>("racer:live", listener),
  onRunSaved: (listener) => subscribe<RunSummary>("racer:runSaved", listener),
};

contextBridge.exposeInMainWorld("racer", racer);
