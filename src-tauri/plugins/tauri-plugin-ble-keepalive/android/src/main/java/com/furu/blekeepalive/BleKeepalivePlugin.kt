package com.furu.blekeepalive

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

private const val REQ_POST_NOTIFICATIONS = 0x6272_6b6c // "brkl"

@TauriPlugin
class BleKeepalivePlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun startService(invoke: Invoke) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
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
                    invoke.reject(
                        "Notification permission is required for background Bluetooth. Allow it when prompted, then connect again.",
                    )
                    return
                }
            }
            BleConnectionForegroundService.start(activity.applicationContext)
            invoke.resolve()
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "startService failed")
        }
    }

    @Command
    fun stopService(invoke: Invoke) {
        try {
            BleConnectionForegroundService.stop(activity.applicationContext)
            invoke.resolve()
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "stopService failed")
        }
    }
}
