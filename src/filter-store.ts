import fs from "node:fs/promises";
import { httpURL } from "./core";
export interface FilterSettings {
  adblock: boolean;
  subscriptions: string[];
  updateDays: number;
}
export function normalizeFilters(config: FilterSettings): FilterSettings {
  return {
    adblock: !!config.adblock,
    subscriptions: config.subscriptions.filter(httpURL),
    updateDays: Math.max(0, Math.min(24, Number(config.updateDays) || 0)),
  };
}
export async function loadFilters(
  file: string,
  fallback: FilterSettings,
): Promise<FilterSettings> {
  try {
    return normalizeFilters(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return normalizeFilters(fallback);
  }
}
export async function atomicJSON(file: string, data: unknown) {
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(data));
  await fs.rename(temp, file);
}
