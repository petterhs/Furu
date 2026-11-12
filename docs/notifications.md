# Notification forwarding policy

How phone notifications reach the watch, and what happens across a disconnect.

## The rule

**The watch only shows alerts that arrive while it is connected.** Furu never
replays notifications after (re)connecting.

That is deliberate. A notification the user has already read or dismissed must not
reappear on the wrist, and the phone's recent-notification buffer retains entries
after dismissal. Replaying "everything newer than the last watermark" therefore
resends alerts that are no longer on the phone — which is what produced a burst of
old notifications on reconnect.

## Why the buffer can't be replayed safely

The Android listener keeps a ring buffer of the last 128 notifications
(`NotificationQueue.recent`) purely as a diagnostic view. Entries are appended in
`onNotificationPosted` and never removed; `postedAtMs` is the only ordering key.
Nothing in the payload distinguishes "still in the shade" from "dismissed an hour
ago" unless `dismissed` is set explicitly.

Because of that, any replay mechanism would need to filter on dismissal to be
correct — and even then, a dismissed notification means the user is done with it.

## Implementation

- On every successful connection, `absorb_notification_backlog_watermark` advances
  the forwarding watermark to the newest buffered entry (or `now` when the buffer
  is empty) **without sending anything**. This happens for manual connects and
  native reconnects alike.
- The watermark is persisted to `notification-watermark.json` in the app data
  directory and restored in `setup()` before any connection can start. It used to
  be memory-only, so each launch reset it to 0 and the next connect replayed the
  whole buffer.
- `NotificationQueue.markDismissed` records `onNotificationRemoved` so the
  diagnostic list reflects reality. This does not affect delivery; it exists so the
  buffer cannot imply an alert is still waiting when it is not.

## What the user can configure

Global forwarding, per-device forwarding, and a per-package blocklist. There is no
"replay missed notifications" setting: it was removed because replaying is not a
behaviour Furu should offer.

## Checking it

1. Disconnect the watch and let several notifications arrive, then dismiss them.
2. Reconnect and watch Logs for `[notif-fwd] absorb backlog watermark=…`.
3. The watch should receive nothing from before the reconnect.
4. With the watch connected, post a new notification: it should arrive normally.
