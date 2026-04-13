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
  SshSession,
  SwapInfo,
  TemperatureInfo,
  ThroughputInfo,
  UpdateInfo,
  UptimePoint,
} from "@/lib/types";
import path from "path";
import fs from "fs";

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

/* ------ CPU Usage (delta-based) ------ */
let prevIdle = 0;
let prevTotal = 0;

function getCpuUsage(): number {
  const cpus = os.cpus();
  let idle = 0,
    total = 0;
  for (const c of cpus) {
    idle += c.times.idle;
    total +=
      c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  if (prevTotal === 0) {
    prevIdle = idle;
    prevTotal = total;
    return 0;
  }
  const dIdle = idle - prevIdle;
  const dTotal = total - prevTotal;
  prevIdle = idle;
  prevTotal = total;
  return dTotal > 0 ? Math.round(100 - (dIdle / dTotal) * 100) : 0;
}

/* ------ OS Info ------ */
async function getOsInfo(): Promise<OsInfo> {
  if (PLATFORM === "darwin") {
    const out = await run("sw_vers");
    return {
      name: out.match(/ProductName:\s*(.+)/)?.[1]?.trim() || "macOS",
      version: out.match(/ProductVersion:\s*(.+)/)?.[1]?.trim() || os.release(),
      arch: os.arch(),
      platform: PLATFORM,
    };
  }
  const out = await run("cat /etc/os-release 2>/dev/null");
  return {
    name: out.match(/PRETTY_NAME="(.+)"/)?.[1] || "Linux",
    version: out.match(/VERSION_ID="(.+)"/)?.[1] || os.release(),
    arch: os.arch(),
    platform: PLATFORM,
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
    level: 0, charging: false, powerSource: "Unknown", health: 0,
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

    return {
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
  const batSlot = batSlotRaw || "BAT0";
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
  // e.g. charge_now=5217000, charge_full=5535000, charge_full_design=7150000
  //   kernel reports 73%  (5217000/7150000)
  //   actual level is 94% (5217000/5535000)
  const lvl = ec > 0 && ef > 0 ? Math.round((ec / ef) * 100) : parseInt(cap) || 0;
  return {
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

/* ------ Temperature ------ */
async function getTemperature(): Promise<TemperatureInfo> {
  const label = (c: number) =>
    c < 50 ? "Cool" : c < 65 ? "Normal" : c < 80 ? "Warm" : c < 95 ? "Hot" : "Critical";

  if (PLATFORM === "darwin") {
    // Try osx-cpu-temp first
    const raw = await run("osx-cpu-temp 2>/dev/null");
    if (raw) {
      const m = raw.match(/([\d.]+)/);
      if (m) { const c = parseFloat(m[1]); return { cpu: c, label: label(c) }; }
    }
    // Fallback: battery sensor from ioreg
    const io = await run("ioreg -rc AppleSmartBattery");
    const tm = io.match(/"Temperature"\s*=\s*(\d+)/);
    if (tm) { const c = parseInt(tm[1]) / 100; return { cpu: Math.round(c * 10) / 10, label: label(c) }; }
    return { cpu: null, label: "Unavailable" };
  }
  // Try lm-sensors first — parses "Package id 0" from coretemp (most accurate on this machine)
  const sensorsOut = await run("sensors 2>/dev/null");
  if (sensorsOut) {
    const m = sensorsOut.match(/Package id \d+:\s*\+([\d.]+)°C/);
    if (m) { const c = parseFloat(m[1]); return { cpu: c, label: label(c) }; }
    // Fallback: any Core reading from coretemp
    const core = sensorsOut.match(/Core \d+:\s*\+([\d.]+)°C/);
    if (core) { const c = parseFloat(core[1]); return { cpu: c, label: label(c) }; }
  }
  // Fallback: thermal_zone1 is CPU on this machine (zone0 is battery/ACPI)
  const zone1 = await run("cat /sys/class/thermal/thermal_zone1/temp 2>/dev/null");
  if (zone1) { const c = parseInt(zone1) / 1000; return { cpu: c, label: label(c) }; }
  // Last resort: zone0
  const zone0 = await run("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null");
  if (zone0) { const c = parseInt(zone0) / 1000; return { cpu: c, label: label(c) }; }
  return { cpu: null, label: "Unavailable" };
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
async function getSecurityInfo(openPortsCount: number): Promise<SecurityInfo> {
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

  const ssh = await run("cat /etc/ssh/sshd_config 2>/dev/null");
  const sshKeyOnly = ssh ? /PasswordAuthentication\s+no/im.test(ssh) : null;
  const rootDisabled = ssh ? /PermitRootLogin\s+no/im.test(ssh) : null;

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
    { name: "ClamAV", cmd: "which clamscan 2>/dev/null", description: "Antivirus scanner" },
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
  if (openPortsCount > 10) warnings.push(`${openPortsCount} ports are listening — review and close unnecessary ones`);

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

  // Each entry: systemd unit name to try first, then pgrep fallback process name.
  // systemctl is-active works without root and is reliable across all systemd distros.
  // pgrep fallback catches processes not managed by systemd (e.g. manually started node).
  const svcDefs: { label: string; unit: string; pgrepName: string }[] = [
    { label: "sshd",       unit: "ssh",        pgrepName: "sshd"       },
    { label: "dockerd",    unit: "docker",     pgrepName: "dockerd"    },
    { label: "tailscaled", unit: "tailscaled", pgrepName: "tailscaled" },
    { label: "node",       unit: "",           pgrepName: "node"       },
    { label: "python3",    unit: "",           pgrepName: "python3"    },
  ];
  const systemServices = await Promise.all(
    svcDefs.map(async ({ label, unit, pgrepName }) => {
      let running = false;
      if (unit) {
        const state = await run(`systemctl is-active ${unit} 2>/dev/null`);
        if (state === "active") running = true;
        // Some distros use sshd.service not ssh.service — try both
        if (!running && unit === "ssh") {
          const altState = await run("systemctl is-active sshd 2>/dev/null");
          if (altState === "active") running = true;
        }
      }
      if (!running) {
        const pid = await run(`pgrep -x ${pgrepName} 2>/dev/null`);
        if (pid) running = true;
      }
      const pid = running ? await run(`pgrep -x ${pgrepName} 2>/dev/null | head -1`) : null;
      return { name: label, status: (running ? "running" : "stopped") as "running" | "stopped", pid: pid || null };
    })
  );

  return { docker, cronJobs, systemServices };
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
    lastChecked: new Date().toISOString(),
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
  const [osInfo, disk, battery, temp, network, services, updates, swap, processes, disks, sessions, recentLogins, logs, throughput] = await Promise.all([
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
  ]);

  const security = await getSecurityInfo(network.listeningPorts.length);

  const cpuModel =
    PLATFORM === "darwin"
      ? await run("sysctl -n machdep.cpu.brand_string 2>/dev/null")
      : await run("grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2");

  // Attach throughput to network
  network.throughput = throughput;

  return NextResponse.json({
    timestamp: Date.now(),
    hostname: os.hostname(),
    os: osInfo,
    uptime: os.uptime(),
    loadAverage: os.loadavg().map(v => Math.round(v * 100) / 100),
    cpu: {
      model: cpuModel || "Unknown CPU",
      cores: os.cpus().length,
      usage: getCpuUsage(),
    } satisfies CpuInfo,
    memory: await getMemoryInfo(),
    swap,
    disk,
    disks,
    battery,
    temperature: temp,
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
