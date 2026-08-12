export interface NotificationPayload {
  title: string;
  body?: string;
}

export interface NotificationService {
  kind: "desktop" | "web" | "push";
  requestPermission: () => Promise<boolean>;
  notify: (payload: NotificationPayload) => Promise<boolean>;
}

export interface PushNotificationContract extends NotificationService {
  kind: "push";
  channel: string;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);
}

export const tauriNotificationService: NotificationService = {
  kind: "desktop",
  async requestPermission() {
    const plugin = await import("@tauri-apps/plugin-notification");
    const granted = await plugin.isPermissionGranted();
    if (granted) {
      return true;
    }
    const result = await plugin.requestPermission();
    return result === "granted";
  },
  async notify(payload) {
    const plugin = await import("@tauri-apps/plugin-notification");
    const granted = await plugin.isPermissionGranted();
    if (!granted) {
      return false;
    }
    await plugin.sendNotification({ title: payload.title, body: payload.body });
    return true;
  },
};

export const webNotificationService: NotificationService = {
  kind: "web",
  async requestPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    const permission = await Notification.requestPermission();
    return permission === "granted";
  },
  async notify(payload) {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    if (Notification.permission !== "granted") {
      return false;
    }
    new Notification(payload.title, { body: payload.body });
    return true;
  },
};

export const pushNotificationContract: PushNotificationContract = {
  kind: "push",
  channel: "taskcrate",
  async requestPermission() {
    return false;
  },
  async notify() {
    throw new Error("移动端 Push 通知尚未实现，契约已预留");
  },
};

export function getNotificationService(): NotificationService {
  return isTauriRuntime() ? tauriNotificationService : webNotificationService;
}

export async function initializeNotifications(): Promise<boolean> {
  const service = getNotificationService();
  return service.requestPermission();
}
