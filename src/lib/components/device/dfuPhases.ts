/** Shared DFU presentation helpers used by the firmware card and the app banner. */

export const DFU_STAGING_DIR = "dfu-import";

const PHASE_LABELS: Record<string, string> = {
  selecting_package: "Choose a firmware package",
  staging: "Copying selected files into app storage",
  downloading: "Downloading and checking release package",
  starting: "Starting",
  init_packet: "Init packet",
  priming: "Priming",
  transfer: "Transferring firmware",
  validating: "Validating firmware on the watch",
  applying: "Requesting activation (watch may reboot)",
  activation_requested: "Activation requested",
};

/** Human label for a native DFU phase, falling back to the raw phase name. */
export function friendlyDfuPhase(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replaceAll("_", " ");
}
