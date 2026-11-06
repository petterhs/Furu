export type BatteryHistorySample = {
  at: string;
  percent: number;
  voltageMv?: number;
  charging?: boolean;
};

export type BatteryHistoryByDevice = Record<string, BatteryHistorySample[]>;
