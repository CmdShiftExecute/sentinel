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
}

export interface CpuInfo {
  model: string;
  cores: number;
  usage: number;
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

export interface PortInfo {
  port: number;
  protocol: string;
  process: string;
  pid: string;
  address: string;
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
  cronJobs: CronJob[];
  systemServices: SystemService[];
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
  lastChecked: string;
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
