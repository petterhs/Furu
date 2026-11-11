import { openStore } from "#lib/persistence/valueStore";
import type { IntegrationsState } from "#lib/integrations/types";

const STORE_FILE = "integrations.json";
const STATE_KEY = "state";

async function getStore() {
  return openStore(STORE_FILE);
}

export async function readIntegrations(): Promise<IntegrationsState | null> {
  const store = await getStore();
  return (await store.get<IntegrationsState>(STATE_KEY)) ?? null;
}

export async function writeIntegrations(state: IntegrationsState): Promise<void> {
  const store = await getStore();
  await store.set(STATE_KEY, state);
  await store.save();
}
