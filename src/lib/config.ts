import fs from "fs";
import path from "path";

export interface WatchUnit {
  unit: string;
  userUnit: boolean;
  label: string;
}

export interface KnownDevices {
  byMac: Record<string, string>;
  byIp: Record<string, string>;
}

export interface SentinelConfig {
  vault: { primaryPath: string };
  markdown: { enabled: boolean; extraExcludePaths: string[] };
  services: { watchUnits: WatchUnit[] };
  /** Optional cross-link to the Pulse dashboard that shares this estate record.
   *  Empty by default and set only in the gitignored local config, because a
   *  tailnet hostname is personal and this repository is public. */
  estate: { pulseUrl: string };
  hardware: { showBattery: boolean };
  network: { knownDevices: KnownDevices };
  browserAgent: { vncUrl: string; agentScript: string };
  power: PowerConfig;
}

/** One electricity price band: kWh up to `upTo` per month (null = no ceiling). */
export interface TariffSlab { upTo: number | null; rate: number }

export interface PowerConfig {
  /** DC-in (measured) divided by this gives wall draw. The internal supply's
   *  real efficiency is unknown; 0.85 is a typical mid-load figure. Calibrate
   *  it against a metering smart plug if you have one. */
  psuEfficiency: number;
  tariff: {
    currency: string;
    /** Progressive monthly slabs. Empty = no cost shown. */
    slabs: TariffSlab[];
    /** Per-kWh surcharge added to every slab (e.g. DEWA fuel surcharge). */
    surcharge: number;
    vatPct: number;
    /** Your whole home's monthly kWh (from a bill). It decides which slab the
     *  server's extra kWh fall into. 0 = assume the first slab. */
    householdMonthlyKwh: number;
    /** Where the numbers came from, shown on hover. */
    source: string;
  };
}

const DEFAULTS: SentinelConfig = {
  vault: { primaryPath: "" },
  markdown: { enabled: true, extraExcludePaths: [] },
  services: { watchUnits: [{ unit: "docker", userUnit: false, label: "Docker daemon started" }] },
  estate: { pulseUrl: "" },
  hardware: { showBattery: true },
  network: { knownDevices: { byMac: {}, byIp: {} } },
  browserAgent: { vncUrl: "", agentScript: "" },
  power: {
    psuEfficiency: 0.85,
    tariff: { currency: "", slabs: [], surcharge: 0, vatPct: 0, householdMonthlyKwh: 0, source: "" },
  },
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
