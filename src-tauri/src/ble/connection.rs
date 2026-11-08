//! Single native owner for connection intent, retries, cleanup and OTA pauses.
use super::{
    connection_policy::{Policies, Retry},
    feature_id::FeatureId,
    session,
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_blec::{
    models::{AdapterState, BleDevice, ScanFilter},
    Handler, OnDisconnectHandler,
};
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::Instant,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkEvent {
    pub id: u64,
    pub address: String,
    pub at: String,
    pub connected: bool,
    pub detail: String,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub session_id: u64,
    pub connected: bool,
    pub status: String,
    pub address: Option<String>,
    pub name: String,
    pub profile_id: String,
    pub feature_ids: Vec<String>,
    pub attempt: u32,
    pub detail: String,
    pub events: Vec<LinkEvent>,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Saved {
    policies: Policies,
    resume_address: Option<String>,
    last_event_id: u64,
    events: Vec<LinkEvent>,
}
impl Saved {
    fn restore_target(&self) -> Option<String> {
        self.resume_address
            .clone()
            .filter(|address| self.policies.device(address).is_some_and(|p| p.enabled))
    }
}

#[derive(Clone)]
pub struct ConnectionManager {
    tx: mpsc::UnboundedSender<Command>,
    snapshot: Arc<Mutex<Snapshot>>,
}
type Reply = oneshot::Sender<Result<(), String>>;
enum Command {
    Policies(Policies, Reply),
    Connect(String, bool, bool, Reply),
    Stop(Reply),
    Pause(Reply),
    Resume(bool),
}
pub struct DfuPause {
    tx: mpsc::UnboundedSender<Command>,
    activated: bool,
}
impl DfuPause {
    pub fn activation_requested(&mut self) {
        self.activated = true;
    }
}
impl Drop for DfuPause {
    fn drop(&mut self) {
        let _ = self.tx.send(Command::Resume(self.activated));
    }
}
impl ConnectionManager {
    async fn request(&self, build: impl FnOnce(Reply) -> Command) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.tx
            .send(build(tx))
            .map_err(|_| "Connection manager stopped")?;
        rx.await.map_err(|_| "Connection manager stopped")?
    }
    pub async fn pause(&self) -> Result<DfuPause, String> {
        self.request(Command::Pause).await?;
        Ok(DfuPause {
            tx: self.tx.clone(),
            activated: false,
        })
    }
    pub async fn connect(
        &self,
        address: String,
        repair: bool,
        scan_first: bool,
    ) -> Result<(), String> {
        let address = normalize_address(&address)?;
        self.request(|reply| Command::Connect(address, repair, scan_first, reply))
            .await
    }
    pub async fn stop(&self) -> Result<(), String> {
        self.request(Command::Stop).await
    }
    pub async fn policies(&self, policies: Policies) -> Result<(), String> {
        self.request(|r| Command::Policies(policies, r)).await
    }
    pub fn snapshot(&self) -> Snapshot {
        self.snapshot
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

pub fn start(app: AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("connection-manager.json");
    let (tx, rx) = mpsc::unbounded_channel();
    let snapshot = Arc::new(Mutex::new(Snapshot {
        status: "idle".into(),
        profile_id: "unknown".into(),
        ..Default::default()
    }));
    app.manage(ConnectionManager {
        tx,
        snapshot: snapshot.clone(),
    });
    tauri::async_runtime::spawn(async move {
        let saved = match std::fs::metadata(&path) {
            Ok(meta) if meta.len() <= 1_048_576 => std::fs::read(&path)
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default(),
            _ => Saved::default(),
        };
        let mut actor = Actor {
            app,
            path,
            saved,
            shared: snapshot,
            state: Snapshot::default(),
            target: None,
            retry: Retry::default(),
            due: None,
            job: None,
            paused: false,
            cleanup_required: false,
            ota_cleanup: false,
            linked: false,
            manual: false,
            repair: false,
            grace: false,
        };
        actor.target = actor.saved.restore_target();
        if actor.target.is_some() {
            actor.due = Some(Instant::now() + Duration::from_secs(5));
        }
        actor.state.status = "idle".into();
        actor.state.events = actor.saved.events.clone();
        actor.publish("Native connection manager started");
        actor.run(rx).await;
    });
    Ok(())
}
struct Job {
    generation: u64,
    cancel: Arc<AtomicBool>,
    task: JoinHandle<Outcome>,
}
enum Outcome {
    Connected(Result<BleDevice, String>),
    Disconnected(Result<(), String>),
}
struct Actor {
    app: AppHandle,
    path: PathBuf,
    saved: Saved,
    shared: Arc<Mutex<Snapshot>>,
    state: Snapshot,
    target: Option<String>,
    retry: Retry,
    due: Option<Instant>,
    job: Option<Job>,
    paused: bool,
    cleanup_required: bool,
    ota_cleanup: bool,
    linked: bool,
    manual: bool,
    repair: bool,
    grace: bool,
}
impl Actor {
    fn log(&self, message: &str) {
        eprintln!("[connection] {message}");
        let _ = self.app.emit("ble-native-log", message);
    }
    fn publish(&mut self, detail: &str) {
        self.state.connected = self.linked && !self.paused && !self.ota_cleanup;
        self.state.revision += 1;
        self.state.address = self.target.clone();
        self.state.attempt = self.retry.attempts;
        self.state.detail = detail.to_string();
        self.state.events = self.saved.events.clone();
        *self.shared.lock().unwrap_or_else(|e| e.into_inner()) = self.state.clone();
        let _ = self.app.emit("ble-native-connection", &self.state);
    }
    fn save(&mut self) -> Result<(), String> {
        self.saved.resume_address = self
            .target
            .clone()
            .filter(|a| self.saved.policies.device(a).is_some_and(|p| p.enabled));
        let parent = self
            .path
            .parent()
            .ok_or("Missing connection data directory")?;
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let temp = self.path.with_extension("json.new");
        std::fs::write(
            &temp,
            serde_json::to_vec(&self.saved).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(temp, &self.path).map_err(|e| e.to_string())
    }
    fn event(&mut self, connected: bool, detail: &str) {
        let Some(address) = self.state.address.clone().or(self.target.clone()) else {
            return;
        };
        let now = chrono::Utc::now();
        let id =
            (now.timestamp_millis().max(0) as u64).max(self.saved.last_event_id.saturating_add(1));
        self.saved.last_event_id = id;
        self.saved.events.push(LinkEvent {
            id,
            address,
            at: now.to_rfc3339(),
            connected,
            detail: detail.into(),
        });
        if self.saved.events.len() > 512 {
            self.saved.events.drain(..self.saved.events.len() - 512);
        }
        if let Err(error) = self.save() {
            self.log(&format!("Cannot persist connection history: {error}"));
        }
    }
    fn invalidate(&mut self) {
        self.retry.cancel();
        self.due = None;
        if let Some(job) = &self.job {
            job.cancel.store(true, Ordering::SeqCst);
        }
    }
    fn set_session(&self, connected: bool) {
        if let Ok(mut state) = session::global().lock() {
            state.connection_active = connected;
            state.notification_forwarding_enabled =
                self.saved.policies.notification_forwarding_enabled;
            state.blocked_notification_packages =
                self.saved.policies.blocked_notification_packages.clone();
            if connected {
                if let Some(address) = &self.target {
                    let profile = self.saved.policies.profile(address, &self.state.name);
                    state.active_profile_id = profile.id;
                    state.active_feature_ids = profile.feature_ids;
                    state.active_device_notifications_enabled = self
                        .saved
                        .policies
                        .device(address)
                        .is_some_and(|p| p.notifications_enabled);
                }
            }
        }
    }
    async fn keepalive(&self, connected: bool, retrying: bool) {
        let app = self.app.clone();
        let result = tokio::task::spawn_blocking(move || {
            if connected || retrying {
                tauri_plugin_ble_keepalive::start_service(app, Some(retrying))
            } else {
                tauri_plugin_ble_keepalive::stop_service(app)
            }
        })
        .await;
        if !matches!(result, Ok(Ok(()))) {
            self.log("Android foreground service update failed; see native logs");
        }
    }
    fn lost_link(&mut self, detail: &str) {
        if self.linked {
            self.event(false, detail);
            self.linked = false;
        }
        self.set_session(false);
    }
    fn retry_allowed(&self) -> bool {
        self.target
            .as_deref()
            .and_then(|a| self.saved.policies.device(a))
            .is_some_and(|p| p.enabled)
    }
    fn queue_retry(&mut self) {
        if !self.paused && self.retry_allowed() {
            self.manual = false;
            self.retry.start(false);
            self.due = Some(Instant::now() + Duration::from_secs(5));
            self.state.status = "reconnecting".into();
        } else {
            self.due = None;
            self.state.status = if self.paused { "paused" } else { "idle" }.into();
        }
    }
    async fn run(&mut self, mut commands: mpsc::UnboundedReceiver<Command>) {
        let handler = match tauri_plugin_blec::get_handler() {
            Ok(h) => h,
            Err(e) => {
                self.log(&e.to_string());
                return;
            }
        };
        let (tx, mut links) = mpsc::channel(32);
        handler.set_connection_update_channel(tx).await;
        if self.target.is_some() {
            self.keepalive(false, true).await;
        }
        loop {
            let deadline = self
                .due
                .unwrap_or_else(|| Instant::now() + Duration::from_secs(86_400));
            enum Wake {
                Command(Option<Command>),
                Link(Option<bool>),
                Done(Result<Outcome, tokio::task::JoinError>),
                Timer,
            }
            let wake = tokio::select! {
                command = commands.recv() => Wake::Command(command),
                link = links.recv() => Wake::Link(link),
                result = async { match &mut self.job { Some(job) => (&mut job.task).await, None => std::future::pending().await } } => Wake::Done(result),
                _ = tokio::time::sleep_until(deadline), if self.due.is_some() && self.job.is_none() && !self.paused => Wake::Timer,
            };
            match wake {
                Wake::Command(None) | Wake::Link(None) => break,
                Wake::Command(Some(command)) => self.command(command).await,
                Wake::Link(Some(false)) if self.linked => {
                    let intentional = self.paused
                        || self.ota_cleanup
                        || self.cleanup_required
                        || self.state.status == "disconnecting";
                    let detail = if self.paused || self.ota_cleanup {
                        "disconnected (firmware update)"
                    } else if intentional {
                        "disconnected (app requested)"
                    } else {
                        "disconnected (link loss)"
                    };
                    self.lost_link(detail);
                    if !intentional {
                        self.queue_retry();
                        let name = self
                            .target
                            .as_deref()
                            .and_then(|a| self.saved.policies.device(a))
                            .map(|p| {
                                if p.nickname.is_empty() {
                                    p.name.clone()
                                } else {
                                    p.nickname.clone()
                                }
                            })
                            .unwrap_or_else(|| "PineTime".into());
                        let app = self.app.clone();
                        let _ = tokio::task::spawn_blocking(move || {
                            tauri_plugin_ble_keepalive::notify_disconnect(app, name)
                        })
                        .await;
                    }
                    self.log(detail);
                    self.publish(detail);
                    self.keepalive(false, self.due.is_some() || self.paused)
                        .await;
                }
                Wake::Link(_) => {} // connect readiness comes from completed discovery, not the raw link
                Wake::Done(result) => {
                    let generation = self.job.take().unwrap().generation;
                    match result {
                        Ok(Outcome::Connected(Ok(device)))
                            if generation == self.retry.generation
                                && !self.paused
                                && self
                                    .target
                                    .as_deref()
                                    .is_some_and(|a| a.eq_ignore_ascii_case(&device.address))
                                && handler.is_connected() =>
                        {
                            self.state.name = device.name;
                            self.linked = true;
                            self.state.status = "connected".into();
                            self.due = None;
                            let profile = self
                                .saved
                                .policies
                                .profile(&device.address, &self.state.name);
                            self.state.profile_id = profile.id;
                            self.state.feature_ids = profile.feature_ids;
                            self.set_session(true);
                            if self.manual
                                || self
                                    .saved
                                    .policies
                                    .device(&device.address)
                                    .is_some_and(|p| !p.replay_notifications)
                            {
                                let _ = super::notification_forwarding::absorb_notification_backlog_watermark(self.app.clone()).await;
                            }
                            self.event(
                                true,
                                if self.manual {
                                    "connected (user)"
                                } else {
                                    "connected (native reconnect)"
                                },
                            );
                            self.state.session_id = self.saved.last_event_id;
                            self.log("Connection ready; services and profile configured");
                            self.publish("Connected");
                            self.keepalive(true, false).await;
                        }
                        Ok(Outcome::Connected(result)) => {
                            if generation != self.retry.generation || self.paused {
                                self.cleanup_required = true;
                            } else {
                                self.manual = false;
                                self.cleanup_required = handler.is_connected();
                                let error = result.err().unwrap_or_else(|| {
                                    "Connection ended before discovery completed".into()
                                });
                                let next = self
                                    .target
                                    .as_deref()
                                    .and_then(|a| self.saved.policies.device(a))
                                    .and_then(|p| self.retry.failed(p));
                                self.due = next.map(|delay| Instant::now() + delay);
                                self.state.status = if next.is_some() {
                                    "reconnecting"
                                } else {
                                    "error"
                                }
                                .into();
                                self.log(&format!(
                                    "Attempt failed: {error}; failures={}; next={next:?}",
                                    self.retry.failures
                                ));
                                self.publish(&error);
                                self.keepalive(false, next.is_some()).await;
                            }
                        }
                        Ok(Outcome::Disconnected(result)) => {
                            self.cleanup_required = false;
                            self.lost_link(if self.paused || self.ota_cleanup {
                                "disconnected (firmware update)"
                            } else {
                                "disconnected (app requested)"
                            });
                            self.ota_cleanup = false;
                            if let Err(error) = result {
                                self.log(&format!("Disconnect cleanup: {error}"));
                            }
                            if self.paused {
                                self.state.status = "paused".into();
                            } else if self.target.is_none() {
                                self.state.status = "idle".into();
                            } else if self.due.is_none() && self.state.status != "error" {
                                self.queue_retry();
                            }
                            self.publish("GATT session retired");
                            self.keepalive(false, self.due.is_some() || self.paused)
                                .await;
                        }
                        Err(error) => {
                            self.cleanup_required = true;
                            self.state.status = "error".into();
                            self.publish(&format!("Connection worker failed: {error}"));
                        }
                    }
                }
                Wake::Timer => self.attempt(handler).await,
            }
            if self.cleanup_required && self.job.is_none() {
                let grace = std::mem::take(&mut self.grace);
                self.job = Some(Job {
                    generation: self.retry.generation,
                    cancel: Arc::new(AtomicBool::new(false)),
                    task: tokio::spawn(async move {
                        if grace {
                            tokio::time::sleep(Duration::from_millis(1800)).await;
                        }
                        let result = match handler.disconnect().await {
                            Ok(()) | Err(tauri_plugin_blec::Error::NoDeviceConnected) => Ok(()),
                            Err(e) => Err(e.to_string()),
                        };
                        Outcome::Disconnected(result)
                    }),
                });
            }
        }
    }
    async fn attempt(&mut self, handler: &'static Handler) {
        if self.target.is_none() || self.paused {
            self.due = None;
            return;
        }
        if !tauri_plugin_blec::check_permissions(false).unwrap_or(false) {
            self.state.status = "error".into();
            self.due = None;
            self.publish("Bluetooth permission missing; open Furu to grant it");
            self.keepalive(false, false).await;
            return;
        }
        if !matches!(handler.get_adapter_state().await, AdapterState::On) {
            if self.state.status != "waiting_bluetooth" {
                self.state.status = "waiting_bluetooth".into();
                self.publish("Waiting for Bluetooth to be enabled");
            }
            self.due = Some(Instant::now() + Duration::from_secs(2));
            return;
        }
        let address = self.target.clone().unwrap();
        let scan = self.retry.next_uses_scan();
        let repair = std::mem::take(&mut self.repair);
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = cancel.clone();
        self.due = None;
        self.state.status = "connecting".into();
        self.log(&format!(
            "Attempt {} generation={} address={address} scan={scan} repair={repair}",
            self.retry.attempts, self.retry.generation
        ));
        self.publish("Connecting and discovering services");
        self.keepalive(false, true).await;
        self.job = Some(Job {
            generation: self.retry.generation,
            cancel,
            task: tokio::spawn(async move {
                Outcome::Connected(
                    connect_attempt(handler, address, scan, repair, worker_cancel).await,
                )
            }),
        });
    }
    async fn command(&mut self, command: Command) {
        match command {
            Command::Policies(policies, reply) => {
                if self.paused
                    && self
                        .target
                        .as_deref()
                        .is_some_and(|a| policies.device(a).is_none())
                {
                    let _ = reply.send(Err("Cannot forget a device during DFU".into()));
                    return;
                }
                self.saved.policies = policies;
                if let Some(address) = &self.target {
                    if self.saved.policies.device(address).is_none() {
                        self.invalidate();
                        self.target = None;
                        self.lost_link("disconnected (device forgotten)");
                        self.cleanup_required = true;
                    } else if !self.retry_allowed() && !self.linked && !self.manual {
                        self.invalidate();
                        self.cleanup_required = self.job.is_some();
                        self.state.status = "idle".into();
                    }
                }
                self.set_session(self.linked && !self.paused);
                if self.linked {
                    if let Some(address) = &self.target {
                        let profile = self.saved.policies.profile(address, &self.state.name);
                        self.state.profile_id = profile.id;
                        self.state.feature_ids = profile.feature_ids;
                    }
                }
                let result = self.save();
                self.publish("Connection preferences updated");
                self.keepalive(
                    self.linked,
                    self.due.is_some() || self.paused || self.job.is_some(),
                )
                .await;
                let _ = reply.send(result);
            }
            Command::Connect(address, repair, scan_first, reply) => {
                if self.paused {
                    let _ = reply.send(Err("Wait for the firmware update to finish".into()));
                    return;
                }
                if self.linked && self.target.as_deref() == Some(&address) && !repair {
                    let _ = reply.send(Ok(()));
                    return;
                }
                self.invalidate();
                self.manual = true;
                self.repair = repair;
                self.cleanup_required = self.linked || self.job.is_some();
                self.target = Some(address);
                if self.linked {
                    self.lost_link("disconnected (switching device)");
                }
                self.retry.start(scan_first);
                self.due = Some(Instant::now());
                self.state.status = "connecting".into();
                let result = self.save();
                self.publish("Connection requested");
                self.keepalive(false, true).await;
                let _ = reply.send(result);
            }
            Command::Stop(reply) => {
                if self.paused {
                    let _ = reply.send(Err("Cannot disconnect during firmware update".into()));
                    return;
                }
                self.invalidate();
                self.cleanup_required = self.linked || self.job.is_some();
                // History uses the previous snapshot address, while persistence
                // already records that a manual stop must not resume on restart.
                self.target = None;
                self.lost_link("disconnected (app requested)");
                self.state.status = if self.cleanup_required {
                    "disconnecting"
                } else {
                    "idle"
                }
                .into();
                let result = self.save();
                self.publish("Disconnected by user");
                self.keepalive(false, false).await;
                let _ = reply.send(result);
            }
            Command::Pause(reply) => {
                if self.paused || self.job.is_some() || !self.linked {
                    let _ = reply.send(Err("Wait until the connection is ready before DFU".into()));
                    return;
                }
                self.invalidate();
                self.paused = true;
                self.state.status = "paused".into();
                self.set_session(false);
                self.publish("Firmware update owns the connection");
                let _ = reply.send(Ok(()));
            }
            Command::Resume(activated) => {
                self.paused = false;
                self.cleanup_required = true;
                self.ota_cleanup = true;
                self.grace = activated;
                self.manual = false;
                self.retry.start(true);
                self.due = if self.retry_allowed() {
                    Some(Instant::now() + Duration::from_secs(5))
                } else {
                    None
                };
                self.state.status = "disconnecting".into();
                self.publish(if activated {
                    "Activation requested; waiting for reboot"
                } else {
                    "Update ended; retiring GATT session"
                });
            }
        }
    }
}

async fn connect_attempt(
    handler: &'static Handler,
    address: String,
    scan: bool,
    repair: bool,
    cancel: Arc<AtomicBool>,
) -> Result<BleDevice, String> {
    if repair {
        tauri_plugin_blec::invalidate_android_service_cache(&address, true).await?;
        let _ = handler.disconnect().await;
    }
    let mut name = String::new();
    if scan {
        let (tx, mut rx) = mpsc::channel(8);
        handler
            .discover(Some(tx), 6_000, ScanFilter::None, false)
            .await
            .map_err(|e| e.to_string())?;
        let found = tokio::time::timeout(Duration::from_secs(7), async {
            while let Some(devices) = rx.recv().await {
                if cancel.load(Ordering::SeqCst) {
                    return None;
                }
                if let Some(device) = devices
                    .into_iter()
                    .find(|d| d.address.eq_ignore_ascii_case(&address))
                {
                    return Some(device);
                }
            }
            None
        })
        .await
        .ok()
        .flatten();
        let _ = handler.stop_scan().await;
        name = found
            .ok_or("Could not find the device while scanning")?
            .name;
    }
    if cancel.load(Ordering::SeqCst) {
        return Err("Connection cancelled".into());
    }
    handler
        .connect_cancellable(&address, OnDisconnectHandler::None, false, &cancel)
        .await
        .map_err(|e| e.to_string())?;
    if cancel.load(Ordering::SeqCst) {
        return Err("Connection cancelled".into());
    }
    let mut device = handler
        .connected_device()
        .await
        .map_err(|e| e.to_string())?;
    // GAP Device Name is fresh after discovery, even on direct-MAC reconnects.
    let gap = uuid::Uuid::from_u128(0x00001800_0000_1000_8000_00805f9b34fb);
    let name_uuid = uuid::Uuid::from_u128(0x00002a00_0000_1000_8000_00805f9b34fb);
    if let Ok(bytes) = handler.recv_data(name_uuid, Some(gap)).await {
        if let Ok(value) = std::str::from_utf8(&bytes) {
            name = value.trim_matches('\0').trim().to_string();
        }
    }
    if !name.is_empty() {
        device.name = name;
    }
    Ok(device)
}

#[tauri::command]
pub async fn ble_enable_adapter() -> Result<(), String> {
    tauri_plugin_blec::ensure_adapter_enabled().await
}
#[tauri::command]
pub fn ble_connection_snapshot(manager: tauri::State<'_, ConnectionManager>) -> Snapshot {
    manager.snapshot()
}
#[tauri::command]
pub async fn ble_connection_connect(
    manager: tauri::State<'_, ConnectionManager>,
    address: String,
    repair: Option<bool>,
    skip_scan: Option<bool>,
) -> Result<(), String> {
    manager
        .connect(
            address.to_uppercase(),
            repair.unwrap_or(false),
            repair.unwrap_or(false) || !skip_scan.unwrap_or(false),
        )
        .await
}
#[tauri::command]
pub async fn ble_connection_disconnect(
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<(), String> {
    manager.stop().await
}
#[tauri::command]
pub async fn ble_connection_configure(
    manager: tauri::State<'_, ConnectionManager>,
    policies: Policies,
) -> Result<(), String> {
    if policies.devices.len() > 100
        || policies.profiles.len() > 100
        || policies.name_rules.len() > 100
    {
        return Err("Connection configuration too large".into());
    }
    for p in &policies.profiles {
        for feature in &p.feature_ids {
            FeatureId::parse(feature)?;
        }
    }
    manager.policies(policies).await
}

#[cfg(test)]
mod tests {
    use super::super::connection_policy::DevicePolicy;
    use super::*;
    #[test]
    fn persisted_intent_resumes_only_for_a_remembered_enabled_device() {
        let mut saved = Saved {
            resume_address: Some("AA:BB".into()),
            policies: Policies {
                devices: vec![DevicePolicy {
                    address: "aa:bb".into(),
                    enabled: true,
                    ..Default::default()
                }],
                ..Default::default()
            },
            ..Default::default()
        };
        let bytes = serde_json::to_vec(&saved).unwrap();
        let restored: Saved = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(restored.restore_target(), Some("AA:BB".into()));
        saved.policies.devices[0].enabled = false;
        assert_eq!(saved.restore_target(), None);
        saved.policies.devices.clear();
        assert_eq!(saved.restore_target(), None);
        let mut stopped = restored;
        stopped.resume_address = None;
        let stopped: Saved =
            serde_json::from_slice(&serde_json::to_vec(&stopped).unwrap()).unwrap();
        assert_eq!(stopped.restore_target(), None);
    }
}

#[cfg(test)]
mod pause_tests {
    use super::*;
    #[test]
    fn dropping_a_dfu_guard_always_resumes_cleanup_without_claiming_activation() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        drop(DfuPause {
            tx: tx.clone(),
            activated: false,
        });
        assert!(matches!(rx.try_recv(), Ok(Command::Resume(false))));
        let mut guard = DfuPause {
            tx,
            activated: false,
        };
        guard.activation_requested();
        drop(guard);
        assert!(matches!(rx.try_recv(), Ok(Command::Resume(true))));
    }
}

fn normalize_address(address: &str) -> Result<String, String> {
    let parts: Vec<_> = address.split(':').collect();
    if parts.len() != 6
        || parts
            .iter()
            .any(|p| p.len() != 2 || u8::from_str_radix(p, 16).is_err())
    {
        return Err("Invalid Bluetooth address".into());
    }
    Ok(address.to_ascii_uppercase())
}

#[cfg(test)]
mod address_tests {
    #[test]
    fn every_connect_entry_uses_a_valid_canonical_address() {
        assert_eq!(
            super::normalize_address("c2:12:34:56:78:cc").unwrap(),
            "C2:12:34:56:78:CC"
        );
        for invalid in ["", "AA:BB", "AA:BB:CC:DD:EE:GG", "0:11:22:33:44:55"] {
            assert!(super::normalize_address(invalid).is_err());
        }
    }
}
