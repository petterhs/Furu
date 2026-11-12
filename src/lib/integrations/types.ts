/**
 * Integration contracts.
 *
 * Furu owns integration credentials and network calls; the watch only ever
 * receives bounded values. See Kongle's `docs/design/watch-capabilities.md` for
 * the rationale — no arbitrary scripts, HA JSON or tokens cross BLE.
 */

export const IntegrationId = {
  homeAssistant: "home_assistant",
  weather: "weather",
  stocks: "stocks",
  calendar: "calendar",
  sleep: "sleep",
} as const;

export type IntegrationIdValue = (typeof IntegrationId)[keyof typeof IntegrationId];

/**
 * `planned` means the provider is described but has no backend yet. The UI must
 * say so rather than imply a working connection.
 */
export type IntegrationStatus = "planned" | "available";

export type ConfigFieldKind = "text" | "password" | "url" | "list" | "select" | "number";

export type ConfigField = {
  /** Stable key inside `IntegrationInstance.config`. */
  key: string;
  label: string;
  kind: ConfigFieldKind;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** Allowed values for `select`. */
  options?: { value: string; label: string }[];
};

export type IntegrationDefinition = {
  id: IntegrationIdValue;
  name: string;
  /** One sentence on what the integration adds to Furu. */
  summary: string;
  /** What it feeds to the watch, if anything. */
  watchUsage: string;
  status: IntegrationStatus;
  /** False when the integration only produces data for the phone UI. */
  feedsClockFields: boolean;
  configFields: ConfigField[];
};

export type IntegrationInstance = {
  /** Stable identifier; one instance per provider for now. */
  id: string;
  providerId: IntegrationIdValue;
  /** User-facing name, e.g. "Home". */
  label: string;
  enabled: boolean;
  config: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationsState = {
  instances: IntegrationInstance[];
};

export const DEFAULT_INTEGRATIONS_STATE: IntegrationsState = { instances: [] };

export function isIntegrationId(value: unknown): value is IntegrationIdValue {
  return typeof value === "string" && Object.values(IntegrationId).includes(value as IntegrationIdValue);
}
