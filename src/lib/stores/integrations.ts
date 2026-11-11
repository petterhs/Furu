import { derived, get, writable } from "svelte/store";
import {
  DEFAULT_INTEGRATIONS_STATE,
  isIntegrationId,
  type IntegrationIdValue,
  type IntegrationInstance,
  type IntegrationsState,
} from "#lib/integrations/types";
import { getIntegrationDefinition, missingRequiredFields } from "#lib/integrations/registry";
import { readIntegrations, writeIntegrations } from "#lib/persistence/integrationsStore";

export const integrations = writable<IntegrationsState>(DEFAULT_INTEGRATIONS_STATE);
export const integrationsHydrated = writable(false);

/** Keeps only strings and drops unknown keys so a stale store cannot smuggle data. */
function sanitizeConfig(
  providerId: IntegrationIdValue,
  config: Record<string, unknown> | undefined,
): Record<string, string> {
  const known = new Set(getIntegrationDefinition(providerId)?.configFields.map((f) => f.key) ?? []);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (!known.has(key) || typeof value !== "string") continue;
    out[key] = value;
  }
  return out;
}

export function sanitizeIntegrations(raw: IntegrationsState | null | undefined): IntegrationsState {
  const instances: IntegrationInstance[] = [];
  const seenProviders = new Set<string>();
  for (const candidate of raw?.instances ?? []) {
    if (!candidate || !isIntegrationId(candidate.providerId)) continue;
    // One instance per provider for now; the registry has no multi-account model.
    if (seenProviders.has(candidate.providerId)) continue;
    seenProviders.add(candidate.providerId);
    instances.push({
      id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : candidate.providerId,
      providerId: candidate.providerId,
      label: typeof candidate.label === "string" ? candidate.label.trim() : "",
      enabled: candidate.enabled !== false,
      config: sanitizeConfig(candidate.providerId, candidate.config),
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    });
  }
  return { instances };
}

export async function hydrateIntegrations(): Promise<void> {
  const raw = await readIntegrations();
  const normalized = sanitizeIntegrations(raw);
  integrations.set(normalized);
  integrationsHydrated.set(true);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await writeIntegrations(normalized);
  }
}

async function persist(next: IntegrationsState): Promise<void> {
  const normalized = sanitizeIntegrations(next);
  integrations.set(normalized);
  await writeIntegrations(normalized);
}

export function getInstance(providerId: IntegrationIdValue): IntegrationInstance | undefined {
  return get(integrations).instances.find((instance) => instance.providerId === providerId);
}

/** Providers that have a saved, enabled and complete configuration. */
export function configuredProviders(state: IntegrationsState): IntegrationIdValue[] {
  return state.instances
    .filter((instance) => {
      const definition = getIntegrationDefinition(instance.providerId);
      if (!definition || !instance.enabled) return false;
      return missingRequiredFields(definition, instance.config).length === 0;
    })
    .map((instance) => instance.providerId);
}

/** Reactive view of the configured providers, for template use. */
export const configuredProviderStore = derived(integrations, configuredProviders);

/** Non-reactive read for event handlers. */
export function configuredProviderIds(): IntegrationIdValue[] {
  return configuredProviders(get(integrations));
}

export async function saveIntegration(
  providerId: IntegrationIdValue,
  config: Record<string, string>,
  label = "",
): Promise<void> {
  const now = new Date().toISOString();
  const state = get(integrations);
  const existing = state.instances.find((instance) => instance.providerId === providerId);
  const nextInstance: IntegrationInstance = {
    id: existing?.id ?? providerId,
    providerId,
    label: label.trim(),
    enabled: existing?.enabled ?? true,
    config: sanitizeConfig(providerId, config),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const others = state.instances.filter((instance) => instance.providerId !== providerId);
  await persist({ instances: [...others, nextInstance] });
}

export async function setIntegrationEnabled(
  providerId: IntegrationIdValue,
  enabled: boolean,
): Promise<void> {
  const state = get(integrations);
  await persist({
    instances: state.instances.map((instance) =>
      instance.providerId === providerId
        ? { ...instance, enabled, updatedAt: new Date().toISOString() }
        : instance,
    ),
  });
}

export async function removeIntegration(providerId: IntegrationIdValue): Promise<void> {
  const state = get(integrations);
  await persist({
    instances: state.instances.filter((instance) => instance.providerId !== providerId),
  });
}
