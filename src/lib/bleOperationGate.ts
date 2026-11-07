/** Shared exclusion for DFU, connection mutations and native profile writes. */
export class BleOperationGate {
  private dfu = false;
  private mutation = false;
  private capabilities = false;

  beginDfu(): boolean {
    if (this.dfu || this.mutation || this.capabilities) return false;
    this.dfu = true;
    return true;
  }
  endDfu(): void { this.dfu = false; }

  beginMutation(): boolean {
    if (this.dfu || this.mutation || this.capabilities) return false;
    this.mutation = true;
    return true;
  }
  endMutation(): void { this.mutation = false; }

  beginCapabilities(connectionFinalization = false): boolean {
    if (this.dfu || this.capabilities || (this.mutation && !connectionFinalization)) return false;
    this.capabilities = true;
    return true;
  }
  endCapabilities(): void { this.capabilities = false; }
}
