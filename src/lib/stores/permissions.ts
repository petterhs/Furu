import { get } from "svelte/store";
import { requestBlePermissions } from "$lib/stores/bleSession";
import {
  checkNotificationPermissions,
  getNotificationPermissionStatus,
  notificationPermissionStatus,
  openNotificationListenerSettings as openListenerSettingsNative,
} from "$lib/stores/notificationForwarder";

export type PermissionStatusRow = {
  id: "ble" | "postNotifications" | "notificationListener";
  label: string;
  granted: boolean;
  requestable: boolean;
};

export async function refreshPermissionsStatus(): Promise<PermissionStatusRow[]> {
  const ble = await requestBlePermissions(false);
  const notif = await getNotificationPermissionStatus();
  return [
    { id: "ble", label: "Bluetooth permissions", granted: ble, requestable: true },
    {
      id: "postNotifications",
      label: "Android notification permission (POST_NOTIFICATIONS)",
      granted: notif.postNotifications,
      requestable: true,
    },
    {
      id: "notificationListener",
      label: "Notification listener access",
      granted: notif.notificationListener,
      requestable: false,
    },
  ];
}

export async function requestPromptablePermissions(): Promise<PermissionStatusRow[]> {
  const ble = await requestBlePermissions(true);
  const notif = await checkNotificationPermissions(true);
  return [
    { id: "ble", label: "Bluetooth permissions", granted: ble, requestable: true },
    {
      id: "postNotifications",
      label: "Android notification permission (POST_NOTIFICATIONS)",
      granted: notif.postNotifications,
      requestable: true,
    },
    {
      id: "notificationListener",
      label: "Notification listener access",
      granted: notif.notificationListener,
      requestable: false,
    },
  ];
}

export async function openNotificationListenerSettings(): Promise<void> {
  await openListenerSettingsNative();
  await getNotificationPermissionStatus();
}

export function hasNotificationListenerPermission(): boolean {
  return get(notificationPermissionStatus)?.notificationListener ?? false;
}
