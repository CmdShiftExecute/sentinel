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
MAX_EVENTS = 2000


def _load_sentinel_config() -> dict:
    """Load sentinel.config.json from project root, return empty dict on failure."""
    cfg_path = _HERE / "sentinel.config.json"
    try:
        if cfg_path.exists():
            return json.loads(cfg_path.read_text())
    except Exception:
        pass
    return {}


_SENTINEL_CONFIG = _load_sentinel_config()

# Primary knowledge base vault (Obsidian/etc.)
# Priority: env var > sentinel.config.json > empty (no default hardcoded path)
_cfg_vault = _SENTINEL_CONFIG.get("vault", {}).get("primaryPath", "")
VAULT_PATH = Path(os.environ.get("SENTINEL_VAULT_PATH", _cfg_vault)) if (os.environ.get("SENTINEL_VAULT_PATH") or _cfg_vault) else Path("")

# Additional knowledge base app auto-detection candidates
# Format: (directory_path, display_label, detection_marker)
# detection_marker: a file/dir that confirms the app is actually installed there
_HOME = Path.home()
KB_CANDIDATES = [
    (_HOME / "logseq",                             "Logseq",   None),
    (_HOME / "Documents" / "logseq",               "Logseq",   None),
    (_HOME / "Obsidian",                            "Obsidian", None),
    (_HOME / "Documents" / "Obsidian",              "Obsidian", None),
    (_HOME / "foam",                                "Foam",     None),
    (_HOME / "Documents" / "foam",                  "Foam",     None),
    (_HOME / "org",                                 "Org-mode", None),  # Emacs org-mode
    (Path(os.environ.get("SENTINEL_KB_PATH", "")),  "Notes",    None),  # user override
]

# AI agent / automation tool auto-detection candidates
# Format: (directory_path, display_label)
AGENT_CANDIDATES = [
    (_HOME / ".openclaw",                    "OpenClaw"),
    (_HOME / ".n8n",                         "n8n"),
    (_HOME / "Auto-GPT",                     "Auto-GPT"),
    (_HOME / "autogpt",                      "Auto-GPT"),
    (_HOME / ".config" / "superagi",         "SuperAGI"),
    (_HOME / "anything-llm",                 "AnythingLLM"),
    (_HOME / ".config" / "open-webui",       "Open WebUI"),
    (_HOME / ".homeassistant",               "Home Assistant"),
    (_HOME / "home-assistant",               "Home Assistant"),
    (_HOME / "homeassistant",                "Home Assistant"),
    (_HOME / "openinterpreter",              "Open Interpreter"),
    (_HOME / ".config" / "continue",         "Continue.dev"),
    (_HOME / "gpt-engineer",                 "GPT Engineer"),
    (_HOME / "agentgpt",                     "AgentGPT"),
    (_HOME / ".local" / "share" / "crewai",  "CrewAI"),
]

# Config file extensions worth tracking in agent dirs (non-git)
AGENT_CONFIG_EXTS = {".json", ".yaml", ".yml", ".toml", ".conf", ".ini"}
AGENT_SKIP_DIRS = {"node_modules", "__pycache__", ".cache", "logs", "tmp", "temp", "dist", ".git"}

# Directories to skip when scanning for loose markdown files
MD_SKIP_DIRS = {"node_modules", "__pycache__", ".cache", "tmp", "temp", "dist", ".git",
                ".npm", ".nvm", ".cargo", ".rustup", ".pyenv", "vendor", "venv", ".venv"}


def sha_id(ts_str, source, title):
    """Generate short MD5 hash for dedup."""
    msg = f"{ts_str}|{source}|{title}"
    return hashlib.md5(msg.encode()).hexdigest()[:12]


def load_state():
    """Load persisted state: last_run, vault_last_commit, git_last_commits dict."""
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
            return (
                data.get("last_run"),
                data.get("vault_last_commit"),
                data.get("git_last_commits", {}),
            )
        except:
            pass
    return None, None, {}


def save_state(last_run, vault_last_commit, git_last_commits):
    """Save state file."""
    STATE_FILE.write_text(json.dumps({
        "last_run": last_run,
        "vault_last_commit": vault_last_commit,
        "git_last_commits": git_last_commits,
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


# ---------------------------------------------------------------------------
# Existing collectors (unchanged)
# ---------------------------------------------------------------------------

def collect_ssh_logins(since_iso, since_dt, existing_ids):
    """Collect SSH logins and failures from journalctl."""
    events = []
    try:
        cmd = f'journalctl -u sshd -u ssh --since "{since_iso}" --no-pager -q 2>/dev/null'
        output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

        for line in output.split('\n'):
            if not line.strip():
                continue

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

    watch_units = _SENTINEL_CONFIG.get("services", {}).get("watchUnits", [])
    if watch_units:
        services = [
            (u["unit"], "--user-unit" if u.get("userUnit") else "", u.get("label", u["unit"] + " started"))
            for u in watch_units
            if u.get("unit")
        ]
    else:
        services = [
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
                lines = [l for l in output.split('\n') if l.strip() and "Started" in l]
                if lines:
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


# ---------------------------------------------------------------------------
# Knowledge base (vault/Obsidian/Logseq/etc.) collectors
# ---------------------------------------------------------------------------

def _git_commits_since(repo_path, since_dt, last_commit, label, category, existing_ids):
    """Collect git commits from a repo since since_dt. Returns (events, new_last_sha)."""
    events = []
    new_last = last_commit

    try:
        since_str = since_dt.strftime("%Y-%m-%dT%H:%M:%S")
        cmd = f'git -C "{repo_path}" log --format="%H|%aI|%s" --since="{since_str}" 2>/dev/null'
        output = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

        first_sha = None
        for line in output.split('\n'):
            if not line.strip():
                continue
            parts = line.split('|', 2)
            if len(parts) < 3:
                continue
            sha, ts_iso, subject = parts

            if not first_sha:
                first_sha = sha

            if last_commit and sha == last_commit:
                break

            ts = parse_iso_timestamp(ts_iso)
            if ts and ts < since_dt:
                continue

            title = f"{label}: {subject[:75]}"
            event_id = sha_id(ts_iso, f"{category}-{label.lower()}", title)
            if event_id not in existing_ids:
                events.append({
                    "id": event_id, "ts": ts_iso, "category": category, "level": "info",
                    "title": title, "detail": sha[:8], "source": label.lower()
                })

        if first_sha:
            new_last = first_sha
    except:
        pass

    return events, new_last


def collect_vault_commits(since_dt, vault_last_commit, existing_ids):
    """Collect commits from the primary vault (SENTINEL_VAULT_PATH)."""
    if not VAULT_PATH or not str(VAULT_PATH) or not VAULT_PATH.exists():
        return [], vault_last_commit

    events, new_last = _git_commits_since(
        VAULT_PATH, since_dt, vault_last_commit, "Vault", "vault", existing_ids
    )
    return events, new_last


def collect_knowledge_base_commits(since_dt, git_last_commits, existing_ids):
    """Collect commits from auto-detected knowledge base apps (Logseq, Foam, etc.).
    Excludes the primary VAULT_PATH (already handled by collect_vault_commits).
    """
    events = []
    new_git_last_commits = dict(git_last_commits)

    seen_paths = {str(VAULT_PATH)}

    for path, label, _ in KB_CANDIDATES:
        if not path or not path.exists() or not path.is_dir():
            continue
        if str(path) in seen_paths:
            continue
        seen_paths.add(str(path))

        # Only track if it's a git repo
        if not (path / ".git").exists():
            continue

        repo_key = f"kb:{path}"
        last_commit = git_last_commits.get(repo_key)
        new_events, new_last = _git_commits_since(
            path, since_dt, last_commit, label, "vault", existing_ids
        )
        events.extend(new_events)
        if new_last:
            new_git_last_commits[repo_key] = new_last

    return events, new_git_last_commits


# ---------------------------------------------------------------------------
# Git repo collector (non-vault repos → "git" category)
# ---------------------------------------------------------------------------

def collect_git_repos(since_dt, git_last_commits, existing_ids):
    """Collect commits from git repos in the home dir (auto-detected or via env var).
    Excludes vault paths. Category: 'git'.
    Set SENTINEL_GIT_REPOS=path1:path2 to override auto-detection.
    """
    events = []
    new_git_last_commits = dict(git_last_commits)

    # Build exclusion set: vault paths should not appear here
    excluded = {str(VAULT_PATH)}
    for path, _, _ in KB_CANDIDATES:
        if path and path.exists():
            excluded.add(str(path))

    repos = []

    # Explicit override via env var
    env_repos = os.environ.get("SENTINEL_GIT_REPOS", "")
    if env_repos:
        for p in env_repos.split(":"):
            path = Path(p.strip())
            if path.exists() and (path / ".git").exists() and str(path) not in excluded:
                repos.append((path.name, path))
    else:
        # Auto-scan home dir top-level directories for .git
        try:
            for item in sorted(_HOME.iterdir()):
                if not item.is_dir():
                    continue
                if item.name.startswith('.'):
                    continue  # skip hidden dirs (handled by agent detection)
                if str(item) in excluded:
                    continue
                if (item / ".git").exists():
                    repos.append((item.name, item))
        except:
            pass

    for repo_name, repo_path in repos:
        repo_key = f"git:{repo_path}"
        last_commit = git_last_commits.get(repo_key)
        new_events, new_last = _git_commits_since(
            repo_path, since_dt, last_commit, repo_name, "git", existing_ids
        )
        events.extend(new_events)
        if new_last:
            new_git_last_commits[repo_key] = new_last

    return events, new_git_last_commits


# ---------------------------------------------------------------------------
# AI agent / automation tool collector → "agent" category
# ---------------------------------------------------------------------------

def collect_agent_changes(since_dt, existing_ids):
    """Detect and track changes in AI agent / automation tool directories.
    - Git-tracked agent dirs: collect commits.
    - Non-git agent dirs: detect recently modified config files.
    Category: 'agent'.
    """
    events = []

    # Remove duplicates (e.g. two Home Assistant entries) — first match wins
    seen_labels = set()
    seen_paths = set()
    active_agents = []
    for path, label in AGENT_CANDIDATES:
        if not path.exists() or not path.is_dir():
            continue
        path_str = str(path)
        if path_str in seen_paths:
            continue
        if label in seen_labels:
            continue
        seen_labels.add(label)
        seen_paths.add(path_str)
        active_agents.append((path, label))

    for agent_path, agent_label in active_agents:
        if (agent_path / ".git").exists():
            # Git-tracked: collect commits
            new_events, _ = _git_commits_since(
                agent_path, since_dt, None, agent_label, "agent", existing_ids
            )
            events.extend(new_events)
        else:
            # Non-git: detect recently modified config files
            try:
                changed = []
                for item in agent_path.rglob("*"):
                    if not item.is_file():
                        continue
                    if item.suffix not in AGENT_CONFIG_EXTS:
                        continue
                    # Skip junk directories
                    if any(skip in item.parts for skip in AGENT_SKIP_DIRS):
                        continue
                    try:
                        mtime = datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc)
                        if mtime >= since_dt:
                            changed.append(item.name)
                    except:
                        pass

                if changed:
                    ts = datetime.now(timezone.utc).isoformat()
                    count = len(changed)
                    title = f"{agent_label}: {count} config file{'s' if count > 1 else ''} modified"
                    detail = ", ".join(sorted(set(changed))[:5])
                    # Dedup at minute resolution to avoid duplicate events per 5-min run
                    event_id = sha_id(ts[:16], f"agent-{agent_label.lower()}", title)
                    if event_id not in existing_ids:
                        events.append({
                            "id": event_id, "ts": ts, "category": "agent", "level": "info",
                            "title": title, "detail": detail, "source": agent_label.lower()
                        })
            except:
                pass

    return events


# ---------------------------------------------------------------------------
# Loose markdown file collector → "vault" category
# ---------------------------------------------------------------------------

def collect_markdown_files(since_dt, existing_ids):
    """Scan for .md files modified since since_dt across the home directory.
    Excludes paths already tracked by vault/KB collectors.
    Groups changes by parent directory — one event per dir — to avoid flooding.
    Category: 'vault'.
    """
    events = []

    # Build set of already-tracked path prefixes to exclude
    excluded_prefixes = {str(VAULT_PATH)}
    for path, _, _ in KB_CANDIDATES:
        if path and path.exists():
            excluded_prefixes.add(str(path))

    def is_excluded(p: Path) -> bool:
        s = str(p)
        return any(s == ep or s.startswith(ep + "/") for ep in excluded_prefixes)

    # Walk home dir, collect changed .md files grouped by parent dir
    dir_files: dict = {}  # parent_dir_str → list of filenames
    try:
        for root, dirs, files in os.walk(_HOME):
            root_path = Path(root)

            # Prune skip dirs in-place
            dirs[:] = [
                d for d in dirs
                if d not in MD_SKIP_DIRS and not (root_path == _HOME and d.startswith('.'))
            ]

            if is_excluded(root_path):
                dirs.clear()
                continue

            for fname in files:
                if not fname.endswith(".md"):
                    continue
                fpath = root_path / fname
                try:
                    mtime = datetime.fromtimestamp(fpath.stat().st_mtime, tz=timezone.utc)
                    if mtime >= since_dt:
                        key = str(root_path)
                        dir_files.setdefault(key, []).append(fname)
                except:
                    pass
    except:
        pass

    for dir_str, filenames in dir_files.items():
        dir_path = Path(dir_str)
        try:
            rel = dir_path.relative_to(_HOME)
            display = f"~/{rel}"
        except ValueError:
            display = dir_str

        count = len(filenames)
        if count == 1:
            title = f"Markdown: {filenames[0]}"
        else:
            title = f"Markdown: {count} files in {display}"

        detail = display if count == 1 else ", ".join(sorted(filenames)[:5])
        ts = datetime.now(timezone.utc).isoformat()
        event_id = sha_id(ts[:16], f"md:{dir_str}", title)
        if event_id not in existing_ids:
            events.append({
                "id": event_id, "ts": ts, "category": "vault", "level": "info",
                "title": title, "detail": detail, "source": "markdown"
            })

    return events


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    """Main collector loop."""
    existing_ids = load_existing_ids()
    last_run_iso, vault_last_commit, git_last_commits = load_state()

    # Determine lookback window
    if last_run_iso:
        since_dt = parse_iso_timestamp(last_run_iso)
    else:
        since_dt = datetime.now(timezone.utc) - timedelta(hours=24)

    since_iso = since_dt.isoformat()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    all_events = []

    all_events.extend(collect_ssh_logins(since_iso, since_dt, existing_ids))
    all_events.extend(collect_package_changes(since_dt, existing_ids))
    all_events.extend(collect_service_starts(since_iso, existing_ids))
    all_events.extend(collect_service_failures(since_iso, existing_ids))
    all_events.extend(collect_fail2ban_bans(since_iso, existing_ids))
    all_events.extend(collect_system_boots(since_iso, since_dt, existing_ids))

    # Knowledge base (primary vault)
    vault_events, vault_last_commit = collect_vault_commits(since_dt, vault_last_commit, existing_ids)
    all_events.extend(vault_events)

    # Knowledge base (additional auto-detected apps: Logseq, Foam, etc.)
    kb_events, git_last_commits = collect_knowledge_base_commits(since_dt, git_last_commits, existing_ids)
    all_events.extend(kb_events)

    # Git repos (non-vault: auto-detected or SENTINEL_GIT_REPOS)
    git_events, git_last_commits = collect_git_repos(since_dt, git_last_commits, existing_ids)
    all_events.extend(git_events)

    # AI agents / automation tools
    all_events.extend(collect_agent_changes(since_dt, existing_ids))

    # Loose markdown files (system-wide, excluding vault/KB paths)
    all_events.extend(collect_markdown_files(since_dt, existing_ids))

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
    save_state(now_iso, vault_last_commit, git_last_commits)


if __name__ == "__main__":
    main()
