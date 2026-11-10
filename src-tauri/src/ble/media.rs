//! InfiniTime music protocol. Native owner, independent of frontend routes.
#[cfg(any(target_os = "android", test))]
use super::registry;
#[cfg(any(target_os = "android", test))]
use serde::{Deserialize, Serialize};
#[cfg(any(target_os = "android", test))]
use uuid::Uuid;

#[cfg(any(target_os = "android", test))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    permission_granted: bool,
    available: bool,
    session_id: String,
    playing: bool,
    title: String,
    artist: String,
    album: String,
}

#[cfg(any(target_os = "android", test))]
fn text_bytes(text: &str) -> Vec<u8> {
    let mut value = String::new();
    for ch in text.chars() {
        let ch = if ch.is_control() { ' ' } else { ch };
        if value.len() + ch.len_utf8() > 40 {
            break;
        }
        value.push(ch);
    }
    value.into_bytes()
}

#[cfg(any(target_os = "android", test))]
fn fields(snapshot: &Snapshot) -> [(Uuid, Vec<u8>); 4] {
    let title = if snapshot.available {
        snapshot.title.as_str()
    } else {
        ""
    };
    let artist = if snapshot.available {
        snapshot.artist.as_str()
    } else {
        ""
    };
    let album = if snapshot.available {
        snapshot.album.as_str()
    } else {
        ""
    };
    [
        (registry::MEDIA_TITLE_UUID, text_bytes(title)),
        (registry::MEDIA_ARTIST_UUID, text_bytes(artist)),
        (registry::MEDIA_ALBUM_UUID, text_bytes(album)),
        (
            registry::MEDIA_STATUS_UUID,
            vec![u8::from(snapshot.available && snapshot.playing)],
        ),
    ]
}

#[cfg(any(target_os = "android", test))]
fn event_is_current(
    event_link: &(u64, String),
    link: &(u64, String),
    player: &str,
    snapshot: &Snapshot,
    age: std::time::Duration,
) -> bool {
    event_link == link
        && age < std::time::Duration::from_secs(3)
        && !player.is_empty()
        && player == snapshot.session_id
        && snapshot.available
        && snapshot.permission_granted
}

#[cfg(target_os = "android")]
mod android {
    use super::*;
    use std::{
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    };
    use tauri::{AppHandle, Emitter, Manager, Runtime};
    use tauri_plugin_blec::models::WriteType;

    type Link = (u64, String);
    struct Event {
        link: Link,
        player: String,
        code: u8,
        at: Instant,
    }

    fn link<R: Runtime>(app: &AppHandle<R>) -> Option<Link> {
        app.try_state::<super::super::connection::ConnectionManager>()?
            .media_connection()
    }
    fn log<R: Runtime>(app: &AppHandle<R>, message: &str) {
        eprintln!("[media] {message}");
        let _ = app.emit("ble-native-log", format!("Media: {message}"));
    }
    async fn native<R: Runtime, T: serde::de::DeserializeOwned + Send + 'static>(
        app: &AppHandle<R>,
        method: &'static str,
        args: serde_json::Value,
    ) -> Result<T, String> {
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let handle = app
                .try_state::<tauri_plugin_notification_forwarder::NotificationForwarderHandle<R>>()
                .ok_or("Android notification-listener bridge unavailable")?;
            handle
                .0
                .run_mobile_plugin(method, args)
                .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    pub fn start<R: Runtime>(app: AppHandle<R>) {
        tauri::async_runtime::spawn(async move {
            let (tx, mut rx) = tokio::sync::mpsc::channel::<Event>(8);
            let player = Arc::new(Mutex::new(String::new()));
            let mut subscribed: Option<Link> = None;
            let mut previous: Option<Snapshot> = None;
            let mut last_error = String::new();
            let mut retry_at = Instant::now();
            let mut poll_delay = Duration::from_secs(2);
            loop {
                let event = tokio::select! {
                    event=rx.recv()=>event,
                    _=tokio::time::sleep(poll_delay)=>None,
                };
                poll_delay = Duration::from_secs(2);
                let current = link(&app);
                if current != subscribed {
                    previous = None;
                    *player.lock().unwrap_or_else(|e| e.into_inner()) = String::new();
                    if subscribed.take().is_some() && current.is_some() {
                        if let Ok(handler) = tauri_plugin_blec::get_handler() {
                            let _ = tokio::time::timeout(
                                Duration::from_secs(3),
                                handler.unsubscribe(registry::MEDIA_EVENT_UUID),
                            )
                            .await;
                        }
                    }
                    if let Some(key) = current.clone() {
                        if Instant::now() < retry_at {
                            continue;
                        }
                        let callback_key = key.clone();
                        let callback_player = player.clone();
                        let sender = tx.clone();
                        let result = async {
                            let handler =
                                tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
                            handler
                                .subscribe(
                                    registry::MEDIA_EVENT_UUID,
                                    Some(registry::MEDIA_SERVICE_UUID),
                                    move |data: Vec<u8>| {
                                        if data.len() != 1 || ![0, 1, 3, 4, 0xe0].contains(&data[0])
                                        {
                                            return;
                                        }
                                        let event = Event {
                                            link: callback_key.clone(),
                                            player: callback_player
                                                .lock()
                                                .unwrap_or_else(|e| e.into_inner())
                                                .clone(),
                                            code: data[0],
                                            at: Instant::now(),
                                        };
                                        if sender.try_send(event).is_err() {
                                            eprintln!("[media] dropped event: queue full");
                                        }
                                    },
                                )
                                .await
                                .map_err(|e| e.to_string())
                        };
                        match tokio::time::timeout(Duration::from_secs(4), result).await {
                            Ok(Ok(())) => {
                                subscribed = Some(key);
                                last_error.clear();
                                log(&app, "subscribed to watch controls");
                            }
                            result => {
                                let message = format!("Cannot subscribe: {result:?}");
                                if message != last_error {
                                    log(&app, &message);
                                    last_error = message;
                                }
                                retry_at = Instant::now() + Duration::from_secs(15);
                                continue;
                            }
                        }
                    }
                }
                let Some(key) = subscribed.clone() else {
                    continue;
                };
                if link(&app).as_ref() != Some(&key) {
                    continue;
                }
                let snapshot =
                    match native::<R, Snapshot>(&app, "mediaSnapshot", serde_json::Value::Null)
                        .await
                    {
                        Ok(snapshot) => snapshot,
                        Err(error) => {
                            if error != last_error {
                                log(&app, &error);
                                last_error = error;
                            }
                            continue;
                        }
                    };
                *player.lock().unwrap_or_else(|e| e.into_inner()) = snapshot.session_id.clone();
                if !snapshot.permission_granted && last_error != "permission" {
                    log(
                        &app,
                        "Enable Android notification access in Furu Settings to use media controls",
                    );
                    last_error = "permission".into();
                }
                let mut force = event
                    .as_ref()
                    .is_some_and(|event| event.code == 0xe0 && event.link == key);
                if let Some(event) = event.filter(|event| event.code != 0xe0) {
                    if event_is_current(
                        &event.link,
                        &key,
                        &event.player,
                        &snapshot,
                        event.at.elapsed(),
                    ) && link(&app).as_ref() == Some(&key)
                    {
                        match native::<R, serde_json::Value>(
                            &app,
                            "mediaControl",
                            serde_json::json!({"sessionId":event.player,"event":event.code}),
                        )
                        .await
                        {
                            Ok(_) => {
                                log(
                                    &app,
                                    &format!(
                                        "event 0x{:02x} delivered to active Android session",
                                        event.code
                                    ),
                                );
                                force = true;
                                poll_delay = Duration::from_millis(100);
                            }
                            Err(error) => log(&app, &format!("Command rejected: {error}")),
                        }
                    } else {
                        log(&app, "Dropped stale event or unavailable player");
                    }
                }
                if previous.as_ref() != Some(&snapshot) || force {
                    let old = previous.as_ref().map(fields);
                    let mut success = true;
                    for (index, (uuid, value)) in fields(&snapshot).into_iter().enumerate() {
                        if !force && old.as_ref().is_some_and(|old| old[index].1 == value) {
                            continue;
                        }
                        if link(&app).as_ref() != Some(&key) {
                            success = false;
                            break;
                        }
                        let write = async {
                            let handler =
                                tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
                            handler
                                .send_data(
                                    uuid,
                                    Some(registry::MEDIA_SERVICE_UUID),
                                    &value,
                                    WriteType::WithResponse,
                                )
                                .await
                                .map_err(|e| e.to_string())
                        };
                        match tokio::time::timeout(Duration::from_secs(3), write).await {
                            Ok(Ok(())) => {}
                            result => {
                                log(&app, &format!("Metadata write failed: {result:?}"));
                                success = false;
                                break;
                            }
                        }
                    }
                    if success {
                        previous = Some(snapshot);
                    }
                }
            }
        });
    }
}

#[cfg(target_os = "android")]
pub use android::start;
#[cfg(not(target_os = "android"))]
pub fn start<R: tauri::Runtime>(_app: tauri::AppHandle<R>) {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn commands_expire_and_never_follow_a_new_connection_or_player() {
        let link = (7, "watch-a".to_string());
        let snapshot = Snapshot {
            available: true,
            permission_granted: true,
            session_id: "player-a".into(),
            ..Default::default()
        };
        let fresh = std::time::Duration::from_millis(100);
        assert!(event_is_current(&link, &link, "player-a", &snapshot, fresh));
        assert!(!event_is_current(
            &(8, "watch-a".into()),
            &link,
            "player-a",
            &snapshot,
            fresh
        ));
        assert!(!event_is_current(
            &(7, "watch-b".into()),
            &link,
            "player-a",
            &snapshot,
            fresh
        ));
        assert!(!event_is_current(
            &link, &link, "player-b", &snapshot, fresh
        ));
        assert!(!event_is_current(
            &link,
            &link,
            "player-a",
            &snapshot,
            std::time::Duration::from_secs(3)
        ));
        assert!(!event_is_current(
            &link,
            &link,
            "player-a",
            &Snapshot::default(),
            fresh
        ));
    }
    #[test]
    fn metadata_truncation_preserves_utf8_and_no_player_clears_state() {
        let bytes = text_bytes(&"ø".repeat(30));
        assert_eq!(bytes.len(), 40);
        assert!(std::str::from_utf8(&bytes).is_ok());
        let snapshot = Snapshot {
            available: false,
            playing: true,
            title: "Old title".into(),
            ..Default::default()
        };
        let fields = fields(&snapshot);
        assert!(fields[..3].iter().all(|(_, data)| data.is_empty()));
        assert_eq!(fields[3].1, vec![0]);
    }
}
