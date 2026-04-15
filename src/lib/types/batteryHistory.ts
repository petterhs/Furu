export type BatteryHistorySample = {
  at: string;
  percent: number;
};

export type BatteryHistoryByDevice = Record<string, BatteryHistorySample[]>;
