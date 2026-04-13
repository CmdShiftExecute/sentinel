<p align="center">
  <img src="screenshots/banner.png" alt="Sentinel" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-000?style=flat-square&logo=nextdotjs" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-3.4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
</p>

# Sentinel

**A self-hosted monitoring dashboard for headless servers.**

If you run a Linux box or a Mac mini in a closet somewhere, you know the routine — SSH in, run a handful of commands, try to remember what the disk usage was last time. Sentinel replaces that with a single web page you can pull up from your phone.

It's a Next.js app that runs directly on the machine you want to monitor. It reads system state through standard OS commands, presents it in a clean interface, and refreshes every 10 seconds. No agents to install, no cloud accounts, no data leaving your network.

---

<p align="center">
  <img src="screenshots/overview-logs.png" alt="Overview — Dashboard with system gauges, status cards, and live logs" width="100%" />
</p>

---

## What You Get

### System Vitals

CPU usage (delta-based, not a snapshot), load average (1/5/15 min), memory with accurate active+wired reporting, swap usage, disk utilization across all mount points, battery health with cycle count and capacity degradation, temperature readings, and top processes ranked by CPU.

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

Docker containers with state, image, ports, and uptime. Cron jobs with human-readable schedules. Key system daemons (sshd, docker, tailscaled, nginx, etc.) with running/stopped status.

<p align="center">
  <img src="screenshots/services.png" alt="Services — Docker containers and scheduled jobs" width="100%" />
</p>

### Also Included

- **System updates** — available package count with details (supports apt, yum, brew, softwareupdate)
- **System logs** — scrollable viewer of recent log entries right on the overview page
- **Power actions** — reboot and shutdown with double-click confirmation
- **Dark and light mode** — persistent toggle, follows your preference
- **Mobile-friendly** — bottom tab bar, responsive tables, works well on phones

---

## Quick Start

**Prerequisites:** Node.js 18+ and npm, on the machine you want to monitor.

```bash
git clone https://github.com/CmdShiftExecute/sentinel.git
cd sentinel
npm install
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

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3333`  | Server port |

No config files. Sentinel auto-detects your platform (Linux or macOS) and adjusts its data collection accordingly.

To change which system daemons are monitored, edit the `svcNames` array in `src/app/api/system/route.ts`:

```typescript
const svcNames = ["sshd", "docker", "tailscaled", "nginx", "postgres"];
```

---

## Platform Support

| Feature | Linux | macOS |
|---------|:-----:|:-----:|
| CPU / Memory / Disk | Yes | Yes |
| Battery & Health | Yes | Yes |
| Temperature | Yes | Partial* |
| Network / Ports | Yes (`ss`) | Yes (`lsof`) |
| Throughput | Yes (`/proc/net/dev`) | Yes (`netstat`) |
| Firewall | UFW, iptables | Application Firewall |
| Docker / Cron | Yes | Yes |
| System Updates | apt, yum | softwareupdate, brew |
| Power Actions | systemctl, shutdown | shutdown |

*macOS temperature reads from the battery sensor. For CPU temperature, install `osx-cpu-temp`.

---

## Tech Stack

| | |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 3.4 with OKLCH color system |
| **Charts** | Recharts |
| **Data Fetching** | SWR with 10-second polling |
| **Fonts** | Bricolage Grotesque + Figtree |

---

## Project Structure

```
sentinel/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── system/route.ts        # System data collection
│   │   │   └── actions/route.ts       # Power actions (reboot/shutdown)
│   │   ├── page.tsx                   # Overview dashboard
│   │   ├── hardware/page.tsx          # CPU, memory, disk, battery, processes
│   │   ├── network/page.tsx           # IPs, interfaces, ports, throughput
│   │   ├── security/page.tsx          # Score, tools, sessions, logins
│   │   ├── services/page.tsx          # Docker, cron, system processes
│   │   ├── layout.tsx                 # Root layout with sidebar
│   │   └── globals.css                # Design tokens (OKLCH)
│   ├── components/
│   │   ├── sidebar.tsx                # Desktop sidebar + mobile bottom nav
│   │   ├── gauge.tsx                  # Animated SVG gauge
│   │   ├── status-badge.tsx           # Status indicator badges
│   │   └── theme-toggle.tsx           # Dark/light mode toggle
│   ├── hooks/
│   │   ├── use-system-data.ts         # SWR data fetching hook
│   │   └── use-theme.ts              # Theme persistence hook
│   └── lib/
│       ├── types.ts                   # TypeScript interfaces
│       └── utils.ts                   # Formatting utilities
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## License

[MIT](LICENSE) — use it however you want.
