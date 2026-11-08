export type ReconnectSettings = { enabled: boolean; retryDelayMs: number; maxFailures: number };
type ReconnectState = "ready" | "busy" | "connected" | "stop";
type Hooks = {
  settings: (address: string) => ReconnectSettings | undefined;
  state: (address: string) => ReconnectState;
  connect: (address: string, direct: boolean) => Promise<boolean>;
  log: (message: string) => void;
  stopped: () => void;
  schedule?: (callback: () => Promise<void>, delayMs: number) => () => void;
};

/** One reconnect target at a time. Cancellation also invalidates in-flight attempts. */
export class ReconnectCycle {
  private generation = 0;
  private cancelTimer: (() => void) | undefined;
  private failures = 0;
  private attempts = 0;
  private hooks: Hooks;

  constructor(hooks: Hooks) { this.hooks = hooks; }

  cancel(): void {
    this.generation++;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    this.failures = this.attempts = 0;
  }

  start(address: string): boolean {
    this.cancel();
    const settings = this.hooks.settings(address);
    if (!settings?.enabled) return false;
    this.schedule(address, this.generation, 5_000);
    return true;
  }

  private schedule(address: string, generation: number, delayMs: number): void {
    this.hooks.log(`BLE: auto-reconnect scheduled in ${Math.round(delayMs / 1000)} s for ${address}`);
    const schedule = this.hooks.schedule ?? ((callback, delay) => {
      const timer = setTimeout(() => { void callback(); }, delay);
      return () => clearTimeout(timer);
    });
    this.cancelTimer = schedule(() => this.run(address, generation), delayMs);
  }

  private stop(): void {
    this.cancel();
    this.hooks.stopped();
  }

  private async run(address: string, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    this.cancelTimer = undefined;
    const settings = this.hooks.settings(address);
    const state = this.hooks.state(address);
    if (!settings?.enabled || state === "stop") {
      this.hooks.log("BLE: auto-reconnect stopped (target changed or reconnect disabled)");
      this.stop();
      return;
    }
    if (state === "connected") { this.cancel(); return; }
    if (state === "busy") {
      this.schedule(address, generation, settings.retryDelayMs);
      return;
    }
    const direct = ++this.attempts % 2 === 1;
    this.hooks.log(`BLE: auto-reconnect attempt ${this.attempts} (${direct ? "direct MAC" : "scan by MAC"})`);
    let success = false;
    try { success = await this.hooks.connect(address, direct); }
    catch (error) { this.hooks.log(`BLE: auto-reconnect error: ${String(error)}`); }
    // Manual disconnect, another target, or a new cycle can supersede this await.
    if (generation !== this.generation) return;
    if (success) {
      this.hooks.log("BLE: auto-reconnect succeeded");
      this.cancel();
      return;
    }
    this.failures++;
    if (settings.maxFailures > 0 && this.failures >= settings.maxFailures) {
      this.hooks.log(`BLE: auto-reconnect stopped after ${this.failures} failures`);
      this.stop();
      return;
    }
    this.schedule(address, generation, settings.retryDelayMs);
  }
}
