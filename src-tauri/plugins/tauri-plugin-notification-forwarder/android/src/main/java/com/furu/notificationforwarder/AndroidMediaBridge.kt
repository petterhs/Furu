package com.furu.notificationforwarder

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.view.KeyEvent
import app.tauri.plugin.JSObject
import java.util.UUID

/** Uses Android media sessions; never forwards notification text as playback state. */
class AndroidMediaBridge(private val context: Context) {
    private val manager = context.getSystemService(MediaSessionManager::class.java)
    private var selected: MediaController? = null
    private var selectedId = ""

    private fun playing(controller: MediaController) = controller.playbackState?.state in listOf(
        PlaybackState.STATE_PLAYING, PlaybackState.STATE_BUFFERING, PlaybackState.STATE_CONNECTING,
    )

    @Synchronized
    fun snapshot(): JSObject {
        val controllers = try {
            manager?.getActiveSessions(ComponentName(context, FuruNotificationListenerService::class.java)) ?: emptyList()
        } catch (_: SecurityException) {
            selected = null
            selectedId = ""
            return empty(false)
        }
        val previous = selected
        val controller = controllers.firstOrNull { playing(it) }
            ?: controllers.firstOrNull { it.sessionToken == previous?.sessionToken }
            ?: controllers.firstOrNull()
        if (controller?.sessionToken != previous?.sessionToken) selectedId = if (controller == null) "" else UUID.randomUUID().toString()
        selected = controller
        if (controller == null) return empty(true)
        val metadata = controller.metadata
        return JSObject().apply {
            put("permissionGranted", true)
            put("available", true)
            put("sessionId", selectedId)
            put("playing", playing(controller))
            put("title", metadata?.getText(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)?.toString()
                ?: metadata?.getText(MediaMetadata.METADATA_KEY_TITLE)?.toString() ?: controller.packageName)
            put("artist", metadata?.getText(MediaMetadata.METADATA_KEY_ARTIST)?.toString() ?: "")
            put("album", metadata?.getText(MediaMetadata.METADATA_KEY_ALBUM)?.toString() ?: "")
        }
    }

    @Synchronized
    fun control(sessionId: String, event: Int) {
        // Refresh selection before validating: a queued press must not target a
        // newly selected player or an ended session.
        snapshot()
        val controller = selected ?: error("No active media session")
        require(sessionId.isNotEmpty() && sessionId == selectedId) { "Media session changed" }
        when (event) {
            0 -> controller.transportControls.play()
            1 -> controller.transportControls.pause()
            3, 4 -> {
                val key = if (event == 3) KeyEvent.KEYCODE_MEDIA_NEXT else KeyEvent.KEYCODE_MEDIA_PREVIOUS
                val accepted = controller.dispatchMediaButtonEvent(KeyEvent(KeyEvent.ACTION_DOWN, key))
                controller.dispatchMediaButtonEvent(KeyEvent(KeyEvent.ACTION_UP, key))
                check(accepted) { "Player does not accept this media key" }
            }
            else -> error("Unsupported media event")
        }
    }

    private fun empty(permission: Boolean) = JSObject().apply {
        put("permissionGranted", permission)
        put("available", false)
        put("sessionId", "")
        put("playing", false)
        put("title", "")
        put("artist", "")
        put("album", "")
    }
}
