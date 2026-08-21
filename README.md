<p align="center">
  <img src="screenshots/banner.png" alt="Sentinel" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-000?style=flat-square&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-3.4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
  <img src="https://img.shields.io/badge/version-0.4.0-14B8A6?style=flat-square" />
</p>

# Sentinel

**A self-hosted monitoring dashboard for headless Linux and macOS servers.**

If you run a Linux box or a Mac mini in a closet somewhere, you know the routine — SSH in, run a handful of commands, try to remember what the disk usage was last time. Sentinel replaces that with a single web page you can pull up from your phone.

It's a Next.js app that runs directly on the machine you want to monitor. It reads system state through standard OS commands, presents it in a clean interface, and refreshes every 10 seconds. No agents to install, no cloud accounts, no data leaving your network.

---

<p align="center">
  <img src="screenshots/overview-logs.png" alt="Overview — Dashboard with system gauges, status cards, and live logs" width="100%" />
</p>

---

## What You Get

### System Vitals

CPU usage (delta-based, not a snapshot) with per-thread meters, load average (1/5/15 min), memory with accurate active+wired reporting, swap usage, disk utilization across all mount points with live read/write I/O rates and S.M.A.R.T. health, temperature readings with per-core detail, and top processes ranked by CPU.

**Adaptive power view:** Sentinel detects whether the machine has a battery. Laptops and portable servers get the battery gauge, charge details, health, and cycle count; desktop hardware (Mac mini, NUC, rack box) automatically swaps in an AC-focused view instead: power source, CPU package draw via Intel RAPL, exhaust-fan RPM against its range, and thermal headroom to the throttle limit. No configuration needed.

**History graphs:** a lightweight one-minute sampler (`metrics-sampler.py`, run from cron) records CPU, memory, temperature, fan, network, and disk I/O into a capped JSONL log (7-day retention). The dashboard renders time-series graphs with 1h / 6h / 12h / 24h / 7d timeframes for temperature, CPU, memory, and network throughput, plus a live last-60s throughput chart.

**Network device discovery:** the Network page lists every device on your LAN (active ARP sweep merged with the neighbour table), named via mDNS, reverse DNS, and an optional `knownDevices` map in `sentinel.config.json`.

**Accent themes and motion:** six accent palettes behind a sidebar picker (teal, electric blue, sage, amber, burnt orange, violet) that recolor the whole interface via CSS `color-mix`, plus a restrained motion layer: directional card entrances on load and scroll, a cursor spotlight on cards, count-up metrics, and chart draw-ins. Everything honors `prefers-reduced-motion`.

<p align="center">
  <img src="screenshots/hardware-battery.png" alt="Hardware — Battery health, temperature, CPU and memory details" width="100%" />
</p>

<p align="center">
  <img src="screenshots/hardware-disk-processes.png" alt="Hardware — Disk usage, mount points, and top processes" width="100%" />
</p>

### Network

LAN IP, external IP (cached, refreshed every 5 minutes), TailScale IP (auto-detected if running), default gateway, DNS servers, network manager, real-time download/upload throughput, all network interfaces with MAC addresses and link status, and every listening port with its process name, PID, and protocol.

<p align="center">
  <img src="screenshots/network.png" alt="Network — IP addresses, configuration, interfaces, and listening ports" width="100%" />
</p>

<p align="center">
  <img src="screenshots/network-throughput.png" alt="Network — Live throughput, interfaces, and port table" width="100%" />
</p>

### Security

A security score (0–100, letter graded A through F) based on firewall status, SSH hardening, auto-update configuration, and installed security tools. Shows active SSH sessions, recent logins with success/failure status, and actionable warnings when something needs attention.

<p align="center">
  <img src="screenshots/security.png" alt="Security — Score, firewall status, and security tools inventory" width="100%" />
</p>

<p align="center">
  <img src="screenshots/security-sessions.png" alt="Security — Active sessions, recent logins, and recommendations" width="100%" />
</p>

### Services

**Scheduled jobs** are read from both mechanisms a machine actually uses: `crontab` entries and systemd timers in the user and system scopes. They are merged into one list sorted by what fires next, each row showing the next run, the last run, and the unit or command behind it. Reading only `crontab` — as this page did before 0.4.0 — reports a near-empty schedule on any box that schedules through systemd, which is most of them.

Timers declared with `OnBootSec` or `OnUnitActiveSec` publish only a monotonic since-boot duration and leave the realtime field empty; those are converted too, so every active timer shows a next run rather than a dash.

**Services** are enumerated live from systemd, with failed units surfaced first and any unit named in `services.watchUnits` pinned to the top of its group. System-scope units are collapsed behind a toggle so the estate's own services read first.

**Docker containers** show state, image, ports, and uptime. Service start history from journalctl appears in the activity timeline.

<p align="center">
  <img src="screenshots/services.png" alt="Services — Docker containers and scheduled jobs" width="100%" />
</p>

### Server Logs (Activity Timeline)

A chronological event feed that aggregates system activity across sources: SSH logins, package installs/removals, service starts, system boots, fail2ban bans, git commits in your vault or knowledge base, and file changes in AI agent directories (OpenClaw, n8n, etc.).

The timeline is powered by `activity-collector.py`, a Python daemon that runs alongside Sentinel and writes events to `activity.jsonl`. Run it once manually or set it up as a systemd service — Sentinel reads the file automatically.

```bash
# Start the collector (run on the monitored machine)
cd /path/to/sentinel
python3 activity-collector.py
```

The collector auto-detects knowledge base apps (Logseq, Foam, Obsidian, Org-mode), AI agent directories (OpenClaw, n8n, Auto-GPT, AnythingLLM, Home Assistant, and more), and git repositories defined in `SENTINEL_GIT_REPOS`. Configure the primary vault path and watched services in the Settings page.

### Estate Health (optional)

If a JSON file exists at `~/server-ops/state/estate-health.json`, the overview renders it as a compact panel: a one-line verdict, anything not healthy lifted into an always-visible strip, and one tile per group carrying a dot per check. Groups expand one at a time into a height-capped scroll region, so the panel cannot grow the page without bound however many checks you feed it.

Nothing here writes that file — Sentinel is only a reader, so you can generate it from whatever already knows the health of your machines. The panel is hidden entirely when the file is absent. If the file exists but cannot be parsed, that is reported as a fault rather than drawn as a healthy estate, which is the whole point of having the record.

The expected shape:

```json
{
  "overall": "ok",
  "headline": "Everything checked is fine",
  "generated_label": "21 Aug 2026, 19:20",
  "counts": { "ok": 43, "problem": 0, "unknown": 2, "total": 45 },
  "group_order": ["Machines", "Backups", "Services"],
  "checks": [
    {
      "name": "Nightly backup",
      "state": "ok",
      "headline": "Succeeded 03:20",
      "group": "Backups",
      "detail": "Optional longer explanation",
      "last_run": "03:20"
    }
  ]
}
```

`state` is one of `ok`, `problem`, or `unknown`. Anything unrecognised is treated as `unknown` rather than assumed healthy.

### Also Included

- **System updates** — available package count with details (supports apt, yum, brew, softwareupdate)
- **System logs** — scrollable viewer of recent log entries on the overview page
- **Power actions** — reboot and shutdown with double-click confirmation
- **Dark and light mode** — persistent toggle, follows your preference
- **Mobile-friendly** — bottom tab bar, responsive tables, works well on phones
- **Settings page** — configure vault path, watched services, markdown scanning, and hardware display without editing any files
- **Help overlay** — press `?` anywhere to open an in-app reference covering platform notes, page descriptions, keyboard shortcuts, and setup instructions

---

## Quick Start

**Prerequisites:** Node.js 18+ and npm, on the machine you want to monitor.

```bash
git clone https://github.com/CmdShiftExecute/sentinel.git
cd sentinel
npm install

# Copy the example config and edit it with your paths
cp sentinel.config.example.json sentinel.config.json

npm run build
npm start
```

Open **http://localhost:3333**. That's it.

For development with hot reload:

```bash
npm run dev
```

---

## Deployment

Sentinel is meant to run on the server it monitors. Pick whichever method you're comfortable with.

### pm2

```bash
npm install -g pm2
npm run build

pm2 start npm --name sentinel -- start
pm2 save
pm2 startup   # generates a command to run — follow its output
```

### systemd

Create `/etc/systemd/system/sentinel.service`:

```ini
[Unit]
Description=Sentinel Dashboard
After=network.target

[Service]
WorkingDirectory=/path/to/sentinel
ExecStart=/usr/bin/npm start
Restart=always
User=your-user
Environment=PORT=3333

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now sentinel
```

To also run the activity collector persistently, create a second service unit pointing to `python3 /path/to/sentinel/activity-collector.py`, or add it as a second `ExecStartPost` if your setup allows it.

### Accessing from Other Devices

If your server is headless, [TailScale](https://tailscale.com) is the simplest way to reach the dashboard from your phone or laptop:

```bash
# On the server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# From any device on your tailnet
http://<tailscale-ip>:3333
```

Or expose it on your local network and access via the server's LAN IP.

---

## Power Actions Setup

The reboot and shutdown buttons need passwordless sudo for shutdown commands. On your server:

```bash
sudo visudo
```

Add this line (replace `your-user` with your username):

```
your-user ALL=(ALL) NOPASSWD: /sbin/shutdown, /usr/bin/systemctl reboot, /usr/bin/systemctl poweroff
```

Skip this step if you don't need remote power control — everything else works without it.

---

## Configuration

Sentinel reads from `sentinel.config.json` at the project root. This file is gitignored — your personal paths and service names stay local and are never committed.

Copy the example to get started:

```bash
cp sentinel.config.example.json sentinel.config.json
```

All fields are optional and merge on top of built-in defaults, so you only need to specify what you want to change.

```json
{
  "vault": {
    "primaryPath": "/home/user/vaults/MyVault"
  },
  "markdown": {
    "enabled": true,
    "extraExcludePaths": ["/home/user/skip-this-dir"]
  },
  "services": {
    "watchUnits": [
      { "unit": "docker",  "userUnit": false, "label": "Docker daemon started" },
      { "unit": "my-app",  "userUnit": true,  "label": "My app started" }
    ]
  },
  "hardware": {
    "showBattery": true
  }
}
```

| Field | Description |
|-------|-------------|
| `vault.primaryPath` | Absolute path to your primary knowledge base / Obsidian vault. Git commits from this directory appear in the activity timeline. |
| `markdown.enabled` | Scan for loose markdown files outside the vault. |
| `markdown.extraExcludePaths` | Additional directories to skip when scanning markdown. |
| `services.watchUnits` | systemd units whose start events appear in Server Logs. Set `userUnit: true` for user-space services (equivalent to `--user-unit` in journalctl). |
| `hardware.showBattery` | Show or hide the battery section on the Hardware page. Disable on servers without batteries. |

You can also configure everything through the **Settings page** in the dashboard — no manual JSON editing required.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3333` | Dashboard port |
| `SENTINEL_VAULT_PATH` | *(from config)* | Override vault path at runtime |
| `SENTINEL_KB_PATH` | *(none)* | Additional knowledge base path for the activity collector |
| `SENTINEL_GIT_REPOS` | *(none)* | Colon-separated list of additional git repos to track |
| `NEXT_PUBLIC_SENTINEL_TZ` | *(browser's own)* | IANA timezone to pin every displayed time to, e.g. `Europe/Berlin`. Useful when you administer a machine from another country and want one consistent clock. Read at build time, so rebuild after changing it. |
| `NEXT_PUBLIC_SENTINEL_TZ_LABEL` | *(none)* | Short suffix printed after times, e.g. `CET`. Blank by default, since an unexplained abbreviation is worse than none. |
| `SENTINEL_TZ` | *(machine's own)* | Timezone exported to child processes, so `systemctl` renders timestamps in the zone you expect rather than the caller's. |

Put machine-specific values in `.env.local`, which is gitignored.

---

## Platform Support

Sentinel runs on **Linux** and **macOS**. Most features work on both; a few rely on Linux-specific tooling.

| Feature | Linux | macOS |
|---------|:-----:|:-----:|
| CPU / Memory / Disk | ✓ | ✓ |
| Battery & Health | ✓ | ✓ |
| Temperature | ✓ | Partial* |
| Network / Ports | ✓ (`ss`) | ✓ (`lsof`) |
| Throughput | ✓ (`/proc/net/dev`) | ✓ (`netstat`) |
| Firewall status | UFW, iptables | Application Firewall |
| Docker / Cron | ✓ | ✓ |
| System Updates | apt, yum | softwareupdate, brew |
| Power Actions | systemctl, shutdown | shutdown |
| systemd service status | ✓ | — |
| journalctl events (SSH, boots, services) | ✓ | — |
| fail2ban bans | ✓ | — |
| dpkg/apt package log | ✓ | — |

*macOS temperature reads from the battery sensor. For CPU temperature, install [`osx-cpu-temp`](https://github.com/lavoiesl/osx-cpu-temp).

Features that rely on Linux-only tooling (journalctl, fail2ban, dpkg) return empty results on macOS rather than erroring — the dashboard still loads and all other panels work.

---

## Tech Stack

| | |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 3.4 with OKLCH color system |
| **Charts** | Recharts |
| **Data Fetching** | SWR with 10-second polling |
| **Activity Collection** | Python 3 daemon (`activity-collector.py`) |
| **Fonts** | Bricolage Grotesque + Figtree |

---

## Project Structure

```
sentinel/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── system/route.ts        # System data collection
│   │   │   ├── activity/route.ts      # Activity timeline reader
│   │   │   ├── estate/route.ts        # Optional estate-health record reader
│   │   │   ├── settings/route.ts      # Config read/write API
│   │   │   └── actions/route.ts       # Power actions (reboot/shutdown)
│   │   ├── page.tsx                   # Overview dashboard
│   │   ├── hardware/page.tsx          # CPU, memory, disk, battery, processes
│   │   ├── network/page.tsx           # IPs, interfaces, ports, throughput
│   │   ├── security/page.tsx          # Score, tools, sessions, logins
│   │   ├── services/page.tsx          # Scheduled jobs, systemd services, Docker
│   │   ├── activity/page.tsx          # Activity timeline
│   │   ├── settings/page.tsx          # Dashboard settings UI
│   │   ├── layout.tsx                 # Root layout with sidebar
│   │   └── globals.css                # Design tokens (OKLCH)
│   ├── components/
│   │   ├── sidebar.tsx                # Desktop sidebar + mobile bottom nav
│   │   ├── help-overlay.tsx           # ? key help modal
│   │   ├── gauge.tsx                  # Animated SVG gauge
│   │   ├── metric-card.tsx            # Stat card with status coloring
│   │   ├── status-badge.tsx           # Status indicator badges
│   │   ├── estate-health-panel.tsx    # Estate health summary (overview)
│   │   ├── effects.tsx                # Pointer light + boot sweep
│   │   └── theme-toggle.tsx           # Dark/light mode toggle
│   ├── hooks/
│   │   ├── use-system-data.ts         # SWR data fetching hook
│   │   └── use-theme.ts               # Theme persistence hook
│   └── lib/
│       ├── config.ts                  # Config loader/writer with deep merge
│       ├── types.ts                   # TypeScript interfaces
│       ├── estate.ts                  # Estate-health record types
│       └── utils.ts                   # Formatting utilities
├── activity-collector.py              # Python event collector daemon
├── sentinel.config.example.json      # Committed example config (generic)
├── sentinel.config.json               # Your local config (gitignored)
├── .env.local                         # Machine-specific env (gitignored)
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Versioning

Sentinel follows [semantic versioning](https://semver.org) at `MAJOR.MINOR.PATCH`, and is pre-1.0 — the API and config shape may still change between minor versions.

- **MAJOR** — reserved for 1.0 and beyond.
- **MINOR** — new pages, new data sources, or a change to the config file's shape.
- **PATCH** — fixes and refinements that need no change on your side.

The version in `package.json` is the source of truth; the badge at the top of this file and the table below track it.

## Changelog

### 0.4.0 — 21 Aug 2026

- **Scheduled jobs now include systemd timers.** The Services page read `crontab` alone, so on a machine that schedules through systemd it reported a near-empty schedule while looking authoritative. Both mechanisms are now merged, in the user and system scopes, sorted by what fires next.
- **Services are discovered rather than guessed.** A fixed five-unit list in the source has been replaced by live enumeration from systemd, with failed units first and `services.watchUnits` honoured as pins. That config existed for this purpose and was being ignored.
- **Estate Health panel** on the overview, reading an optional external record. Hidden when the record is absent; reported as a fault when it exists and cannot be parsed.
- **Timezone is configurable** via `NEXT_PUBLIC_SENTINEL_TZ`, defaulting to the viewing browser's own zone.
- **Pointer light scales to the card it lights.** A single fixed radius was wider than a small card, so the whole surface lit at once and the light appeared not to track the pointer.
- Fixes: a hydration error on the Browser Agent page caused by injecting a `<style>` child; an activity feed that sliced an unsorted file and could be blanked by one malformed line; a jobs table whose auto layout pushed a column off-screen; timestamps rendered raw in UTC.

### 0.3.0 — 21 Jul 2026

- Adaptive AC and battery views, history graphs, network device discovery, theme and accent palettes, and the motion layer.
- Warm-standby backup status card on the overview and Services pages.
- Device scan trusts only confirmed neighbours.

### 0.2.0 — 18 Apr 2026

- Activity timeline page with the collector, sidebar navigation, and system API improvements.
- Settings page, help overlay, the config system, and the glassmorphism interface.

### 0.1.0 — 13 Apr 2026

- Initial release: system vitals, network, security, and services pages.
- Cross-platform detection for network, firewall, battery, and services; dynamic rendering so system data is never served from cache.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## License

[MIT](LICENSE) — use it however you want.
