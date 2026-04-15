package com.furu.notificationforwarder

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlin.concurrent.thread

private const val REQ_POST_NOTIFICATIONS = 0x6675_7275 // "furu"

@InvokeArg
class CheckPermissionsArgs {
    var ask: Boolean = false
}

@InvokeArg
class TestNotificationArgs {
    var title: String = "Furu test notification"
    var message: String = "This should be picked up by notification drain."
}

@InvokeArg
class WaitNotificationsArgs {
    var sinceVersion: Long = 0
    var timeoutMs: Long = 15_000
}

@TauriPlugin
class NotificationForwarderPlugin(private val activity: Activity) : Plugin(activity) {
    companion object {
        private const val TAG = "FuruNotifPlugin"
    }

    private val testChannelId = "furu_notification_forwarder_test"

    @Command
    override fun checkPermissions(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(CheckPermissionsArgs::class.java)
            if (args.ask && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val granted = ContextCompat.checkSelfPermission(
                    activity,
                    Manifest.permission.POST_NOTIFICATIONS,
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                        REQ_POST_NOTIFICATIONS,
                    )
                }
            }
            val status = currentPermissionStatus()
            Log.i(TAG, "checkPermissions ask=${args.ask} status=$status")
            invoke.resolve(status)
        } catch (ex: Exception) {
            Log.e(TAG, "checkPermissions failed", ex)
            invoke.reject(ex.message ?: "checkPermissions failed")
        }
    }

    @Command
    fun getPermissionStatus(invoke: Invoke) {
        try {
            val status = currentPermissionStatus()
            Log.i(TAG, "getPermissionStatus status=$status")
            invoke.resolve(status)
        } catch (ex: Exception) {
            Log.e(TAG, "getPermissionStatus failed", ex)
            invoke.reject(ex.message ?: "getPermissionStatus failed")
        }
    }

    @Command
    fun openNotificationListenerSettings(invoke: Invoke) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            Log.i(TAG, "openNotificationListenerSettings launched")
            invoke.resolve()
        } catch (ex: Exception) {
            Log.e(TAG, "openNotificationListenerSettings failed", ex)
            invoke.reject(ex.message ?: "openNotificationListenerSettings failed")
        }
    }

    @Command
    fun drainNotifications(invoke: Invoke) {
        try {
            val drained = NotificationQueue.drain()
            Log.d(TAG, "drainNotifications drained_count=${drained.size}")
            val result = drained.map { payload ->
                JSObject().apply {
                    put("packageName", payload.packageName)
                    put("title", payload.title)
                    put("message", payload.message)
                    put("postedAtMs", payload.postedAtMs)
                }
            }
            val payload = JSObject().apply {
                put("notifications", result)
            }
            invoke.resolve(payload)
        } catch (ex: Exception) {
            Log.e(TAG, "drainNotifications failed", ex)
            invoke.reject(ex.message ?: "drainNotifications failed")
        }
    }

    @Command
    fun listRecentNotifications(invoke: Invoke) {
        try {
            val recent = NotificationQueue.recent()
            Log.d(TAG, "listRecentNotifications recent_count=${recent.size}")
            val result = recent.map { payload ->
                JSObject().apply {
                    put("packageName", payload.packageName)
                    put("title", payload.title)
                    put("message", payload.message)
                    put("postedAtMs", payload.postedAtMs)
                }
            }
            val payload = JSObject().apply {
                put("notifications", result)
            }
            invoke.resolve(payload)
        } catch (ex: Exception) {
            Log.e(TAG, "listRecentNotifications failed", ex)
            invoke.reject(ex.message ?: "listRecentNotifications failed")
        }
    }

    @Command
    fun waitForNotifications(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(WaitNotificationsArgs::class.java)
            val timeout = args.timeoutMs.coerceIn(0, 60_000)
            thread(name = "furu-notif-wait", start = true) {
                try {
                    val version = NotificationQueue.waitForVersionChangeSince(args.sinceVersion, timeout)
                    val changed = version > args.sinceVersion
                    val payload = JSObject().apply {
                        put("version", version)
                        put("changed", changed)
                    }
                    if (changed) {
                        Log.i(
                            TAG,
                            "waitForNotifications change since=${args.sinceVersion} resultVersion=$version",
                        )
                    }
                    invoke.resolve(payload)
                } catch (ex: Exception) {
                    Log.e(TAG, "waitForNotifications worker failed", ex)
                    invoke.reject(ex.message ?: "waitForNotifications worker failed")
                }
            }
        } catch (ex: Exception) {
            Log.e(TAG, "waitForNotifications failed", ex)
            invoke.reject(ex.message ?: "waitForNotifications failed")
        }
    }

    @Command
    fun postTestNotification(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(TestNotificationArgs::class.java)
            ensureTestChannel()
            val notification =
                NotificationCompat.Builder(activity, testChannelId)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(args.title.ifBlank { "Furu test notification" })
                    .setContentText(args.message.ifBlank { "This should be picked up by notification drain." })
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true)
                    .build()
            NotificationManagerCompat.from(activity).notify(4001, notification)
            Log.i(
                TAG,
                "postTestNotification posted title_len=${args.title.length} msg_len=${args.message.length} listenerEnabled=${isNotificationListenerEnabled()}",
            )
            invoke.resolve()
        } catch (ex: Exception) {
            Log.e(TAG, "postTestNotification failed", ex)
            invoke.reject(ex.message ?: "postTestNotification failed")
        }
    }

    private fun currentPermissionStatus(): JSObject {
        val postNotificationsGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
        val listenerEnabled = isNotificationListenerEnabled()
        return JSObject().apply {
            put("postNotifications", postNotificationsGranted)
            put("notificationListener", listenerEnabled)
        }
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val enabled =
            Settings.Secure.getString(
                activity.contentResolver,
                "enabled_notification_listeners",
            ) ?: return false
        val me = ComponentName(activity, FuruNotificationListenerService::class.java).flattenToString()
        return enabled.split(':').any { it.equals(me, ignoreCase = true) }
    }

    private fun ensureTestChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = activity.getSystemService(NotificationManager::class.java) ?: return
        val channel =
            NotificationChannel(
                testChannelId,
                "Furu debug notifications",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Debug notifications for notification forwarder tests"
            }
        manager.createNotificationChannel(channel)
    }
}
