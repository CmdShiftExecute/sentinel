export interface SystemData {
  timestamp: number;
  hostname: string;
  os: OsInfo;
  uptime: number;
  loadAverage: number[];
  cpu: CpuInfo;
  memory: MemoryInfo;
  swap: SwapInfo;
  disk: DiskInfo;
  disks: DiskInfo[];
  battery: BatteryInfo;
  temperature: TemperatureInfo;
  tailscale: TailscaleInfo;
  diskIo: DiskIoInfo;
  smart: SmartInfo;
  network: NetworkInfo;
  security: SecurityInfo;
  services: ServicesInfo;
  updates: UpdateInfo;
  processes: ProcessInfo[];
  sessions: SshSession[];
  recentLogins: LoginEntry[];
  logs: LogEntry[];
  uptimeHistory: UptimePoint[];
}

export interface OsInfo {
  name: string;
  version: string;
  arch: string;
  platform: string;
  /** Friendly hardware name, resolved live from DMI. e.g. "Mac mini (Mid 2011) Server" */
  machine?: string;
  /** The raw vendor model identifier, e.g. "Macmini5,3". Always shown, never guessed. */
  machineId?: string;
}

export interface CpuInfo {
  model: string;
  cores: number;
  physicalCores: number | null;
  usage: number;
  perCore: number[];
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  usage: number;
}

export interface DiskInfo {
  total: string;
  used: string;
  free: string;
  usage: number;
  mountpoint: string;
}

export interface BatteryInfo {
  present: boolean;
  level: number;
  charging: boolean;
  powerSource: string;
  health: number;
  cycleCount: number;
  designCapacity: number;
  maxCapacity: number;
  currentCapacity: number;
  temperature: number | null;
  timeRemaining: string | null;
}

export interface TemperatureInfo {
  cpu: number | null;
  label: string;
  cores: CoreTemp[];
  /** Where the CPU's own hardware throttling starts (TjMax minus the TCC
   *  offset; 100 °C on the i7-2635QM). */
  throttleAt: number | null;
  /** The chip's "high" warning line (coretemp temp_max; 86 °C here). Being
   *  above it is hot, not throttling. */
  warnAt: number | null;
  throttling: ThrottleState;
  fanRpm: number | null;
  fanMin: number | null;
  fanMax: number | null;
  cpuPowerW: number | null;
}

export interface ThrottleState {
  /** Thermal throttling right now. null = could not tell. */
  active: boolean | null;
  /** Which signal: the CPU's own heat limit, the board (Mac SMC) forcing a
   *  slow-down via PROCHOT#, or both. null when not throttling. */
  cause?: "heat" | "board" | "both" | null;
  /** Clocked down by a power limit right now (not heat). */
  powerLimit: boolean | null;
  /** "msr" = the CPU's live status bits (via the power sampler);
   *  "counters" = the kernel's event counter moved in the last poll. */
  source: "msr" | "counters" | "none";
  /** Package throttle events and total throttled time since boot. */
  events: number | null;
  totalMs: number | null;
}

export interface CoreTemp {
  name: string;
  temp: number;
}

export interface TailscaleInfo {
  installed: boolean;
  state: string;
  online: boolean;
  hostName: string;
  dnsName: string;
  relay: string;
  peersOnline: number;
  peersTotal: number;
  healthWarnings: string[];
}

export interface DiskIoInfo {
  readRate: number;
  writeRate: number;
  device: string;
}

export interface SmartInfo {
  available: boolean;
  healthy: boolean | null;
  model: string;
  temperature: number | null;
  powerOnHours: number | null;
  wearPct: number | null;
}

export interface NetworkInfo {
  lanIp: string;
  tailscaleIp: string;
  externalIp: string;
  gateway: string;
  dnsServers: string[];
  networkManager: string;
  interfaces: NetworkInterface[];
  listeningPorts: PortInfo[];
  throughput: ThroughputInfo;
}

export interface NetworkInterface {
  name: string;
  ip: string;
  mac: string;
  status: "up" | "down";
}

/** Who can actually reach a listening socket.
 *
 *  A raw count of listening sockets is not a measure of exposure, and treating it
 *  as one produced a permanent red warning on this box: 38 sockets, of which all
 *  but two were bound to loopback or to the tailnet behind a default-deny firewall.
 *  A warning that can never clear is a warning he stops reading, so the count that
 *  drives it is now the EXPOSED one.
 *
 *  loopback — 127.0.0.0/8 or ::1. Unreachable from any other machine, full stop.
 *  tailnet  — bound to the Tailscale address. Reachable only by his own devices.
 *  exposed  — 0.0.0.0, *, ::, or a LAN address. Reachable from the local network,
 *             subject to the firewall. THIS is the number worth watching.
 */
export type PortExposure = "loopback" | "tailnet" | "exposed";

export interface PortInfo {
  port: number;
  protocol: string;
  process: string;
  pid: string;
  address: string;
  exposure: PortExposure;
}

export interface SecurityInfo {
  firewallEnabled: boolean;
  firewallTool: string;
  sshKeyOnly: boolean | null;
  rootLoginDisabled: boolean | null;
  autoUpdates: boolean | null;
  tools: SecurityTool[];
  openPortsCount: number;
  score: number;
  grade: string;
  warnings: string[];
}

export interface SecurityTool {
  name: string;
  installed: boolean;
  description: string;
}

export interface ServicesInfo {
  docker: DockerContainer[];
  /** Legacy shape, kept so nothing that already reads it breaks. Superseded by
   *  `scheduled`, which also covers systemd timers. */
  cronJobs: CronJob[];
  /** Everything that runs on a schedule on this box, from BOTH mechanisms:
   *  crontab entries and systemd timers in the user and system scopes. Reading
   *  only one of the two is how a dashboard reports a near-empty schedule on a
   *  box that is in fact running dozens of jobs. */
  scheduled: ScheduledJob[];
  /** systemd services actually discovered on the box, replacing a fixed list. */
  managed: ManagedService[];
  /** Set when a discovery command could not be run at all, so the UI can say
   *  "could not check" instead of rendering an empty list as "nothing here". */
  discoveryError?: string | null;
}

/** One scheduled job, from either scheduling mechanism.
 *  Times are epoch milliseconds — an instant, which carries no timezone — and
 *  are formatted for display at the edge. */
export interface ScheduledJob {
  id: string;
  kind: "cron" | "timer";
  scope: "user" | "system";
  description: string;
  /** Human schedule for cron ("every 5 minutes"); the unit name for a timer. */
  schedule: string;
  /** The command a cron line runs, or the service a timer activates. */
  target: string;
  nextRun: number | null;
  lastRun: number | null;
  active: boolean;
}

/** A systemd service discovered on the box (not a hardcoded guess). */
export interface ManagedService {
  unit: string;
  description: string;
  scope: "user" | "system";
  state: "running" | "failed" | "other";
  sub: string;
  /** True when the unit is named in sentinel.config.json services.watchUnits. */
  pinned: boolean;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "paused" | "created";
  ports: string;
  uptime: string;
}

export interface CronJob {
  schedule: string;
  command: string;
  description: string;
}

export interface SystemService {
  name: string;
  status: "running" | "stopped" | "unknown";
  pid: string | null;
}

export interface UpdateInfo {
  available: number;
  packages: UpdatePackage[];
  /** Epoch milliseconds. Formatted at the point of display. */
  lastChecked: number;
}

export interface UpdatePackage {
  name: string;
  current: string;
  latest: string;
}

export interface SwapInfo {
  total: number;
  used: number;
  free: number;
  usage: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user: string;
  command: string;
}

export interface SshSession {
  user: string;
  terminal: string;
  from: string;
  loginTime: string;
}

export interface LoginEntry {
  user: string;
  from: string;
  time: string;
  type: "success" | "failed";
}

export interface LogEntry {
  timestamp: string;
  unit: string;
  message: string;
}

export interface ThroughputInfo {
  rxBytes: number;
  txBytes: number;
  rxRate: number;
  txRate: number;
  interface: string;
}

export interface UptimePoint {
  timestamp: number;
  up: boolean;
}

/** One row of the task manager (/api/processes). Nullable fields could not be
 *  read for that process (or that platform) — they are unknown, not zero. */
export interface ProcessRow {
  pid: number;
  name: string;
  user: string;
  state: string;
  /** Live CPU over the sampling window, percent of one core (top's convention). */
  cpu: number;
  memPct: number;
  /** Resident memory, bytes. */
  rss: number;
  /** Swapped-out memory, bytes. */
  swap: number | null;
  threads: number | null;
  /** Disk read+write, bytes per second. */
  ioRate: number | null;
  command: string;
}

export interface ProcessesResponse {
  ok: boolean;
  /** "proc" = live two-sample reading; "ps" = lifetime averages (macOS). */
  source?: "proc" | "ps";
  sampledMs?: number;
  cores?: number;
  memTotal?: number;
  rows: ProcessRow[];
  error?: string;
}

/** /api/power — see src/app/api/power/route.ts. DC watts are measured (Apple
 *  SMC); wall watts are DC / psuEfficiency and therefore an estimate. */
export interface PowerDay {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  partial: boolean;
  avgW: number;
  kwh: number;
  cost: number | null;
  /** Share of the day the sampler actually recorded, 0..1. */
  coverage: number;
}

export interface PowerStats {
  avgW: number;
  peakW: number;
  kwhPerDay: number;
  costPerDay: number | null;
  coverageHours: number;
}

export interface PowerResponse {
  ok: boolean;
  reason?: string;
  error?: string;
  live: { ts: number; stale: boolean; dcW: number | null; wallW: number | null; cpuW: number | null; source: string } | null;
  efficiency: number;
  tariff: { currency: string; ratePerKwh: number; source: string; householdMonthlyKwh: number } | null;
  last24h: PowerStats | null;
  avg30d: PowerStats | null;
  daysRecorded: number;
  since: number | null;
  days: PowerDay[];
  series: { ts: number; wall: number; peak: number; cpu: number | null }[];
}
