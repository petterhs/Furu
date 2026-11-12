import { IntegrationId, type IntegrationIdValue } from "./types";

/**
 * Bounded clock-field contract.
 *
 * Kongle has a small number of clock slots and cannot render arbitrary provider
 * data. Furu therefore selects which of these known fields to fill, in order.
 * Stable IDs — do not rename; add new ones.
 */
export const ClockFieldId = {
  steps: "field.steps",
  heartRate: "field.heart_rate",
  battery: "field.battery",
  weatherTemperature: "field.weather.temperature",
  stockQuote: "field.stock.quote",
  calendarNext: "field.calendar.next",
  sleepScore: "field.sleep.score",
} as const;

export type ClockFieldIdValue = (typeof ClockFieldId)[keyof typeof ClockFieldId];

/** Where the value originates. `watch` means the firmware already has it. */
export type ClockFieldSource = "watch" | "phone" | "integration";

export type ClockFieldDefinition = {
  id: ClockFieldIdValue;
  label: string;
  /** Compact unit shown beside the value on the watch. */
  unit: string;
  source: ClockFieldSource;
  /** Integration that must be configured before this field can show data. */
  requiresIntegration?: IntegrationIdValue;
};

export const CLOCK_FIELD_DEFINITIONS: ClockFieldDefinition[] = [
  { id: ClockFieldId.steps, label: "Steps", unit: "", source: "watch" },
  { id: ClockFieldId.heartRate, label: "Heart rate", unit: "bpm", source: "watch" },
  { id: ClockFieldId.battery, label: "Battery", unit: "%", source: "watch" },
  {
    id: ClockFieldId.weatherTemperature,
    label: "Outdoor temperature",
    unit: "°",
    source: "integration",
    requiresIntegration: IntegrationId.weather,
  },
  {
    id: ClockFieldId.stockQuote,
    label: "Stock price",
    unit: "",
    source: "integration",
    requiresIntegration: IntegrationId.stocks,
  },
  {
    id: ClockFieldId.calendarNext,
    label: "Next event",
    unit: "",
    source: "integration",
    requiresIntegration: IntegrationId.calendar,
  },
  {
    id: ClockFieldId.sleepScore,
    label: "Sleep score",
    unit: "",
    source: "integration",
    requiresIntegration: IntegrationId.sleep,
  },
];

/** The watch renders a small, fixed number of fields; more would not fit. */
export const MAX_CLOCK_FIELDS = 4;

export function getClockFieldDefinition(id: string): ClockFieldDefinition | undefined {
  return CLOCK_FIELD_DEFINITIONS.find((field) => field.id === id);
}

export function isClockFieldId(value: unknown): value is ClockFieldIdValue {
  return typeof value === "string" && CLOCK_FIELD_DEFINITIONS.some((field) => field.id === value);
}

/**
 * Drops unknown and duplicate IDs and caps the list, so a hand-edited store
 * cannot push an unsupported contract at the firmware.
 */
export function sanitizeClockFields(ids: readonly string[]): ClockFieldIdValue[] {
  const seen = new Set<string>();
  const out: ClockFieldIdValue[] = [];
  for (const id of ids) {
    if (!isClockFieldId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === MAX_CLOCK_FIELDS) break;
  }
  return out;
}

/** Fields whose integration is configured and enabled, for status hints. */
export function clockFieldIsReady(
  field: ClockFieldDefinition,
  configuredProviders: readonly IntegrationIdValue[],
): boolean {
  if (field.source !== "integration") return true;
  return Boolean(field.requiresIntegration && configuredProviders.includes(field.requiresIntegration));
}
