import { NextResponse } from "next/server";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import os from "os";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// LAN device discovery: arp-scan sweep (finds every responding device with
// MAC + vendor) merged with the kernel neighbour table, named via mDNS
// (avahi), reverse DNS, the knownDevices map in sentinel.config.json, and
// Tailscale peer hostnames where a peer's LAN presence is identifiable.

const exec = promisify(execCb);

async function run(cmd: string, timeout = 20000): Promise<string> {
  try {
    const { stdout } = await exec(cmd, { timeout });
    return stdout.trim();
  } catch {
    return "";
  }
}

export interface LanDevice {
  ip: string;
  mac: string;
  vendor: string;
  name: string;
  source: string;
  self: boolean;
}

interface ScanResult {
  devices: LanDevice[];
  subnet: string;
  interface: string;
  scannedAt: number;
}

let cachedScan: ScanResult | null = null;
let scanInFlight: Promise<ScanResult> | null = null;
const SCAN_TTL = 60_000;

function vendorLabel(raw: string, mac: string): string {
  if (/locally administered/i.test(raw)) return "Private address";
  if (/unknown/i.test(raw) || !raw) {
    // A cleared U/L bit with unknown OUI is just an unregistered vendor
    return /^.[26ae]/i.test(mac) ? "Private address" : "";
  }
  return raw.replace(/\s*\(.*\)$/, "");
}

async function doScan(): Promise<ScanResult> {
  const iface = (await run("ip route | awk '/^default/{print $5}' | head -1")) || "";

  // Self entry
  const nets = os.networkInterfaces()[iface] || [];
  const selfV4 = nets.find((a) => a.family === "IPv4" && !a.internal);

  const devices = new Map<string, LanDevice>();
  if (selfV4) {
    devices.set(selfV4.address, {
      ip: selfV4.address,
      mac: selfV4.mac || "",
      vendor: "",
      name: os.hostname(),
      source: "self",
      self: true,
    });
  }

  // arp-scan actively probes the whole subnet (requires root; sudoers already
  // permits it on this box). Falls back to the passive neighbour table.
  const scan = await run(`sudo -n arp-scan --localnet --numeric --interface=${iface} --retry=2 2>/dev/null`, 25000);
  for (const line of scan.split("\n")) {
    const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\t([0-9a-f:]{17})\t(.*)$/i);
    if (!m) continue;
    const [, ip, mac, vendor] = m;
    if (!devices.has(ip)) {
      devices.set(ip, {
        ip,
        mac: mac.toLowerCase(),
        vendor: vendorLabel(vendor, mac),
        name: "",
        source: "arp-scan",
        self: false,
      });
    }
  }

  // Merge kernel neighbour table (catches devices that ignored the sweep)
  const neigh = await run("ip neigh show");
  for (const line of neigh.split("\n")) {
    const m = line.match(/^(\d+\.\d+\.\d+\.\d+) dev (\S+) lladdr ([0-9a-f:]{17}) (\S+)/i);
    if (!m) continue;
    const [, ip, dev, mac, state] = m;
    if (dev !== iface) continue;
    // Only merge CONFIRMED neighbour states. After an active arp-scan a
    // STALE/INCOMPLETE entry is an aging ghost (e.g. a powered-off host),
    // not a device that is actually present on the LAN.
    if (!["REACHABLE", "PERMANENT", "DELAY", "PROBE"].includes(state.toUpperCase())) continue;
    if (!devices.has(ip)) {
      devices.set(ip, {
        ip,
        mac: mac.toLowerCase(),
        vendor: vendorLabel("", mac),
        name: "",
        source: "arp",
        self: false,
      });
    }
  }

  // Name resolution — mDNS first (Apple devices announce there), then rDNS
  const unnamed = Array.from(devices.values()).filter((d) => !d.name);
  if (unnamed.length > 0) {
    const avahi = await run(
      `timeout 6 avahi-resolve-address ${unnamed.map((d) => d.ip).join(" ")} 2>/dev/null`,
      8000
    );
    for (const line of avahi.split("\n")) {
      const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+(\S+)/);
      if (m) {
        const dev = devices.get(m[1]);
        if (dev && !dev.name) {
          dev.name = m[2].replace(/\.local\.?$/i, "");
          dev.source = "mDNS";
        }
      }
    }
    await Promise.all(
      Array.from(devices.values())
        .filter((d) => !d.name)
        .map(async (d) => {
          const host = await run(`timeout 2 getent hosts ${d.ip} 2>/dev/null | awk '{print $2}'`, 4000);
          if (host && !/^\d/.test(host)) {
            d.name = host.replace(/\.local\.?$/i, "");
            d.source = "rDNS";
          }
        })
    );
  }

  // knownDevices overrides from sentinel.config.json (byMac / byIp)
  const cfg = loadConfig() as unknown as {
    network?: { knownDevices?: { byMac?: Record<string, string>; byIp?: Record<string, string> } };
  };
  const byMac = cfg.network?.knownDevices?.byMac ?? {};
  const byIp = cfg.network?.knownDevices?.byIp ?? {};
  for (const d of Array.from(devices.values())) {
    const known = byMac[d.mac] || byIp[d.ip];
    if (known) {
      d.name = known;
      d.source = d.source === "self" ? "self" : "config";
    }
  }

  // Gateway labelling
  const gw = await run("ip route | awk '/^default/{print $3}' | head -1");
  const gwDev = gw ? devices.get(gw) : undefined;
  if (gwDev && !gwDev.name) {
    gwDev.name = "Router";
    gwDev.source = "gateway";
  }

  const sorted = Array.from(devices.values()).sort((a, b) => {
    const na = a.ip.split(".").map(Number);
    const nb = b.ip.split(".").map(Number);
    for (let i = 0; i < 4; i++) if (na[i] !== nb[i]) return na[i] - nb[i];
    return 0;
  });

  const subnet = selfV4 ? selfV4.address.replace(/\.\d+$/, ".0/24") : "";
  return { devices: sorted, subnet, interface: iface, scannedAt: Date.now() };
}

export async function GET() {
  if (cachedScan && Date.now() - cachedScan.scannedAt < SCAN_TTL) {
    return NextResponse.json(cachedScan);
  }
  if (!scanInFlight) {
    scanInFlight = doScan().finally(() => {
      scanInFlight = null;
    });
  }
  cachedScan = await scanInFlight;
  return NextResponse.json(cachedScan);
}
