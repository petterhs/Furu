# Device names and firmware profile changes

A remembered device retains its BLE advertisement name in `name`. An optional
`nickname` is displayed on the home card, device page and DFU session; editing
it never affects automatic profile detection. Clearing it restores the BLE name.
Re-adding an already remembered address preserves its preferences and nickname.

On connection, built-in name detection records a known firmware family. The
previously saved BLE name seeds a baseline for existing installations before
the new advertisement name replaces it. If no known name exists, the first
observation establishes the baseline. A later
change to a different known family offers a profile suggestion when a manual
override differs from the detected family. It does not depend on who performed
the update. An unknown advertisement does not erase the baseline. Detection
currently uses the BLE name supplied by connection scanning; the direct
auto-reconnect path still uses its saved name and cannot detect a changed
firmware until a fresh name is obtained.
Editing auto-name rules alone does not change this firmware observation.

The suggestion is shown as a card throughout the app while that device is
connected, outside DFU. Accepting changes the override to the detected profile.
Keeping the current profile saves a dismissal keyed by detected family and
selected override. Reconnecting, restarting Furu, updating within the same
family, and switching away and back do not repeat an answered suggestion.
Changing the profile preference manually clears the saved answer. Auto mode
follows the configured name rules and never asks about replacing an override.

Changes to the selected profile or its feature list are serialized to the
native capability session while connected. Polling, subscriptions and time sync
then reconcile from the updated feature list. Older queued edits are skipped;
profile changes are deferred during DFU. Device profile selection is disabled
while flashing.
Capability writes hold the shared BLE/DFU exclusion through native completion
and publishing the new feature list. Connection finalization can configure its
profile under its existing connection lock; deferred edits replay when the lock
or DFU session ends. A failed save remains visible after the suggestion card
has disappeared.

This change does not yet unify InfiniTime's and Kongle's BLE addresses or migrate
existing separate entries/history. That requires the coordinated firmware/GATT
cache work; a nickname is local metadata, not a replacement hardware identifier.

Manual checks: rename a remembered device, reconnect and restart; switch a live
profile and edit its battery/notification features; change firmware family,
decline the suggestion and reconnect/restart; verify a same-family version update
does not prompt. Automatic tests cover the persistent suggestion decisions.
