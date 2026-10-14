import { EventEmitter } from "node:events";
const fixture = (globalThis as any).__electronFixture;
export const app = fixture.app;
export const session = {
  fromPartition: (partition: string) => {
    if (!fixture.sessions.has(partition)) {
      const s: any = new EventEmitter();
      s.webRequest = {
        onBeforeRequest: (...args: any[]) => (s.request = args.at(-1)),
      };
      s.setPermissionRequestHandler = (fn: any) => (s.permission = fn);
      s.setPermissionCheckHandler = (fn: any) => (s.checkPermission = fn);
      s.clearCache = async () => (s.cacheCleared = true);
      s.clearStorageData = async () => (s.storageCleared = true);
      s.clearAuthCache = async () => {};
      fixture.sessions.set(partition, s);
    }
    return fixture.sessions.get(partition);
  },
};
export const webContents = {
  fromId: (id: number) => fixture.guests.get(id),
  getAllWebContents: () => [...fixture.guests.values()],
};
export const clipboard = { writeImage: () => {} };
export const nativeImage = {
  createFromBuffer: () => ({ isEmpty: () => false }),
};
