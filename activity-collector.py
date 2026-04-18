#!/usr/bin/env python3
"""Activity collector for Sentinel dashboard.
Collects system events from journalctl, dpkg.log, git, and other sources.
Appends to activity.jsonl with max 2000 events.
"""

import json
import subprocess
import hashlib
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

_HERE = Path(__file__).parent
ACTIVITY_FILE = _HERE / "activity.jsonl"
STATE_FILE = _HERE / "activity-state.json"
VAULT_PATH = Path(os.environ.get("SENTINEL_VAULT_PATH", str(_HERE.parent / "vaults/SK-Vault")))
MAX_EVENTS = 2000

def sha_id(ts_str, source, title):
    """Generate short MD5 hash for dedup."""
    msg = f"{ts_str}|{source}|{title}"
    return hashlib.md5(msg.encode()).hexdigest()[:12]

def load_state():
    """Load last_run timestamp and vault_last_commit from state file."""
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
            return data.get("last_run"), data.get("vault_last_commit")
        except:
            pass
    return None, None

def save_state(last_run, vault_last_commit):
    """Save state file."""
    STATE_FILE.write_text(json.dumps({
        "last_run": last_run,
        "vault_last_commit": vault_last_commit
    }, indent=2))

def parse_iso_timestamp(ts_str):
    """Parse ISO timestamp (with or without Z)."""
    ts_str = ts_str.rstrip('Z')
    try:
        return datetime.fromisoformat(ts_str).replace(tzinfo=timezone.utc)
    except:
        return None

def load_existing_ids():
    """Load existing event IDs from JSONL for dedup."""
    ids = set()
    if ACTIVITY_FILE.exists():
        try:
            for line in ACTIVITY_FILE.read_text().strip().split('\n'):
                if line:
                    event = json.loads(line)
                    ids.add(event.get('id'))
        except:
            pass
    return ids

def collect_ssh_logins(since_iso, since_dt, existing_ids):
    """Collect SSH logins and failures from journalctl."""
    events = []
    try:
        cmd = f'journalctl -u sshd -u ssh --since "{since_iso}" --no-pager -q 2>/dev/null'
        output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

        for line in output.split('\n'):
            if not line.strip():
                continue

            # Try to parse timestamp (format: "Apr 18 09:00:00 hostname sshd[pid]: message")
            parts = line.split()
            if len(parts) < 4:
                continue

            try:
                ts = datetime.strptime(f"{parts[0]} {parts[1]} {parts[2]} {datetime.now().year}",
                                      "%b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
                if ts < since_dt:
                    continue
            except:
                continue

            ts_iso = ts.isoformat()
            msg = ' '.join(parts[5:])

            # Accepted publickey
            if "Accepted publickey for" in msg:
                import re
                m = re.search(r'Accepted publickey for (\w+) from ([\d.a-f:]+)', msg)
                if m:
                    user, ip = m.groups()
                    title = f"SSH login: {user} from {ip}"
                    event_id = sha_id(ts_iso, "sshd", title)
                    if event_id not in existing_ids:
                        events.append({
                            "id": event_id, "ts": ts_iso, "category": "login", "level": "info",
                            "title": title, "detail": "publickey auth", "source": "sshd"
                        })

            # Accepted password
            elif "Accepted password for" in msg:
                import re
                m = re.search(r'Accepted password for (\w+) from ([\d.a-f:]+)', msg)
                if m:
                    user, ip = m.groups()
                    title = f"SSH login: {user} from {ip}"
                    event_id = sha_id(ts_iso, "sshd", title)
                    if event_id not in existing_ids:
                        events.append({
                            "id": event_id, "ts": ts_iso, "category": "login", "level": "info",
                            "title": title, "detail": "password auth", "source": "sshd"
                        })

            # Failed password
            elif "Failed password for" in msg:
                import re
                m = re.search(r'Failed password for.*from ([\d.a-f:]+)', msg)
                if m:
                    ip = m.group(1)
                    title = f"SSH auth failed from {ip}"
                    event_id = sha_id(ts_iso, "sshd", title)
                    if event_id not in existing_ids:
                        events.append({
                            "id": event_id, "ts": ts_iso, "category": "security", "level": "warn",
                            "title": title, "detail": "password attempt", "source": "sshd"
                        })

            # Invalid user
            elif "Invalid user" in msg:
                import re
                m = re.search(r'Invalid user (\w+) from ([\d.a-f:]+)', msg)
                if m:
                    user, ip = m.groups()
                    title = f"SSH invalid user '{user}' from {ip}"
                    event_id = sha_id(ts_iso, "sshd", title)
                    if event_id not in existing_ids:
                        events.append({
                            "id": event_id, "ts": ts_iso, "category": "security", "level": "warn",
                            "title": title, "detail": "", "source": "sshd"
                        })
    except:
        pass

    return events

def collect_package_changes(since_dt, existing_ids):
    """Collect package install/upgrade/remove from /var/log/dpkg.log."""
    events = []
    dpkg_log = Path("/var/log/dpkg.log")
    if not dpkg_log.exists():
        return events

    try:
        for line in dpkg_log.read_text().split('\n'):
            if not line.strip():
                continue

            parts = line.split()
            if len(parts) < 3:
                continue

            try:
                ts = datetime.fromisoformat(f"{parts[0]}T{parts[1]}").replace(tzinfo=timezone.utc)
                if ts < since_dt:
                    continue
            except:
                continue

            action = parts[2]
            if action not in ["install", "upgrade", "remove", "purge"]:
                continue

            if len(parts) < 4:
                continue

            pkg_info = parts[3]
            pkg_name = pkg_info.split(':')[0] if ':' in pkg_info else pkg_info

            ts_iso = ts.isoformat()

            if action == "install":
                version = parts[4] if len(parts) > 4 else ""
                title = f"Package installed: {pkg_name}"
                event_id = sha_id(ts_iso, "apt", title)
                if event_id not in existing_ids:
                    events.append({
                        "id": event_id, "ts": ts_iso, "category": "update", "level": "info",
                        "title": title, "detail": version, "source": "apt"
                    })

            elif action == "upgrade":
                old_ver = parts[4] if len(parts) > 4 else ""
                new_ver = parts[5] if len(parts) > 5 else ""
                title = f"Package upgraded: {pkg_name}"
                event_id = sha_id(ts_iso, "apt", title)
                if event_id not in existing_ids:
                    events.append({
                        "id": event_id, "ts": ts_iso, "category": "update", "level": "info",
                        "title": title, "detail": f"{old_ver} → {new_ver}", "source": "apt"
                    })

            elif action in ["remove", "purge"]:
                title = f"Package removed: {pkg_name}"
                event_id = sha_id(ts_iso, "apt", title)
                if event_id not in existing_ids:
                    events.append({
                        "id": event_id, "ts": ts_iso, "category": "update", "level": "warn",
                        "title": title, "detail": "", "source": "apt"
                    })
    except:
        pass

    return events

def collect_service_starts(since_iso, existing_ids):
    """Collect service start events from journalctl."""
    events = []

    services = [
        ("sentinel", "--user-unit", "Sentinel dashboard started"),
        ("openclaw-gateway", "--user-unit", "OpenClaw gateway started"),
        ("gitea-compose", "", "Gitea started"),
        ("docker", "", "Docker daemon started"),
    ]

    for unit, user_flag, title in services:
        try:
            if user_flag:
                cmd = f'journalctl {user_flag} {unit} --since "{since_iso}" --no-pager -q 2>/dev/null'
            else:
                cmd = f'journalctl -u {unit} --since "{since_iso}" --no-pager -q 2>/dev/null'

            output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

            if "Started" in output:
                # Extract ISO timestamp from journalctl output (last field is typically timestamp)
                lines = [l for l in output.split('\n') if l.strip() and "Started" in l]
                if lines:
                    # Use current time as approximation (journalctl -q doesn't include timestamps)
                    ts = datetime.now(timezone.utc).isoformat()
                    event_id = sha_id(ts, unit, title)
                    if event_id not in existing_ids:
                        events.append({
                            "id": event_id, "ts": ts, "category": "system", "level": "info",
                            "title": title, "detail": "", "source": unit
                        })
                        existing_ids.add(event_id)
        except:
            pass

    return events

def collect_service_failures(since_iso, existing_ids):
    """Collect service failure events."""
    events = []
    try:
        cmd = f'journalctl -p err -t systemd --since "{since_iso}" --no-pager -q 2>/dev/null'
        output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

        import re
        for line in output.split('\n'):
            if not line.strip():
                continue

            m = re.search(r'(\w+)\.service.*[Ff]ailed|[Ff]ailed.*(\w+)\.service', line)
            if m:
                svc_name = m.group(1) or m.group(2)
                ts = datetime.now(timezone.utc).isoformat()
                title = f"Service failed: {svc_name}"
                event_id = sha_id(ts, "systemd", title)
                if event_id not in existing_ids:
                    events.append({
                        "id": event_id, "ts": ts, "category": "service", "level": "error",
                        "title": title, "detail": line[-120:] if len(line) > 120 else line,
                        "source": "systemd"
                    })
                    existing_ids.add(event_id)
    except:
        pass

    return events

def collect_vault_commits(since_dt, vault_last_commit, existing_ids):
    """Collect vault commits from git."""
    events = []
    new_last_commit = vault_last_commit

    if not VAULT_PATH.exists():
        return events, vault_last_commit

    try:
        cmd = f'git -C {VAULT_PATH} log --format="%H|%aI|%s" --since="24 hours ago" 2>/dev/null'
        output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

        for line in output.split('\n'):
            if not line.strip():
                continue

            parts = line.split('|', 2)
            if len(parts) < 3:
                continue

            sha, ts_iso, subject = parts

            # Skip commits we've already seen
            if vault_last_commit and sha == vault_last_commit:
                break

            ts = parse_iso_timestamp(ts_iso)
            if ts and ts < since_dt:
                continue

            if not new_last_commit:
                new_last_commit = sha

            title = f"Vault: {subject[:80]}"
            event_id = sha_id(ts_iso, "git", title)
            if event_id not in existing_ids:
                events.append({
                    "id": event_id, "ts": ts_iso, "category": "vault", "level": "info",
                    "title": title, "detail": sha[:8], "source": "git"
                })
    except:
        pass

    return events, new_last_commit

def collect_fail2ban_bans(since_iso, existing_ids):
    """Collect fail2ban bans."""
    events = []
    try:
        cmd = f'journalctl -u fail2ban --since "{since_iso}" --no-pager -q 2>/dev/null'
        output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

        import re
        for line in output.split('\n'):
            if not line.strip():
                continue

            m = re.search(r'Ban ([\d.a-f:]+)', line)
            if m:
                ip = m.group(1)
                ts = datetime.now(timezone.utc).isoformat()
                title = f"Fail2ban banned {ip}"
                event_id = sha_id(ts, "fail2ban", title)
                if event_id not in existing_ids:
                    events.append({
                        "id": event_id, "ts": ts, "category": "security", "level": "warn",
                        "title": title, "detail": "", "source": "fail2ban"
                    })
                    existing_ids.add(event_id)
    except:
        pass

    return events

def collect_system_boots(since_iso, since_dt, existing_ids):
    """Collect system boot events."""
    events = []
    try:
        cmd = 'journalctl --list-boots --no-pager 2>/dev/null'
        output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

        for line in output.split('\n'):
            if not line.strip():
                continue

            parts = line.split()
            if len(parts) < 4:
                continue

            try:
                # Parse boot timestamp (format: "0 1234567890 ... boot timestamp")
                boot_id = parts[0]
                boot_ts_str = ' '.join(parts[2:])
                boot_ts = datetime.fromisoformat(boot_ts_str).replace(tzinfo=timezone.utc)

                if boot_ts < since_dt:
                    continue

                ts_iso = boot_ts.isoformat()
                title = "Server rebooted"
                event_id = sha_id(ts_iso, "kernel", title)
                if event_id not in existing_ids:
                    events.append({
                        "id": event_id, "ts": ts_iso, "category": "system", "level": "info",
                        "title": title, "detail": f"Boot ID: {boot_id[:8]}", "source": "kernel"
                    })
            except:
                pass
    except:
        pass

    return events

def main():
    """Main collector loop."""
    existing_ids = load_existing_ids()
    last_run_iso, vault_last_commit = load_state()

    # Determine lookback window
    if last_run_iso:
        since_dt = parse_iso_timestamp(last_run_iso)
    else:
        since_dt = datetime.now(timezone.utc) - timedelta(hours=24)

    since_iso = since_dt.isoformat()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Collect all events
    all_events = []

    all_events.extend(collect_ssh_logins(since_iso, since_dt, existing_ids))
    all_events.extend(collect_package_changes(since_dt, existing_ids))
    all_events.extend(collect_service_starts(since_iso, existing_ids))
    all_events.extend(collect_service_failures(since_iso, existing_ids))
    all_events.extend(collect_fail2ban_bans(since_iso, existing_ids))
    all_events.extend(collect_system_boots(since_iso, since_dt, existing_ids))

    vault_events, vault_last_commit = collect_vault_commits(since_dt, vault_last_commit, existing_ids)
    all_events.extend(vault_events)

    # Load existing events and merge
    existing_events = []
    if ACTIVITY_FILE.exists():
        try:
            for line in ACTIVITY_FILE.read_text().strip().split('\n'):
                if line:
                    existing_events.append(json.loads(line))
        except:
            pass

    # Combine, sort by timestamp descending, trim to MAX_EVENTS
    all_events.extend(existing_events)
    all_events.sort(key=lambda e: e['ts'], reverse=True)
    all_events = all_events[:MAX_EVENTS]

    # Write back to JSONL
    ACTIVITY_FILE.write_text('\n'.join(json.dumps(e) for e in all_events) + '\n')

    # Save state
    save_state(now_iso, vault_last_commit)

if __name__ == "__main__":
    main()
