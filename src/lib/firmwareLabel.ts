/** Firmware identity is independent of the nickname and manually selected profile. */
export function firmwareLabel(device: { name?: string; detectedProfileId?: string }, info: {
  firmwareRevision?: string | null; softwareRevision?: string | null;
} | null): string {
  const software = info?.softwareRevision?.trim().toLowerCase() ?? "";
  const name = device.name?.toLowerCase() ?? "";
  const family = software.startsWith("kongle") ? "Kongle"
    : software.startsWith("infinitime") ? "InfiniTime"
    : device.detectedProfileId === "kongle" ? "Kongle"
    : device.detectedProfileId === "infinitime" ? "InfiniTime"
    : name.includes("kongle") ? "Kongle"
    : name.includes("infinitime") ? "InfiniTime"
    : "Firmware";
  const revision = info?.firmwareRevision?.trim().replace(/^v/i, "");
  return revision ? `${family} v${revision}` : family;
}
