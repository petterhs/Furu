import { invoke } from "@tauri-apps/api/core";
import { writable } from "svelte/store";

export type NotificationPermissionStatus = {
  postNotifications: boolean;
  notificationListener: boolean;
};

export type ForwardedNotification = {
  packageName: string;
  title: string;
  message: string;
  postedAtMs: number;
};

export const notificationPermissionStatus = writable<NotificationPermissionStatus | null>(null);

const DEFAULT_STATUS: NotificationPermissionStatus = {
  postNotifications: true,
  notificationListener: false,
};

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  try {
    const status = await invoke<NotificationPermissionStatus>(
      "plugin:notification-forwarder|get_permission_status",
    );
    notificationPermissionStatus.set(status);
    return status;
  } catch {
    notificationPermissionStatus.set(DEFAULT_STATUS);
    return DEFAULT_STATUS;
  }
}

export async function checkNotificationPermissions(ask: boolean): Promise<NotificationPermissionStatus> {
  try {
    const status = await invoke<NotificationPermissionStatus>("plugin:notification-forwarder|check_permissions", {
      ask,
    });
    notificationPermissionStatus.set(status);
    return status;
  } catch {
    notificationPermissionStatus.set(DEFAULT_STATUS);
    return DEFAULT_STATUS;
  }
}

export async function openNotificationListenerSettings(): Promise<void> {
  await invoke("plugin:notification-forwarder|open_notification_listener_settings");
}

export async function drainNotifications(): Promise<ForwardedNotification[]> {
  try {
    return await invoke<ForwardedNotification[]>("plugin:notification-forwarder|drain_notifications");
  } catch {
    return [];
  }
}

export async function postTestNotification(title: string, message: string): Promise<void> {
  await invoke("plugin:notification-forwarder|post_test_notification", { title, message });
}
