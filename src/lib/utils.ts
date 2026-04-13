export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

export function tempColor(celsius: number | null): string {
  if (celsius === null) return "var(--text-muted)";
  if (celsius < 50) return "var(--accent)";
  if (celsius < 65) return "var(--success)";
  if (celsius < 80) return "var(--warning)";
  return "var(--danger)";
}

export function tempLabel(celsius: number | null): string {
  if (celsius === null) return "N/A";
  if (celsius < 50) return "Cool";
  if (celsius < 65) return "Normal";
  if (celsius < 80) return "Warm";
  if (celsius < 95) return "Hot";
  return "Critical";
}

export function batteryColor(level: number): string {
  if (level > 50) return "var(--success)";
  if (level > 20) return "var(--warning)";
  return "var(--danger)";
}

export function healthColor(pct: number): string {
  if (pct >= 80) return "var(--success)";
  if (pct >= 50) return "var(--warning)";
  return "var(--danger)";
}

export function scoreGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function gradeColor(grade: string): string {
  if (grade === "A") return "var(--success)";
  if (grade === "B") return "var(--accent)";
  if (grade === "C") return "var(--warning)";
  return "var(--danger)";
}

export function cronToHuman(schedule: string): string {
  const parts = schedule.split(/\s+/);
  if (parts.length < 5) return schedule;
  const [min, hour, dom, mon, dow] = parts;
  if (min === "*" && hour === "*") return "Every minute";
  if (min.startsWith("*/")) return `Every ${min.slice(2)} min`;
  if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
  if (dom === "*" && mon === "*" && dow === "*") {
    return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  return schedule;
}
