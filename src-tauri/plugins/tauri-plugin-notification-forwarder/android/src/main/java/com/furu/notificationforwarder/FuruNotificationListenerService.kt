package com.furu.notificationforwarder

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.ConcurrentLinkedQueue

data class NotificationForwardPayload(
    val packageName: String,
    val title: String,
    val message: String,
    val postedAtMs: Long,
    /** Set when Android reports the notification has left the shade. */
    val dismissed: Boolean = false,
)

object NotificationQueue {
    private const val TAG = "FuruNotifQueue"
    private const val MAX_BUFFER = 64
    private const val MAX_RECENT = 128
    private val queue = ConcurrentLinkedQueue<NotificationForwardPayload>()
    private val recent = ArrayDeque<NotificationForwardPayload>()
    private val wakeMonitor = Object()
    private val enqueueVersion = AtomicLong(0)

    fun offer(payload: NotificationForwardPayload) {
        synchronized(recent) {
            while (recent.size >= MAX_RECENT) {
                recent.removeFirstOrNull() ?: break
            }
            recent.addLast(payload)
        }
        while (queue.size >= MAX_BUFFER) {
            queue.poll() ?: break
        }
        queue.offer(payload)
        val version = enqueueVersion.incrementAndGet()
        synchronized(wakeMonitor) {
            wakeMonitor.notifyAll()
        }
        Log.v(TAG, "offer enqueue_version=${version} queue_size=${queue.size}")
    }

    fun drain(): List<NotificationForwardPayload> {
        val out = mutableListOf<NotificationForwardPayload>()
        while (true) {
            val next = queue.poll() ?: break
            out.add(next)
        }
        return out
    }

    fun recent(): List<NotificationForwardPayload> {
        synchronized(recent) {
            return recent.toList()
        }
    }

    /**
     * Marks the entry matching [postedAtMs] as dismissed.
     *
     * The recent buffer is only a diagnostic view; forwarding never replays it.
     * Recording dismissal keeps that view honest, so a notification the user has
     * already cleared does not appear as if it were still waiting on the phone.
     */
    fun markDismissed(postedAtMs: Long) {
        synchronized(recent) {
            val index = recent.indexOfLast { it.postedAtMs == postedAtMs }
            if (index >= 0) {
                recent[index] = recent[index].copy(dismissed = true)
            }
        }
    }

    fun currentVersion(): Long = enqueueVersion.get()

    fun waitForVersionChangeSince(sinceVersion: Long, timeoutMs: Long): Long {
        if (enqueueVersion.get() > sinceVersion) return enqueueVersion.get()
        synchronized(wakeMonitor) {
            if (enqueueVersion.get() > sinceVersion) return enqueueVersion.get()
            if (timeoutMs > 0) {
                wakeMonitor.wait(timeoutMs)
            } else {
                wakeMonitor.wait()
            }
            return enqueueVersion.get()
        }
    }
}

class FuruNotificationListenerService : NotificationListenerService() {
    companion object {
        private const val TAG = "FuruNotifListener"
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Notification listener connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "Notification listener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val notification = sbn.notification ?: return
        // Playback notifications may stop being ongoing when paused. Filter
        // their Android semantics, not player package names or notification text.
        if (notification.category == Notification.CATEGORY_TRANSPORT ||
            notification.extras?.containsKey(Notification.EXTRA_MEDIA_SESSION) == true
        ) {
            Log.d(TAG, "skip media notification pkg=${sbn.packageName}")
            return
        }
        val extras = notification.extras ?: return
        val title =
            extras.getCharSequence("android.title")?.toString()?.trim().orEmpty()
                .ifEmpty { extras.getCharSequence("android.title.big")?.toString()?.trim().orEmpty() }
        val textLines =
            extras
                .getCharSequenceArray("android.textLines")
                ?.map { it?.toString()?.trim().orEmpty() }
                ?.filter { it.isNotEmpty() }
                ?.joinToString("\n")
                .orEmpty()
        val message =
            extras.getCharSequence("android.text")?.toString()?.trim().orEmpty()
                .ifEmpty { extras.getCharSequence("android.bigText")?.toString()?.trim().orEmpty() }
                .ifEmpty { textLines }
                .ifEmpty { extras.getCharSequence("android.subText")?.toString()?.trim().orEmpty() }
                .ifEmpty { notification.tickerText?.toString()?.trim().orEmpty() }
        if (title.isEmpty() && message.isEmpty()) {
            Log.d(TAG, "skip empty notification pkg=${sbn.packageName}")
            return
        }
        if ((notification.flags and android.app.Notification.FLAG_ONGOING_EVENT) != 0) {
            Log.d(TAG, "skip ongoing notification pkg=${sbn.packageName}")
            return
        }

        NotificationQueue.offer(
            NotificationForwardPayload(
                packageName = sbn.packageName ?: "unknown",
                title = title.take(120),
                message = message.take(240),
                postedAtMs = sbn.postTime,
            ),
        )
        Log.i(
            TAG,
            "captured pkg=${sbn.packageName} key=${sbn.key} when=${sbn.postTime} title_len=${title.length} msg_len=${message.length}",
        )
    }

    /**
     * Android reports removals for both dismissal and cancellation. Either way the
     * notification is no longer on the phone, which is exactly what the recent
     * buffer needs to know.
     */
    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        NotificationQueue.markDismissed(sbn.postTime)
        Log.d(TAG, "removed pkg=${sbn.packageName} when=${sbn.postTime}")
    }
}
