import { IntegrationId, type IntegrationDefinition, type IntegrationIdValue } from "./types";

/**
 * The five providers Furu plans to support. Field sets are deliberately narrow:
 * they cover what is needed to identify a source and pick values later. None of
 * these has a backend yet, so every entry reports `planned`.
 */
export const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
  {
    id: IntegrationId.homeAssistant,
    name: "Home Assistant",
    summary: "Read indoor sensors and trigger a small set of home actions from the watch.",
    watchUsage: "Up to four action buttons and selected sensor values on the clock.",
    status: "planned",
    feedsClockFields: true,
    configFields: [
      {
        key: "baseUrl",
        label: "Server URL",
        kind: "url",
        placeholder: "http://homeassistant.local:8123",
        hint: "Furu talks to Home Assistant over your local network or a remote URL.",
        required: true,
      },
      {
        key: "token",
        label: "Long-lived access token",
        kind: "password",
        hint: "Created under your Home Assistant profile. Stored on this phone only.",
        required: true,
      },
      {
        key: "actions",
        label: "Action entities",
        kind: "list",
        placeholder: "light.kitchen",
        hint: "Up to four entities or scripts, one per line.",
      },
      {
        key: "clockSensor",
        label: "Clock sensor entity",
        kind: "text",
        placeholder: "sensor.living_room_temperature",
        hint: "Optional. Shown as one clock field when the watch supports it.",
      },
    ],
  },
  {
    id: IntegrationId.weather,
    name: "Weather",
    summary: "Current conditions and a short forecast for one location.",
    watchUsage: "Outdoor temperature as a clock field.",
    status: "planned",
    feedsClockFields: true,
    configFields: [
      {
        key: "provider",
        label: "Provider",
        kind: "select",
        options: [
          { value: "met_no", label: "MET Norway (free, no key)" },
          { value: "open_meteo", label: "Open-Meteo (free, no key)" },
        ],
        required: true,
      },
      {
        key: "location",
        label: "Location",
        kind: "text",
        placeholder: "Oslo",
        hint: "A place name or coordinates. Used for the forecast lookup.",
        required: true,
      },
      {
        key: "units",
        label: "Units",
        kind: "select",
        options: [
          { value: "metric", label: "Celsius" },
          { value: "imperial", label: "Fahrenheit" },
        ],
        required: true,
      },
    ],
  },
  {
    id: IntegrationId.stocks,
    name: "Stocks",
    summary: "Watch a short list of symbols and keep a compact quote on the watch.",
    watchUsage: "Latest price for one symbol as a clock field.",
    status: "planned",
    feedsClockFields: true,
    configFields: [
      {
        key: "symbols",
        label: "Symbols",
        kind: "list",
        placeholder: "AAPL\nEQNR.OL",
        hint: "One ticker per line. The watch shows one at a time.",
      },
      {
        key: "currency",
        label: "Display currency",
        kind: "text",
        placeholder: "NOK",
      },
      {
        key: "refreshMinutes",
        label: "Refresh interval (minutes)",
        kind: "number",
        placeholder: "15",
        hint: "Deliberately slow: quotes are a glance, not a live ticker.",
      },
    ],
  },
  {
    id: IntegrationId.calendar,
    name: "Calendar",
    summary: "Bring the next appointment to the watch from selected calendars.",
    watchUsage: "Next event title and start time as a clock field.",
    status: "planned",
    feedsClockFields: true,
    configFields: [
      {
        key: "calendars",
        label: "Calendars",
        kind: "list",
        hint: "Furu asks Android for calendar access once you connect this integration.",
      },
      {
        key: "horizonDays",
        label: "Look-ahead (days)",
        kind: "number",
        placeholder: "7",
      },
    ],
  },
  {
    id: IntegrationId.sleep,
    name: "Sleep tracking",
    summary: "Combine a sleep app's data with watch telemetry for a better sleep score.",
    watchUsage: "Sleep score as a clock field; detail stays on the phone.",
    status: "planned",
    feedsClockFields: true,
    configFields: [
      {
        key: "source",
        label: "Source app",
        kind: "select",
        options: [
          { value: "health_connect", label: "Health Connect" },
          { value: "manual", label: "Enter manually" },
        ],
        required: true,
      },
      {
        key: "scoreTarget",
        label: "Target sleep score",
        kind: "number",
        placeholder: "85",
        hint: "Used to judge whether last night was a good one.",
      },
    ],
  },
];

export function getIntegrationDefinition(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_DEFINITIONS.find((definition) => definition.id === id);
}

/** Required fields that the saved config leaves blank. */
export function missingRequiredFields(
  definition: IntegrationDefinition,
  config: Record<string, string>,
): string[] {
  return definition.configFields
    .filter((field) => field.required && !(config[field.key] ?? "").trim())
    .map((field) => field.label);
}

export function isProviderId(value: unknown): value is IntegrationIdValue {
  return typeof value === "string" && INTEGRATION_DEFINITIONS.some((d) => d.id === value);
}
