import fs from "fs";
import path from "path";

export interface WatchUnit {
  unit: string;
  userUnit: boolean;
  label: string;
}

export interface SentinelConfig {
  vault: { primaryPath: string };
  markdown: { enabled: boolean; extraExcludePaths: string[] };
  services: { watchUnits: WatchUnit[] };
  hardware: { showBattery: boolean };
}

const DEFAULTS: SentinelConfig = {
  vault: { primaryPath: "" },
  markdown: { enabled: true, extraExcludePaths: [] },
  services: { watchUnits: [{ unit: "docker", userUnit: false, label: "Docker daemon started" }] },
  hardware: { showBattery: true },
};

const CONFIG_PATH = path.join(process.cwd(), "sentinel.config.json");

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    if (ov !== null && typeof ov === "object" && !Array.isArray(ov) && key in base) {
      result[key] = deepMerge(base[key] as Record<string, unknown>, ov as Record<string, unknown>);
    } else {
      result[key] = ov;
    }
  }
  return result;
}

export function loadConfig(): SentinelConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return deepMerge(DEFAULTS as unknown as Record<string, unknown>, raw) as unknown as SentinelConfig;
    }
  } catch {}
  return DEFAULTS;
}

export function saveConfig(config: SentinelConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
