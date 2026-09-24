import { NextResponse } from "next/server";

// Force dynamic rendering — this route reads live system state on every request.
// Without this, Next.js 14 statically pre-renders it at build time and caches the result.
export const dynamic = "force-dynamic";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import os from "os";
import type {
  BatteryInfo,
  CpuInfo,
  DiskInfo,
  LogEntry,
  LoginEntry,
  MemoryInfo,
  NetworkInfo,
  OsInfo,
  ProcessInfo,
  SecurityInfo,
  ServicesInfo,
  ScheduledJob,
  ManagedService,
  SshSession,
  SwapInfo,
  TailscaleInfo,
  DiskIoInfo,
  SmartInfo,
  TemperatureInfo,
  ThroughputInfo,
  UpdateInfo,
  UptimePoint,
  PortInfo,
} from "@/lib/types";
import path from "path";
import fs from "fs";
import { loadConfig } from "@/lib/config";

const exec = promisify(execCb);
const PLATFORM = os.platform();

async function run(cmd: string, timeout = 5000): Promise<string> {
  try {
    const { stdout } = await exec(cmd, { timeout });
    return stdout.trim();
  } catch {
    return "";
  }
}

/* ------ CPU Usage (delta-based, total + per logical core) ------ */
let prevIdle = 0;
let prevTotal = 0;
let prevPerCore: { idle: number; total: number }[] = [];

function getCpuUsage(): { usage: number; perCore: number[] } {
  const cpus = os.cpus();
  let idle = 0,
    total = 0;
  const perCoreNow = cpus.map((c) => {
    const t = c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
    idle += c.times.idle;
    total += t;
    return { idle: c.times.idle, total: t };
  });

  const first = prevTotal === 0;
  const dIdle = idle - prevIdle;
  const dTotal = total - prevTotal;
  const usage = !first && dTotal > 0 ? Math.round(100 - (dIdle / dTotal) * 100) : 0;

  const perCore = perCoreNow.map((now, i) => {
    const prev = prevPerCore[i];
    if (!prev) return 0;
    const dt = now.total - prev.total;
    const di = now.idle - prev.idle;
    return dt > 0 ? Math.round(100 - (di / dt) * 100) : 0;
  });

  prevIdle = idle;
  prevTotal = total;
  prevPerCore = perCoreNow;
  return { usage, perCore };
}

/* ------ Physical core count (cached) ------ */
let cachedPhysicalCores: number | null = null;
async function getPhysicalCores(): Promise<number | null> {
  if (cachedPhysicalCores !== null) return cachedPhysicalCores;
  if (PLATFORM === "darwin") {
    const out = await run("sysctl -n hw.physicalcpu 2>/dev/null");
    cachedPhysicalCores = parseInt(out) || null;
  } else {
    const out = await run("grep -m1 'cpu cores' /proc/cpuinfo 2>/dev/null | awk '{print $4}'");
    cachedPhysicalCores = parseInt(out) || null;
  }
  return cachedPhysicalCores;
}

/* ------ OS Info ------ */
/* ------ Machine model ------
 * READ LIVE FROM THE MACHINE, NEVER STORED.
 * On 2026-09-19 this SSD was transplanted from a Late-2014 Mac mini (Macmini7,1,
 * i5-4260U, 8 GB) into a Mid-2011 Mac mini Server (Macmini5,3, i7-2635QM quad, 16 GB).
 * Every dashboard that held a hardcoded hardware string became wrong that afternoon and
 * nothing errored. So this resolves from /sys/class/dmi/id at request time: the answer
 * changes by itself the next time the hardware does. The map only makes the identifier
 * READABLE - an unknown identifier falls through to the raw string rather than a guess. */
const APPLE_MODEL_NAMES: Record<string, string> = {
  "Macmini4,1": "Mac mini (Mid 2010)",
  "Macmini5,1": "Mac mini (Mid 2011)",
  "Macmini5,2": "Mac mini (Mid 2011)",
  "Macmini5,3": "Mac mini (Mid 2011) Server",
  "Macmini6,1": "Mac mini (Late 2012)",
  "Macmini6,2": "Mac mini (Late 2012) Server",
  "Macmini7,1": "Mac mini (Late 2014)",
  "Macmini8,1": "Mac mini (2018)",
  "Macmini9,1": "Mac mini (M1, 2020)",
};

async function getMachine(): Promise<{ machine?: string; machineId?: string }> {
  if (PLATFORM === "darwin") {
    const id = (await run("sysctl -n hw.model 2>/dev/null")).trim();
    return id ? { machineId: id, machine: APPLE_MODEL_NAMES[id] || id } : {};
  }
  const id = (await run("cat /sys/class/dmi/id/product_name 2>/dev/null")).trim();
  const vendor = (await run("cat /sys/class/dmi/id/sys_vendor 2>/dev/null")).trim();
  if (!id) return {};
  const friendly = APPLE_MODEL_NAMES[id];
  if (friendly) return { machineId: id, machine: friendly };
  // Unknown identifier: show what the machine actually says, prefixed by its vendor.
  return { machineId: id, machine: vendor && !id.startsWith(vendor) ? `${vendor} ${id}` : id };
}

async function getOsInfo(): Promise<OsInfo> {
  const hw = await getMachine();
  if (PLATFORM === "darwin") {
    const out = await run("sw_vers");
    return {
      name: out.match(/ProductName:\s*(.+)/)?.[1]?.trim() || "macOS",
      version: out.match(/ProductVersion:\s*(.+)/)?.[1]?.trim() || os.release(),
      arch: os.arch(),
      platform: PLATFORM,
      ...hw,
    };
  }
  const out = await run("cat /etc/os-release 2>/dev/null");
  return {
    name: out.match(/PRETTY_NAME="(.+)"/)?.[1] || "Linux",
    version: out.match(/VERSION_ID="(.+)"/)?.[1] || os.release(),
    arch: os.arch(),
    platform: PLATFORM,
    ...hw,
  };
}

/* ------ Memory ------ */
async function getMemoryInfo(): Promise<MemoryInfo> {
  const total = os.totalmem();
  if (PLATFORM === "darwin") {
    // macOS: os.freemem() excludes cache/inactive. Use vm_stat for accuracy.
    const vm = await run("vm_stat");
    const ps = parseInt(vm.match(/page size of (\d+)/)?.[1] || "16384");
    const pg = (k: string) => {
      const m = vm.match(new RegExp(`${k}:\\s+(\\d+)`));
      return m ? parseInt(m[1]) * ps : 0;
    };
    const active = pg("Pages active");
    const wired = pg("Pages wired down");
    const used = active + wired;
    const free = total - used;
    return { total, used, free, usage: Math.round((used / total) * 100) };
  }
  const free = os.freemem();
  const used = total - free;
  return { total, used, free, usage: Math.round((used / total) * 100) };
}

/* ------ Disk ------ */
async function getDiskInfo(): Promise<DiskInfo> {
  const df = await run("df -h /");
  const line = df.split("\n")[1];
  if (!line) return { total: "0", used: "0", free: "0", usage: 0, mountpoint: "/" };
  const p = line.split(/\s+/);
  if (PLATFORM === "darwin") {
    return { total: p[1], used: p[2], free: p[3], usage: parseInt(p[4]) || 0, mountpoint: p[8] || "/" };
  }
  return { total: p[1], used: p[2], free: p[3], usage: parseInt(p[4]) || 0, mountpoint: p[5] || "/" };
}

/* ------ Battery ------ */
async function getBatteryInfo(): Promise<BatteryInfo> {
  const empty: BatteryInfo = {
    present: false,
    level: 0, charging: false, powerSource: "AC Power", health: 0,
    cycleCount: 0, designCapacity: 0, maxCapacity: 0, currentCapacity: 0,
    temperature: null, timeRemaining: null,
  };

  if (PLATFORM === "darwin") {
    const io = await run("ioreg -rc AppleSmartBattery");
    if (!io) return empty;

    const int = (k: string) => {
      const m = io.match(new RegExp(`"${k}"\\s*=\\s*(\\d+)`));
      return m ? parseInt(m[1]) : 0;
    };
    const bool = (k: string) => {
      const m = io.match(new RegExp(`"${k}"\\s*=\\s*(Yes|No)`));
      return m ? m[1] === "Yes" : false;
    };

    const cur = int("CurrentCapacity");
    const max = int("MaxCapacity");
    const design = int("DesignCapacity");
    const rawCur = int("AppleRawCurrentCapacity");
    const rawMax = int("AppleRawMaxCapacity");
    const cycles = int("CycleCount");
    const charging = bool("IsCharging");
    const temp = int("Temperature");

    // On newer macOS, MaxCapacity=100 (percentage). Use raw values for mAh.
    const actualMaxMah = rawMax > 0 ? rawMax : max;
    const actualCurMah = rawCur > 0 ? rawCur : cur;
    const level = max <= 100 ? cur : Math.round((cur / max) * 100);
    const health = design > 0 ? Math.round((actualMaxMah / design) * 100) : 100;

    const pmset = await run("pmset -g batt");
    const powerSrc = pmset.includes("AC Power") ? "AC Power" : "Battery";
    const trMatch = pmset.match(/(\d+:\d+) remaining/);

    if (design === 0 && actualMaxMah === 0) return empty;
    return {
      present: true,
      level,
      charging,
      powerSource: powerSrc,
      health,
      cycleCount: cycles,
      designCapacity: design,
      maxCapacity: actualMaxMah,
      currentCapacity: actualCurMah,
      temperature: temp > 0 ? Math.round(temp / 100 * 10) / 10 : null,
      timeRemaining: trMatch ? trMatch[1] : null,
    };
  }

  // Linux fallback — auto-discover BAT slot (BAT0, BAT1, etc.)
  const batSlotRaw = await run("ls /sys/class/power_supply/ 2>/dev/null | grep -m1 '^BAT'");
  if (!batSlotRaw) return empty; // no battery device — AC-only machine (e.g. Mac mini)
  const batSlot = batSlotRaw;
  const batBase = `/sys/class/power_supply/${batSlot}`;
  const cap = await run(`cat ${batBase}/capacity 2>/dev/null`);
  const status = await run(`cat ${batBase}/status 2>/dev/null`);
  // Prefer charge_full/charge_full_design (μAh) — used on Apple hardware under Linux.
  // Fall back to energy_full/energy_full_design (μWh) for standard ACPI batteries.
  const chargeFull = await run(`cat ${batBase}/charge_full 2>/dev/null`);
  const chargeDesign = await run(`cat ${batBase}/charge_full_design 2>/dev/null`);
  const chargeNow = await run(`cat ${batBase}/charge_now 2>/dev/null`);
  const eFull = await run(`cat ${batBase}/energy_full 2>/dev/null`);
  const eDesign = await run(`cat ${batBase}/energy_full_design 2>/dev/null`);
  const cyc = await run(`cat ${batBase}/cycle_count 2>/dev/null`);
  const batTempRaw = await run(`cat ${batBase}/temp 2>/dev/null`);
  const ef = parseInt(chargeFull) || parseInt(eFull) || 0;
  const ed = parseInt(chargeDesign) || parseInt(eDesign) || 0;
  const ec = parseInt(chargeNow) || 0;
  const batTemp = batTempRaw ? Math.round(parseInt(batTempRaw) / 10 * 10) / 10 : null;
  // Calculate level against actual worn capacity (charge_full), not design capacity.
  // The kernel's /capacity file uses design capacity and understates real charge level.
  // When status is Full, charge_now never quite reaches charge_full (charger terminates
  // early to protect the battery), so we honour the Full status and show 100%.
  const isFull = /^Full$/i.test(status);
  const lvl = isFull ? 100 : (ec > 0 && ef > 0 ? Math.min(100, Math.round((ec / ef) * 100)) : parseInt(cap) || 0);
  return {
    present: true,
    level: lvl,
    charging: /^Charging$/i.test(status),
    powerSource: /Charging|Full/i.test(status) ? "AC Power" : "Battery",
    health: ed > 0 ? Math.round((ef / ed) * 100) : 0,
    cycleCount: parseInt(cyc) || 0,
    designCapacity: ed,
    maxCapacity: ef,
    currentCapacity: ec || Math.round((lvl * ef) / 100),
    temperature: batTemp,
    timeRemaining: null,
  };
}

/* ------ Temperature / Thermals ------ */
// RAPL package-power delta state
let prevRaplEnergy = 0;
let prevRaplTime = 0;

async function getCpuPowerW(): Promise<number | null> {
  // Preferred source: the root power sampler (collectors/power-sampler.py).
  // Since the CVE-2020-8694 fix the RAPL counter is root-only, so the direct
  // read below returns nothing for this user and the tile sat blank.
  try {
    const n = JSON.parse(fs.readFileSync("/run/node-power/now.json", "utf8"));
    if (n.available && n.cpu_w != null && Date.now() / 1000 - n.ts < 15) return Math.round(n.cpu_w * 10) / 10;
  } catch { /* sampler not installed: fall through to a direct read */ }
  const raw = await run("cat /sys/class/powercap/intel-rapl:0/energy_uj 2>/dev/null");
  if (!raw) return null;
  const energy = parseInt(raw);
  const now = Date.now();
  let watts: number | null = null;
  if (prevRaplTime > 0 && energy > prevRaplEnergy) {
    const dt = (now - prevRaplTime) / 1000;
    if (dt > 0) watts = Math.round(((energy - prevRaplEnergy) / 1_000_000 / dt) * 10) / 10;
  }
  prevRaplEnergy = energy;
  prevRaplTime = now;
  return watts;
}

/* ------ Thermal throttling ------
 * Preferred: the power sampler's copy of the CPU's live status bits
 * (IA32_THERM_STATUS / PACKAGE_THERM_STATUS bit 0 = throttling now, bit 10 =
 * power-limited now), which need root. Fallback: the kernel's world-readable
 * throttle event counter, read as "throttling" if it moved since the last
 * poll. Either way the since-boot counters ride along for context. */
let prevThrottleCount: number | null = null;
let lastThrottleMoveAt = 0;

async function getThrottling(): Promise<{ state: TemperatureInfo["throttling"]; throttleAt: number | null }> {
  const dir = "/sys/devices/system/cpu/cpu0/thermal_throttle";
  const num = (f: string) => { try { return parseInt(fs.readFileSync(`${dir}/${f}`, "utf8")); } catch { return null; } };
  const events = num("package_throttle_count");
  const totalMs = num("package_throttle_total_time_ms");
  if (events != null) {
    if (prevThrottleCount != null && events > prevThrottleCount) lastThrottleMoveAt = Date.now();
    prevThrottleCount = events;
  }
  try {
    const n = JSON.parse(fs.readFileSync("/run/node-power/now.json", "utf8"));
    const t = n.throttle;
    if (t && Date.now() / 1000 - n.ts < 15) {
      return {
        state: {
          // either the CPU's own heat limit or the board forcing a slow-down
          active: !!t.thermal || !!t.board,
          cause: t.thermal && t.board ? "both" : t.thermal ? "heat" : t.board ? "board" : null,
          powerLimit: !!t.power_limit, source: "msr", events, totalMs,
        },
        throttleAt: t.tjmax != null ? t.tjmax - (t.tcc_offset ?? 0) : null,
      };
    }
  } catch { /* no sampler: fall back to the counter */ }
  if (events == null) return { state: { active: null, powerLimit: null, source: "none", events: null, totalMs: null }, throttleAt: null };
  return {
    state: { active: Date.now() - lastThrottleMoveAt < 20_000, powerLimit: null, source: "counters", events, totalMs },
    throttleAt: null,
  };
}

const tempLabelFor = (c: number) =>
  c < 50 ? "Cool" : c < 65 ? "Normal" : c < 80 ? "Warm" : c < 95 ? "Hot" : "Critical";

async function getTemperature(): Promise<TemperatureInfo> {
  const base: TemperatureInfo = {
    cpu: null, label: "Unavailable", cores: [],
    throttleAt: null, warnAt: null, fanRpm: null, fanMin: null, fanMax: null, cpuPowerW: null,
    throttling: { active: null, powerLimit: null, source: "none", events: null, totalMs: null },
  };

  if (PLATFORM === "darwin") {
    const raw = await run("osx-cpu-temp 2>/dev/null");
    if (raw) {
      const m = raw.match(/([\d.]+)/);
      if (m) { const c = parseFloat(m[1]); return { ...base, cpu: c, label: tempLabelFor(c) }; }
    }
    const io = await run("ioreg -rc AppleSmartBattery");
    const tm = io.match(/"Temperature"\s*=\s*(\d+)/);
    if (tm) { const c = parseInt(tm[1]) / 100; return { ...base, cpu: Math.round(c * 10) / 10, label: tempLabelFor(c) }; }
    return base;
  }

  // Linux: one `sensors -j` call covers coretemp (package + cores) and applesmc (fan)
  const sensorsJson = await run("sensors -j 2>/dev/null");
  if (sensorsJson) {
    try {
      const data = JSON.parse(sensorsJson);
      const out: TemperatureInfo = { ...base, cpuPowerW: await getCpuPowerW() };

      const coretemp = data["coretemp-isa-0000"] || {};
      for (const [key, val] of Object.entries<Record<string, number>>(coretemp)) {
        if (typeof val !== "object" || val === null) continue;
        const input = Object.entries(val).find(([k]) => /_input$/.test(k))?.[1];
        if (input === undefined) continue;
        if (/^Package/i.test(key)) {
          out.cpu = input;
          const crit = Object.entries(val).find(([k]) => /_crit$/.test(k))?.[1];
          const max = Object.entries(val).find(([k]) => /_max$/.test(k))?.[1];
          // crit is TjMax, where the hardware actually throttles; max is a
          // warning line 14 degrees below it. This used to report max as the
          // throttle point, so a 90 degree CPU read "0 below limit" while the
          // CPU's own status bits said it was not throttling at all.
          out.warnAt = max ?? null;
          out.throttleAt = crit ?? null;
        } else if (/^Core/i.test(key)) {
          out.cores.push({ name: key.trim(), temp: input });
        }
      }

      // Fan from applesmc (Mac hardware) or any hwmon exposing fanN_input
      for (const chip of Object.values<Record<string, Record<string, number>>>(data)) {
        if (typeof chip !== "object" || chip === null) continue;
        for (const sensor of Object.values(chip)) {
          if (typeof sensor !== "object" || sensor === null) continue;
          for (const [k, v] of Object.entries(sensor)) {
            if (/^fan\d+_input$/.test(k) && out.fanRpm === null) {
              out.fanRpm = Math.round(v as number);
              out.fanMin = (sensor as Record<string, number>)[k.replace("_input", "_min")] ?? null;
              out.fanMax = (sensor as Record<string, number>)[k.replace("_input", "_max")] ?? null;
            }
          }
        }
      }

      if (out.cpu !== null) {
        out.label = tempLabelFor(out.cpu);
        const t = await getThrottling();
        out.throttling = t.state;
        if (t.throttleAt != null) out.throttleAt = t.throttleAt;
        return out;
      }
    } catch { /* fall through to thermal_zone */ }
  }

  // Fallback: thermal_zone1 is CPU on this machine (zone0 is battery/ACPI)
  const zone1 = await run("cat /sys/class/thermal/thermal_zone1/temp 2>/dev/null");
  if (zone1) { const c = parseInt(zone1) / 1000; return { ...base, cpu: c, label: tempLabelFor(c) }; }
  const zone0 = await run("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null");
  if (zone0) { const c = parseInt(zone0) / 1000; return { ...base, cpu: c, label: tempLabelFor(c) }; }
  return base;
}

/* ------ Tailscale (cached 30s) ------ */
let cachedTailscale: TailscaleInfo | null = null;
let tailscaleTimestamp = 0;
const TAILSCALE_TTL = 30_000;

async function getTailscaleInfo(): Promise<TailscaleInfo> {
  if (cachedTailscale && Date.now() - tailscaleTimestamp < TAILSCALE_TTL) {
    return cachedTailscale;
  }
  const empty: TailscaleInfo = {
    installed: false, state: "Not installed", online: false,
    hostName: "", dnsName: "", relay: "", peersOnline: 0, peersTotal: 0, healthWarnings: [],
  };
  const raw = await run("tailscale status --json 2>/dev/null", 8000);
  if (!raw) return empty;
  try {
    const st = JSON.parse(raw);
    const peers = Object.values<{ Online?: boolean }>(st.Peer || {});
    const info: TailscaleInfo = {
      installed: true,
      state: st.BackendState || "Unknown",
      online: !!st.Self?.Online,
      hostName: st.Self?.HostName || "",
      dnsName: (st.Self?.DNSName || "").replace(/\.$/, ""),
      relay: st.Self?.Relay || "",
      peersOnline: peers.filter((p) => p.Online).length,
      peersTotal: peers.length,
      healthWarnings: Array.isArray(st.Health) ? st.Health : [],
    };
    cachedTailscale = info;
    tailscaleTimestamp = Date.now();
    return info;
  } catch {
    return empty;
  }
}

/* ------ Disk I/O (delta-based) ------ */
let prevDiskRead = 0;
let prevDiskWrite = 0;
let prevDiskTime = 0;
let primaryDisk = "";

async function getDiskIo(): Promise<DiskIoInfo> {
  if (PLATFORM === "darwin") return { readRate: 0, writeRate: 0, device: "" };
  if (!primaryDisk) {
    // Root filesystem's backing device, stripped of partition suffix
    const dev = await run("lsblk -no PKNAME $(findmnt -no SOURCE /) 2>/dev/null | head -1");
    primaryDisk = dev || "sda";
  }
  const line = await run(`grep -E " ${primaryDisk} " /proc/diskstats 2>/dev/null`);
  const p = line.trim().split(/\s+/);
  // Fields: ... [5]=sectors read ... [9]=sectors written (512-byte sectors)
  const readBytes = (parseInt(p[5]) || 0) * 512;
  const writeBytes = (parseInt(p[9]) || 0) * 512;
  const now = Date.now();
  const dt = prevDiskTime > 0 ? (now - prevDiskTime) / 1000 : 0;
  const readRate = dt > 0 && prevDiskRead > 0 ? Math.max(0, (readBytes - prevDiskRead) / dt) : 0;
  const writeRate = dt > 0 && prevDiskWrite > 0 ? Math.max(0, (writeBytes - prevDiskWrite) / dt) : 0;
  prevDiskRead = readBytes;
  prevDiskWrite = writeBytes;
  prevDiskTime = now;
  return { readRate: Math.round(readRate), writeRate: Math.round(writeRate), device: primaryDisk };
}

/* ------ SMART (cached 10 min) ------ */
let cachedSmart: SmartInfo | null = null;
let smartTimestamp = 0;
const SMART_TTL = 600_000;

async function getSmartInfo(): Promise<SmartInfo> {
  if (cachedSmart && Date.now() - smartTimestamp < SMART_TTL) return cachedSmart;
  const empty: SmartInfo = {
    available: false, healthy: null, model: "", temperature: null, powerOnHours: null, wearPct: null,
  };
  if (PLATFORM === "darwin") return empty;
  const dev = primaryDisk || "sda";
  const raw = await run(`sudo -n smartctl -j -H -A -i /dev/${dev} 2>/dev/null`, 8000);
  if (!raw) { cachedSmart = empty; smartTimestamp = Date.now(); return empty; }
  try {
    const s = JSON.parse(raw);
    const attrs: { id: number; name: string; raw?: { value: number }; value?: number }[] =
      s.ata_smart_attributes?.table || [];
    const attr = (id: number) => attrs.find((a) => a.id === id);
    // 173/177/231/233 are common SSD wear indicators depending on vendor.
    // Normalized value counts down from 100; anything outside 0-100 means the
    // vendor uses a different scale — report null rather than a wrong number.
    const wearAttr = attr(173) || attr(177) || attr(231) || attr(233);
    const wearRaw = wearAttr?.value !== undefined ? 100 - wearAttr.value : null;
    const info: SmartInfo = {
      available: true,
      healthy: s.smart_status?.passed ?? null,
      model: s.model_name || "",
      temperature: s.temperature?.current ?? null,
      powerOnHours: s.power_on_time?.hours ?? null,
      wearPct: wearRaw !== null && wearRaw >= 0 && wearRaw <= 100 ? wearRaw : null,
    };
    cachedSmart = info;
    smartTimestamp = Date.now();
    return info;
  } catch {
    cachedSmart = empty;
    smartTimestamp = Date.now();
    return empty;
  }
}

/* ------ Network ------ */
let cachedExternalIp = "";
let externalIpTimestamp = 0;
const EXTERNAL_IP_TTL = 300_000; // 5 min cache

async function getExternalIp(): Promise<string> {
  if (cachedExternalIp && Date.now() - externalIpTimestamp < EXTERNAL_IP_TTL) {
    return cachedExternalIp;
  }
  const ip = await run("curl -s --connect-timeout 3 --max-time 5 https://api.ipify.org 2>/dev/null");
  if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    cachedExternalIp = ip;
    externalIpTimestamp = Date.now();
    return ip;
  }
  return cachedExternalIp || "Unavailable";
}

async function getGateway(): Promise<string> {
  if (PLATFORM === "darwin") {
    const out = await run("netstat -rn | grep '^default' | head -1 | awk '{print $2}'");
    return out || "Unknown";
  }
  const out = await run("ip route | grep '^default' | awk '{print $3}' | head -1");
  return out || "Unknown";
}

async function getDnsServers(): Promise<string[]> {
  if (PLATFORM === "darwin") {
    const out = await run("scutil --dns | grep 'nameserver\\[' | awk '{print $3}' | sort -u");
    return out ? out.split("\n").filter(Boolean) : [];
  }
  const out = await run("grep '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}'");
  return out ? out.split("\n").filter(Boolean) : [];
}

async function getNetworkManager(): Promise<string> {
  if (PLATFORM === "darwin") return "macOS Built-in";
  const nm = await run("systemctl is-active NetworkManager 2>/dev/null");
  if (nm === "active") return "NetworkManager";
  const sd = await run("systemctl is-active systemd-networkd 2>/dev/null");
  if (sd === "active") return "systemd-networkd";
  const net = await run("systemctl is-active networking 2>/dev/null");
  if (net === "active") return "ifupdown";
  return "Unknown";
}

async function getNetworkInfo(): Promise<NetworkInfo> {
  let lanIp = "Unknown";
  let tailscaleIp = "Unknown";
  const interfaces: NetworkInfo["interfaces"] = [];

  // Virtual/container interface prefixes to skip when selecting LAN IP.
  // Covers: Docker (docker*, br-*), Linux bridges (br-*), veth pairs,
  // libvirt (virbr*), LXC/LXD (lxc*, lxd*), VirtualBox (vboxnet*),
  // VMware (vmnet*), VPN tunnels (tun*, tap*), WireGuard (wg*).
  const VIRTUAL_IFACE = /^(docker|br-|veth|virbr|lxc|lxd|vboxnet|vmnet|tun|tap|wg)/;

  const nets = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== "IPv4" || a.internal) continue;
      interfaces.push({ name, ip: a.address, mac: a.mac || "", status: "up" });
      // Only consider physical/real interfaces for LAN IP
      if (!VIRTUAL_IFACE.test(name) && lanIp === "Unknown" &&
          /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) {
        lanIp = a.address;
      }
      if (a.address.startsWith("100.")) tailscaleIp = a.address;
    }
  }

  if (tailscaleIp === "Unknown") {
    const ts = await run("tailscale ip -4 2>/dev/null");
    if (ts) tailscaleIp = ts.split("\n")[0];
  }

  const [externalIp, gateway, dnsServers, networkManager] = await Promise.all([
    getExternalIp(),
    getGateway(),
    getDnsServers(),
    getNetworkManager(),
  ]);

  // Listening ports
  const ports: NetworkInfo["listeningPorts"] = [];
  const seen = new Set<number>();

  /** Classify a bind address by who can reach it. See PortExposure in types.ts.
   *  `tailscaleIp` is read from the live interface above, so this follows the
   *  machine rather than a hard-coded address that would rot on a re-key. */
  const classify = (addr: string): PortInfo["exposure"] => {
    const a = (addr || "").replace(/[[\]]/g, "").split("%")[0].trim();
    if (a === "::1" || a.startsWith("127.")) return "loopback";
    if (tailscaleIp && a === tailscaleIp) return "tailnet";
    // Tailscale's own IPv6 range. Bare-prefix match, because the suffix is
    // per-node and changes when the node is re-keyed.
    if (a.toLowerCase().startsWith("fd7a:115c:a1e0")) return "tailnet";
    return "exposed";
  };

  if (PLATFORM === "darwin") {
    const lsof = await run("lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null");
    for (const line of lsof.split("\n").slice(1)) {
      const p = line.split(/\s+/);
      if (p.length < 9) continue;
      const pm = p[8]?.match(/:(\d+)$/);
      if (pm && !seen.has(parseInt(pm[1]))) {
        seen.add(parseInt(pm[1]));
        ports.push({
          port: parseInt(pm[1]),
          protocol: "TCP",
          process: p[0],
          pid: p[1],
          address: p[8].replace(`:${pm[1]}`, ""),
          exposure: classify(p[8].replace(`:${pm[1]}`, "")),
        });
      }
    }
  } else {
    const ss = await run("ss -tlnp 2>/dev/null");
    for (const line of ss.split("\n").slice(1)) {
      const p = line.split(/\s+/);
      if (p.length < 5) continue;
      const pm = p[3]?.match(/:(\d+)$/);
      const proc = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
      if (pm && !seen.has(parseInt(pm[1]))) {
        seen.add(parseInt(pm[1]));
        ports.push({
          port: parseInt(pm[1]),
          protocol: "TCP",
          process: proc?.[1] || "unknown",
          pid: proc?.[2] || "",
          address: p[3].replace(`:${pm[1]}`, ""),
          exposure: classify(p[3].replace(`:${pm[1]}`, "")),
        });
      }
    }
  }

  return {
    lanIp, tailscaleIp, externalIp, gateway, dnsServers, networkManager, interfaces, listeningPorts: ports,
    throughput: { rxBytes: 0, txBytes: 0, rxRate: 0, txRate: 0, interface: "" },
  };
}

/* ------ Security ------ */
async function getSecurityInfo(exposedPorts: PortInfo[], totalPorts: number): Promise<SecurityInfo> {
  // openPortsCount is the EXPOSED count — loopback and tailnet sockets are not
  // attack surface for a machine on a default-deny firewall, and counting them
  // made this warning permanent and therefore invisible.
  const openPortsCount = exposedPorts.length;
  let firewallEnabled = false;
  let firewallTool = "None";

  if (PLATFORM === "darwin") {
    const fw = await run("/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null");
    firewallEnabled = fw.includes("enabled");
    firewallTool = "Application Firewall";
  } else {
    // Detection order: UFW → firewalld → nftables → iptables
    // ufw status requires root; read ufw.conf (world-readable, has ENABLED=yes/no)
    const ufwConf = await run("cat /etc/ufw/ufw.conf 2>/dev/null");
    const fwd = await run("systemctl is-active firewalld 2>/dev/null");
    const nft = await run("systemctl is-active nftables 2>/dev/null");
    if (/^ENABLED=yes/im.test(ufwConf)) {
      firewallEnabled = true; firewallTool = "UFW";
    } else if (fwd === "active") {
      firewallEnabled = true; firewallTool = "firewalld";
    } else if (nft === "active") {
      firewallEnabled = true; firewallTool = "nftables";
    } else {
      const ipt = await run("iptables -L -n 2>/dev/null | head -5");
      if (ipt && !ipt.includes("policy ACCEPT")) { firewallEnabled = true; firewallTool = "iptables"; }
    }
  }

  // Read main sshd_config plus all drop-in files (drop-ins take precedence — later files win)
  const sshMain = await run("cat /etc/ssh/sshd_config 2>/dev/null");
  const sshDropins = await run("cat /etc/ssh/sshd_config.d/*.conf 2>/dev/null || sudo cat /etc/ssh/sshd_config.d/*.conf 2>/dev/null");
  // Combine: main first, drop-ins appended (later lines override earlier ones in sshd)
  const ssh = [sshMain, sshDropins].filter(Boolean).join("\n");
  // For each directive, find the LAST occurrence (drop-ins override main config)
  function lastDirectiveValue(text: string, directive: string): string | null {
    const re = new RegExp(`^[ \\t]*${directive}[ \\t]+(\\S+)`, "gim");
    let last: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) last = m[1];
    return last;
  }
  const pwAuthVal = lastDirectiveValue(ssh, "PasswordAuthentication");
  const rootLoginVal = lastDirectiveValue(ssh, "PermitRootLogin");
  const sshKeyOnly = pwAuthVal !== null ? /^no$/i.test(pwAuthVal) : null;
  const rootDisabled = rootLoginVal !== null ? /^no$/i.test(rootLoginVal) : null;

  let autoUpdates: boolean | null = null;
  if (PLATFORM === "darwin") {
    const au = await run("defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled 2>/dev/null");
    autoUpdates = au === "1";
  } else {
    const apt = await run("cat /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null");
    autoUpdates = apt ? apt.includes('"1"') : null;
  }

  const toolDefs = [
    { name: "Fail2Ban", cmd: "which fail2ban-server 2>/dev/null", description: "Brute-force protection" },
{ name: "rkhunter", cmd: "which rkhunter 2>/dev/null", description: "Rootkit detection" },
    { name: "Lynis", cmd: "which lynis 2>/dev/null", description: "Security auditing" },
    { name: "OpenSSH", cmd: "which sshd 2>/dev/null", description: "Secure shell server" },
    { name: "GnuPG", cmd: "which gpg 2>/dev/null", description: "Encryption toolkit" },
  ];

  const tools = [
    { name: "Firewall", installed: firewallEnabled, description: "Network firewall" },
    ...(await Promise.all(
      toolDefs.map(async (t) => ({
        name: t.name,
        installed: (await run(t.cmd)) !== "",
        description: t.description,
      }))
    )),
  ];

  let score = 30;
  if (firewallEnabled) score += 20;
  if (sshKeyOnly) score += 15;
  if (rootDisabled) score += 10;
  if (autoUpdates) score += 10;
  for (const t of tools) if (t.installed && t.name !== "Firewall") score += 3;
  score = Math.min(score, 100);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  const warnings: string[] = [];
  if (!firewallEnabled) warnings.push("Firewall is disabled — enable it to restrict inbound connections");
  if (sshKeyOnly === false) warnings.push("SSH allows password login — switch to key-only authentication");
  if (rootDisabled === false) warnings.push("SSH permits root login — disable PermitRootLogin");
  if (!autoUpdates) warnings.push("Automatic security updates are not enabled");
  // Only reachable ports earn a warning, and it names them so the next step is
  // obvious. The bare count said "review and close unnecessary ones" about 38
  // sockets that were almost all loopback — advice with nothing actionable in it.
  if (openPortsCount > 3) {
    const named = exposedPorts
      .slice(0, 6)
      .map((p) => `${p.port} (${p.process})`)
      .join(", ");
    warnings.push(
      `${openPortsCount} of ${totalPorts} listening ports are reachable beyond loopback and the tailnet: ${named}` +
        (openPortsCount > 6 ? ", and others" : "") +
        ". Review whether each still needs to be."
    );
  }

  return {
    firewallEnabled,
    firewallTool,
    sshKeyOnly,
    rootLoginDisabled: rootDisabled,
    autoUpdates,
    tools,
    openPortsCount,
    score,
    grade,
    warnings,
  };
}

/* ------ Services ------ */
async function getServicesInfo(): Promise<ServicesInfo> {
  const dkOut = await run("docker ps -a --format '{{json .}}' 2>/dev/null");
  const docker = dkOut
    ? dkOut
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            const c = JSON.parse(line);
            return {
              id: (c.ID || "").slice(0, 12),
              name: c.Names || "",
              image: c.Image || "",
              status: c.Status || "",
              state: ((c.State || "unknown") as string).toLowerCase() as "running" | "exited" | "paused" | "created",
              ports: c.Ports || "",
              uptime: c.RunningFor || "",
            };
          } catch { return null; }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  const cronOut = await run("crontab -l 2>/dev/null");
  const cronJobs = cronOut
    ? cronOut
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("#"))
        .map((l) => {
          const parts = l.trim().split(/\s+/);
          const schedule = parts.slice(0, 5).join(" ");
          const command = parts.slice(5).join(" ");
          return { schedule, command, description: command.split("/").pop() || command };
        })
    : [];

  // The fixed five-unit probe that used to live here (sshd/dockerd/tailscaled/
  // node/python3) was removed: it was a guess, nothing renders it any more, and
  // it spawned up to ten `systemctl`/`pgrep` subprocesses on every 10-second
  // poll. getManagedServices() below discovers the real units in two calls.

  // Discovery of the real schedule and the real service list. Both legs are
  // independent: a failure in one must not blank the other, and neither may
  // report an empty list as if it were a confident "nothing is here".
  const [scheduled, managed] = await Promise.all([
    getScheduledJobs(cronJobs),
    getManagedServices(),
  ]);

  return {
    docker,
    cronJobs,
    scheduled: scheduled.jobs,
    managed: managed.services,
    discoveryError: scheduled.error ?? managed.error ?? null,
  };
}

/* ------ Scheduled jobs: crontab AND systemd timers ------
 *
 * Why both: this box schedules the overwhelming majority of its work through
 * systemd timers, with only a handful of crontab lines. A page that reads
 * `crontab -l` alone shows a near-empty schedule and reads as authoritative,
 * which is worse than showing nothing.
 *
 * Why `systemctl show` and not `list-timers`: `list-timers` prints a
 * column-aligned human table whose widths shift with content, so any parser for
 * it is one long unit name away from breaking. `show` emits blank-line-separated
 * key=value blocks — a stable machine interface.
 *
 * systemctl renders timestamps in the CALLER's zone, so SENTINEL_TZ is exported
 * to the child when it is set. Left unset, the child inherits the machine's own
 * zone, which is what a box reporting on itself should use.
 */

const TZ_ENV = process.env.SENTINEL_TZ ? `TZ=${process.env.SENTINEL_TZ}` : "";

/** systemd prints "Fri 2026-08-21 19:10:05 +04". Rebuild it as an ISO string
 *  (the one format the JS Date parser is actually specified to handle) and
 *  return the epoch — an instant, so no timezone travels with it.
 *  Returns null for "n/a", "infinity", and anything unrecognised. */
function parseSystemdStamp(raw: string): number | null {
  const v = (raw || "").trim();
  if (!v || v === "n/a" || v === "infinity" || v === "-") return null;
  const m = v.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s*([+-]\d{2}):?(\d{2})?)?/);
  if (!m) return null;
  const [, date, time, offHour, offMin] = m;
  // systemd always emits an offset; if one is ever absent the string parses
  // as local time, which is what a machine reporting on itself means.
  const offset = offHour ? `${offHour}:${offMin ?? "00"}` : "";
  const t = Date.parse(`${date}T${time}${offset}`);
  return Number.isFinite(t) ? t : null;
}

/** systemd expresses a monotonic elapse as a duration since boot, spelled as a
 *  human string: "1w 4d 16h 34min 1.382924s". Timers declared with OnBootSec or
 *  OnUnitActiveSec publish ONLY this field and leave the realtime one empty, so
 *  a reader that handles realtime alone shows no next run for them at all.
 *  Returns milliseconds, or null if nothing parseable is present. */
function parseSystemdDuration(raw: string): number | null {
  const v = (raw || "").trim();
  if (!v || v === "n/a" || v === "infinity") return null;
  // Longest-first alternation: "min" and "ms" must be tried before bare "s".
  const SCALE: Record<string, number> = {
    us: 1e-3, ms: 1, s: 1e3, min: 6e4, h: 3.6e6, d: 8.64e7, w: 6.048e8,
  };
  const re = /(\d+(?:\.\d+)?)\s*(us|ms|min|w|d|h|s)\b/g;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v)) !== null) {
    const scale = SCALE[m[2]];
    if (scale === undefined) continue;
    total += parseFloat(m[1]) * scale;
    matched = true;
  }
  return matched ? total : null;
}

/** Convert a monotonic (since-boot) elapse into a wall-clock epoch.
 *  os.uptime() is used rather than /proc/uptime so this also holds on macOS.
 *  All three terms are instants in milliseconds, so no timezone is involved. */
function monotonicToEpoch(raw: string): number | null {
  const ms = parseSystemdDuration(raw);
  if (ms === null) return null;
  const bootEpochMs = Date.now() - os.uptime() * 1000;
  return Math.round(bootEpochMs + ms);
}

/** Split `systemctl show` output into records. Blocks are separated by a blank
 *  line; values may legitimately contain "=" so only the first is a separator. */
function parseShowBlocks(out: string): Record<string, string>[] {
  return out
    .split(/\n\s*\n/)
    .map((block) => {
      const rec: Record<string, string> = {};
      for (const line of block.split("\n")) {
        const i = line.indexOf("=");
        if (i > 0) rec[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
      return rec;
    })
    .filter((r) => r.Id);
}

async function getTimers(scope: "user" | "system"): Promise<ScheduledJob[]> {
  const flag = scope === "user" ? "--user " : "";
  const out = await run(
    `${TZ_ENV} systemctl ${flag}show '*.timer' ` +
      `--property=Id,Description,Unit,ActiveState,NextElapseUSecRealtime,NextElapseUSecMonotonic,LastTriggerUSec ` +
      `--no-pager 2>/dev/null`,
    8000,
  );
  if (!out) return [];
  return parseShowBlocks(out).map((r) => ({
    id: r.Id,
    kind: "timer" as const,
    scope,
    description: r.Description || r.Id,
    schedule: r.Id,
    target: r.Unit || "",
    nextRun:
      parseSystemdStamp(r.NextElapseUSecRealtime) ?? monotonicToEpoch(r.NextElapseUSecMonotonic),
    lastRun: parseSystemdStamp(r.LastTriggerUSec),
    active: r.ActiveState === "active",
  }));
}

async function getScheduledJobs(
  cronJobs: { schedule: string; command: string }[],
): Promise<{ jobs: ScheduledJob[]; error: string | null }> {
  const [userTimers, systemTimers] = await Promise.all([getTimers("user"), getTimers("system")]);

  const cron: ScheduledJob[] = cronJobs.map((c, i) => ({
    id: `cron-${i}`,
    kind: "cron" as const,
    scope: "user" as const,
    description: c.command.split("/").pop()?.split(" ")[0] || c.command,
    schedule: c.schedule,
    target: c.command,
    nextRun: null,
    lastRun: null,
    active: true,
  }));

  const timers = [...userTimers, ...systemTimers];

  // A box with no timers AND no cron is possible but very unlikely; if systemd
  // itself could not be queried, say so rather than implying an empty schedule.
  const error =
    timers.length === 0 && (await run("command -v systemctl 2>/dev/null")) !== ""
      ? "systemd timers could not be listed"
      : null;

  return { jobs: [...timers, ...cron], error };
}

/* ------ Managed services: discovered, not guessed ------ */
async function getManagedServices(): Promise<{ services: ManagedService[]; error: string | null }> {
  // Honour sentinel.config.json's watchUnits. This config already existed for
  // exactly this purpose and was being ignored by a hardcoded list, so edits in
  // Settings had no effect on what the Services page showed.
  const configured = loadConfig().services?.watchUnits;
  const watched = new Set(
    (Array.isArray(configured) ? configured : [])
      .map((w) => w?.unit)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
      .map((u) => (u.includes(".") ? u : `${u}.service`)),
  );

  const listFor = async (scope: "user" | "system"): Promise<ManagedService[]> => {
    const flag = scope === "user" ? "--user " : "";
    const out = await run(
      `${TZ_ENV} systemctl ${flag}list-units --type=service --state=running,failed ` +
        `--no-pager --plain --no-legend 2>/dev/null`,
      8000,
    );
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => line.trim())
      // --plain drops the leading bullet, but a stray one on an older systemd
      // would otherwise shift every column by one.
      .map((line) => line.replace(/^[\u25cf\u2022*]\s+/, ""))
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        if (parts.length < 4) return null;
        const [unit, , activeState, sub] = parts;
        if (!unit.endsWith(".service")) return null;
        return {
          unit,
          description: parts.slice(4).join(" ") || unit,
          scope,
          state: activeState === "failed" ? "failed" : sub === "running" ? "running" : "other",
          sub,
          pinned: watched.has(unit),
        } as ManagedService;
      })
      .filter((x): x is ManagedService => x !== null);
  };

  const [user, system] = await Promise.all([listFor("user"), listFor("system")]);
  const services = [...user, ...system];
  const error =
    services.length === 0 && (await run("command -v systemctl 2>/dev/null")) !== ""
      ? "systemd services could not be listed"
      : null;
  return { services, error };
}

/* ------ System Updates ------ */
let cachedUpdates: UpdateInfo | null = null;
let updatesTimestamp = 0;
const UPDATES_TTL = 600_000; // 10 min cache (update checks are slow)

async function getUpdateInfo(): Promise<UpdateInfo> {
  if (cachedUpdates && Date.now() - updatesTimestamp < UPDATES_TTL) {
    return cachedUpdates;
  }

  const packages: UpdateInfo["packages"] = [];

  if (PLATFORM === "darwin") {
    const out = await run("softwareupdate -l 2>/dev/null", 15000);
    const matches = Array.from(out.matchAll(/\*\s+Label:\s+(.+?)(?:\n.*?Version:\s+(.+))?/g));
    for (const m of matches) {
      packages.push({ name: m[1].trim(), current: "—", latest: m[2]?.trim() || "available" });
    }
    // Also check brew
    const brew = await run("brew outdated --verbose 2>/dev/null", 15000);
    for (const line of brew.split("\n").filter(Boolean)) {
      const m = line.match(/^(\S+)\s+\((.+)\)\s+<\s+(.+)/);
      if (m) packages.push({ name: m[1], current: m[2], latest: m[3] });
    }
  } else {
    // Debian/Ubuntu
    const apt = await run("apt list --upgradable 2>/dev/null", 15000);
    for (const line of apt.split("\n").slice(1).filter(Boolean)) {
      const m = line.match(/^(\S+?)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s+(\S+)\]/);
      if (m) packages.push({ name: m[1], current: m[3], latest: m[2] });
    }
    // RHEL/Fedora fallback
    if (packages.length === 0) {
      const yum = await run("yum check-update --quiet 2>/dev/null | grep -v '^$'", 15000);
      for (const line of yum.split("\n").filter(Boolean)) {
        const p = line.split(/\s+/);
        if (p.length >= 2) packages.push({ name: p[0], current: "—", latest: p[1] });
      }
    }
  }

  const result: UpdateInfo = {
    available: packages.length,
    packages: packages.slice(0, 50), // cap at 50
    // Epoch milliseconds, not an ISO string: toISOString() renders UTC no matter
    // what TZ says, and this field is meant to be formatted at the edge.
    lastChecked: Date.now(),
  };
  cachedUpdates = result;
  updatesTimestamp = Date.now();
  return result;
}

/* ------ Swap ------ */
async function getSwapInfo(): Promise<SwapInfo> {
  if (PLATFORM === "darwin") {
    const out = await run("sysctl vm.swapusage 2>/dev/null");
    const total = parseFloat(out.match(/total\s*=\s*([\d.]+)M/)?.[1] || "0") * 1024 * 1024;
    const used = parseFloat(out.match(/used\s*=\s*([\d.]+)M/)?.[1] || "0") * 1024 * 1024;
    const free = parseFloat(out.match(/free\s*=\s*([\d.]+)M/)?.[1] || "0") * 1024 * 1024;
    return { total, used, free, usage: total > 0 ? Math.round((used / total) * 100) : 0 };
  }
  const out = await run("free -b 2>/dev/null | grep -i swap");
  const parts = out.split(/\s+/);
  const total = parseInt(parts[1]) || 0;
  const used = parseInt(parts[2]) || 0;
  const free = parseInt(parts[3]) || 0;
  return { total, used, free, usage: total > 0 ? Math.round((used / total) * 100) : 0 };
}

/* ------ Top Processes ------ */
async function getTopProcesses(): Promise<ProcessInfo[]> {
  const out = PLATFORM === "darwin"
    ? await run("ps -arcwwxo pid,user,%cpu,%mem,comm | head -11")
    : await run("ps aux --sort=-%cpu 2>/dev/null | head -11");

  return out.split("\n").slice(1).filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    if (PLATFORM === "darwin") {
      return {
        pid: parseInt(parts[0]) || 0,
        user: parts[1] || "",
        cpu: parseFloat(parts[2]) || 0,
        memory: parseFloat(parts[3]) || 0,
        name: parts[4] || "",
        command: parts.slice(4).join(" "),
      };
    }
    return {
      pid: parseInt(parts[1]) || 0,
      user: parts[0] || "",
      cpu: parseFloat(parts[2]) || 0,
      memory: parseFloat(parts[3]) || 0,
      name: parts[10]?.split("/").pop() || parts[10] || "",
      command: parts.slice(10).join(" "),
    };
  }).slice(0, 10);
}

/* ------ Multiple Disks ------ */
async function getAllDisks(): Promise<DiskInfo[]> {
  const df = await run("df -h 2>/dev/null");
  const lines = df.split("\n").slice(1).filter(Boolean);
  const disks: DiskInfo[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const p = line.split(/\s+/);
    const mount = PLATFORM === "darwin" ? p[8] : p[5];
    const device = p[0];

    // Skip pseudo-filesystems
    if (!mount || !device) continue;
    if (/^(devfs|tmpfs|overlay|shm|devtmpfs|none|run)/.test(device)) continue;
    if (mount.startsWith("/System/Volumes/") && mount !== "/System/Volumes/Data") continue;
    if (mount === "/dev" || mount.startsWith("/snap/")) continue;
    if (seen.has(mount)) continue;
    seen.add(mount);

    disks.push({
      total: p[1],
      used: p[2],
      free: p[3],
      usage: parseInt(p[4]) || 0,
      mountpoint: mount,
    });
  }
  return disks;
}

/* ------ SSH Sessions ------ */
async function getSshSessions(): Promise<SshSession[]> {
  const out = await run("who 2>/dev/null");
  if (!out) return [];
  return out.split("\n").filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      user: parts[0] || "",
      terminal: parts[1] || "",
      loginTime: parts.slice(2, 4).join(" "),
      from: (line.match(/\((.+)\)/)?.[1]) || "local",
    };
  });
}

/* ------ Recent Logins ------ */
async function getRecentLogins(): Promise<LoginEntry[]> {
  const entries: LoginEntry[] = [];

  // Successful logins
  const last = await run("last -n 10 2>/dev/null");
  for (const line of last.split("\n").filter(l => l.trim() && !l.startsWith("wtmp") && !l.startsWith("reboot"))) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    entries.push({
      user: parts[0],
      from: parts[2]?.match(/^[:\d.]/) ? parts[2] : "local",
      time: parts.slice(3, 7).join(" "),
      type: "success",
    });
  }

  // Failed logins (Linux only, requires root)
  if (PLATFORM !== "darwin") {
    const lastb = await run("sudo lastb -n 5 2>/dev/null");
    for (const line of lastb.split("\n").filter(l => l.trim() && !l.startsWith("btmp"))) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      entries.push({
        user: parts[0],
        from: parts[2]?.match(/^[:\d.]/) ? parts[2] : "local",
        time: parts.slice(3, 7).join(" "),
        type: "failed",
      });
    }
  }

  return entries.slice(0, 15);
}

/* ------ System Logs ------ */
async function getSystemLogs(): Promise<LogEntry[]> {
  let out = "";
  if (PLATFORM === "darwin") {
    out = await run("log show --predicate 'eventType == logEvent' --last 5m --style compact 2>/dev/null | tail -30", 10000);
  } else {
    out = await run("journalctl -n 30 --no-pager -o short-iso 2>/dev/null");
    if (!out) out = await run("tail -30 /var/log/syslog 2>/dev/null");
  }
  if (!out) return [];

  return out.split("\n").filter(Boolean).map(line => {
    // Try ISO format first (journalctl -o short-iso)
    const isoMatch = line.match(/^(\S+)\s+(\S+)\s+(\S+?)(?:\[\d+\])?:\s*(.+)/);
    if (isoMatch) {
      return { timestamp: isoMatch[1], unit: isoMatch[3], message: isoMatch[4] };
    }
    // macOS compact log format
    const macMatch = line.match(/^([\d-]+\s+[\d:.]+)\s+\S+\s+(\S+?)(?:\[[\d:]+\])?\s+(.+)/);
    if (macMatch) {
      return { timestamp: macMatch[1], unit: macMatch[2], message: macMatch[3] };
    }
    return { timestamp: "", unit: "", message: line.slice(0, 200) };
  }).slice(-30);
}

/* ------ Network Throughput (delta-based) ------ */
let prevRx = 0;
let prevTx = 0;
let prevThroughputTime = 0;
let primaryInterface = "";

async function getNetworkThroughput(): Promise<ThroughputInfo> {
  let rxBytes = 0, txBytes = 0;
  let iface = primaryInterface;

  if (PLATFORM === "darwin") {
    // Detect primary interface
    if (!iface) {
      iface = await run("route -n get default 2>/dev/null | awk '/interface:/{print $2}'");
      if (iface) primaryInterface = iface;
    }
    if (iface) {
      const out = await run(`netstat -ib -I ${iface} 2>/dev/null | tail -1`);
      const parts = out.split(/\s+/);
      // netstat -ib columns: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
      if (parts.length >= 10) {
        rxBytes = parseInt(parts[6]) || 0;
        txBytes = parseInt(parts[9]) || 0;
      }
    }
  } else {
    // Linux: read /proc/net/dev
    if (!iface) {
      iface = await run("ip route | awk '/^default/{print $5}' | head -1");
      if (iface) primaryInterface = iface;
    }
    if (iface) {
      const out = await run(`awk '/${iface}:/{print $2, $10}' /proc/net/dev 2>/dev/null`);
      const parts = out.split(/\s+/);
      rxBytes = parseInt(parts[0]) || 0;
      txBytes = parseInt(parts[1]) || 0;
    }
  }

  const now = Date.now();
  const dt = prevThroughputTime > 0 ? (now - prevThroughputTime) / 1000 : 0;
  const rxRate = dt > 0 && prevRx > 0 ? Math.max(0, (rxBytes - prevRx) / dt) : 0;
  const txRate = dt > 0 && prevTx > 0 ? Math.max(0, (txBytes - prevTx) / dt) : 0;

  prevRx = rxBytes;
  prevTx = txBytes;
  prevThroughputTime = now;

  return { rxBytes, txBytes, rxRate: Math.round(rxRate), txRate: Math.round(txRate), interface: iface || "unknown" };
}

/* ------ Uptime History ------ */
const UPTIME_FILE = path.join(process.cwd(), ".sentinel-uptime.json");
const MAX_UPTIME_POINTS = 8640; // 24h at 10s intervals
let uptimeHistory: UptimePoint[] = [];
let uptimeLoaded = false;

function loadUptimeHistory(): void {
  if (uptimeLoaded) return;
  uptimeLoaded = true;
  try {
    if (fs.existsSync(UPTIME_FILE)) {
      const data = JSON.parse(fs.readFileSync(UPTIME_FILE, "utf-8"));
      if (Array.isArray(data)) {
        // Keep only last 24h
        const cutoff = Date.now() - 86400_000;
        uptimeHistory = data.filter((p: UptimePoint) => p.timestamp > cutoff);
      }
    }
  } catch { /* ignore */ }
}

function recordUptimePoint(): UptimePoint[] {
  loadUptimeHistory();
  const point: UptimePoint = { timestamp: Date.now(), up: true };
  uptimeHistory.push(point);
  if (uptimeHistory.length > MAX_UPTIME_POINTS) {
    uptimeHistory = uptimeHistory.slice(-MAX_UPTIME_POINTS);
  }
  // Persist every 60s (every ~6 polls)
  if (uptimeHistory.length % 6 === 0) {
    try { fs.writeFileSync(UPTIME_FILE, JSON.stringify(uptimeHistory)); } catch { /* ignore */ }
  }
  return uptimeHistory;
}

/* ====== Main Handler ====== */
export async function GET() {
  const [osInfo, disk, battery, temp, network, services, updates, swap, processes, disks, sessions, recentLogins, logs, throughput, tailscale, diskIo, smart, physicalCores] = await Promise.all([
    getOsInfo(),
    getDiskInfo(),
    getBatteryInfo(),
    getTemperature(),
    getNetworkInfo(),
    getServicesInfo(),
    getUpdateInfo(),
    getSwapInfo(),
    getTopProcesses(),
    getAllDisks(),
    getSshSessions(),
    getRecentLogins(),
    getSystemLogs(),
    getNetworkThroughput(),
    getTailscaleInfo(),
    getDiskIo(),
    getSmartInfo(),
    getPhysicalCores(),
  ]);

  const security = await getSecurityInfo(
    network.listeningPorts.filter((p) => p.exposure === "exposed"),
    network.listeningPorts.length,
  );

  const cpuModel =
    PLATFORM === "darwin"
      ? await run("sysctl -n machdep.cpu.brand_string 2>/dev/null")
      : await run("grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2");

  // Attach throughput to network
  network.throughput = throughput;

  const cpuUsage = getCpuUsage();

  return NextResponse.json({
    timestamp: Date.now(),
    hostname: os.hostname(),
    os: osInfo,
    uptime: os.uptime(),
    loadAverage: os.loadavg().map(v => Math.round(v * 100) / 100),
    cpu: {
      model: cpuModel || "Unknown CPU",
      cores: os.cpus().length,
      physicalCores,
      usage: cpuUsage.usage,
      perCore: cpuUsage.perCore,
    } satisfies CpuInfo,
    memory: await getMemoryInfo(),
    swap,
    disk,
    disks,
    battery,
    temperature: temp,
    tailscale,
    diskIo,
    smart,
    network,
    security,
    services,
    updates,
    processes,
    sessions,
    recentLogins,
    logs,
    uptimeHistory: recordUptimePoint(),
  });
}
