#!/usr/bin/env python3
"""Sentinel metrics sampler.

Runs once per minute from cron and appends one JSON line to metrics.jsonl:
CPU (total + per logical core), memory, swap, load, CPU temperature
(package + cores), fan RPM, CPU package power (RAPL), network and disk
I/O rates. Rates are computed against the previous run's counters held
in .metrics-state.json, so each sample is a true 1-minute average.

Retention: the log is trimmed in place to MAX_LINES (7 days at 1/min)
whenever it grows past the trim threshold. Silent on partial data:
missing sensors produce nulls, never a crash.
"""

import json
import os
import time

BASE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(BASE, "metrics.jsonl")
STATE = os.path.join(BASE, ".metrics-state.json")
MAX_LINES = 10080          # 7 days at one sample/minute
TRIM_AT = MAX_LINES + 400


def read_file(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return None


def cpu_jiffies():
    """Return {'cpu': (idle, total), 'cpu0': ...} from /proc/stat."""
    out = {}
    raw = read_file("/proc/stat") or ""
    for line in raw.splitlines():
        if not line.startswith("cpu"):
            continue
        parts = line.split()
        name = parts[0]
        vals = [int(v) for v in parts[1:]]
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)  # idle + iowait
        out[name] = (idle, sum(vals))
    return out


def cpu_usage(prev, now):
    if not prev:
        return None
    d_total = now[1] - prev[1]
    d_idle = now[0] - prev[0]
    if d_total <= 0:
        return None
    return round(100 * (1 - d_idle / d_total), 1)


def meminfo():
    raw = read_file("/proc/meminfo") or ""
    kv = {}
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            kv[parts[0].rstrip(":")] = int(parts[1]) * 1024
    total = kv.get("MemTotal", 0)
    available = kv.get("MemAvailable", 0)
    used = total - available
    swap_total = kv.get("SwapTotal", 0)
    swap_used = swap_total - kv.get("SwapFree", 0)
    return {
        "mem_used": used,
        "mem_total": total,
        "mem_pct": round(100 * used / total, 1) if total else None,
        "swap_pct": round(100 * swap_used / swap_total, 1) if swap_total else 0,
    }


def sensors_data():
    """CPU package/core temps and fan RPM from `sensors -j`."""
    import subprocess
    try:
        raw = subprocess.run(
            ["sensors", "-j"], capture_output=True, text=True, timeout=10
        ).stdout
        data = json.loads(raw)
    except Exception:
        return {"temp": None, "cores": [], "fan": None}

    temp, cores, fan = None, [], None
    core = data.get("coretemp-isa-0000", {})
    for key, val in core.items():
        if not isinstance(val, dict):
            continue
        inp = next((v for k, v in val.items() if k.endswith("_input")), None)
        if inp is None:
            continue
        if key.startswith("Package"):
            temp = inp
        elif key.startswith("Core"):
            cores.append(inp)
    for chip in data.values():
        if not isinstance(chip, dict):
            continue
        for sensor in chip.values():
            if not isinstance(sensor, dict):
                continue
            for k, v in sensor.items():
                if k.startswith("fan") and k.endswith("_input") and fan is None:
                    fan = round(v)
    return {"temp": temp, "cores": cores, "fan": fan}


def net_counters(iface):
    raw = read_file("/proc/net/dev") or ""
    for line in raw.splitlines():
        if line.strip().startswith(iface + ":"):
            parts = line.split(":")[1].split()
            return int(parts[0]), int(parts[8])  # rx_bytes, tx_bytes
    return None


def disk_counters(dev):
    raw = read_file("/proc/diskstats") or ""
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) > 9 and parts[2] == dev:
            return int(parts[5]) * 512, int(parts[9]) * 512  # read, written bytes
    return None


def default_iface():
    raw = read_file("/proc/net/route") or ""
    for line in raw.splitlines()[1:]:
        parts = line.split()
        if len(parts) > 1 and parts[1] == "00000000":
            return parts[0]
    return None


def rate(prev, now, dt):
    if prev is None or now is None or dt <= 0 or now < prev:
        return None
    return round((now - prev) / dt)


def main():
    now_ts = time.time()

    try:
        with open(STATE) as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}

    dt = now_ts - state.get("ts", 0)
    jif = cpu_jiffies()
    prev_jif = {k: tuple(v) for k, v in state.get("cpu", {}).items()}

    iface = default_iface() or "wlp2s0"
    net = net_counters(iface)
    disk_dev = state.get("disk_dev") or "sda"
    disk = disk_counters(disk_dev)
    rapl = read_file("/sys/class/powercap/intel-rapl:0/energy_uj")
    rapl = int(rapl) if rapl else None
    sens = sensors_data()
    mem = meminfo()
    load1 = os.getloadavg()[0]

    per_core = []
    i = 0
    while f"cpu{i}" in jif:
        per_core.append(cpu_usage(prev_jif.get(f"cpu{i}"), jif[f"cpu{i}"]))
        i += 1

    power = None
    prev_rapl = state.get("rapl")
    if rapl is not None and prev_rapl is not None and dt > 0 and rapl > prev_rapl:
        power = round((rapl - prev_rapl) / 1_000_000 / dt, 1)
    # RAPL is root-only on current kernels, so this user usually reads nothing
    # above. The root power sampler (collectors/power-sampler.py) publishes the
    # same CPU figure plus whole-machine DC-in; read it from there.
    dc_w = None
    try:
        with open("/run/node-power/now.json") as f:
            pw = json.load(f)
        if pw.get("available") and now_ts - pw.get("ts", 0) < 15:
            if power is None and pw.get("cpu_w") is not None:
                power = round(pw["cpu_w"], 1)
            dc_w = pw.get("dc_w")
    except (OSError, ValueError):
        pass

    sample = {
        "ts": int(now_ts),
        "cpu": cpu_usage(prev_jif.get("cpu"), jif["cpu"]),
        "cores": per_core,
        "load1": round(load1, 2),
        "mem_pct": mem["mem_pct"],
        "mem_used": mem["mem_used"],
        "swap_pct": mem["swap_pct"],
        "temp": sens["temp"],
        "temp_cores": sens["cores"],
        "fan": sens["fan"],
        "power_w": power,
        "dc_w": dc_w,
        "rx_rate": rate(state.get("rx"), net[0] if net else None, dt),
        "tx_rate": rate(state.get("tx"), net[1] if net else None, dt),
        "disk_read_rate": rate(state.get("disk_r"), disk[0] if disk else None, dt),
        "disk_write_rate": rate(state.get("disk_w"), disk[1] if disk else None, dt),
    }

    # First run has no deltas — still record the levels (temp, mem) so the
    # series starts immediately.
    with open(LOG, "a") as f:
        f.write(json.dumps(sample, separators=(",", ":")) + "\n")

    with open(STATE, "w") as f:
        json.dump(
            {
                "ts": now_ts,
                "cpu": {k: list(v) for k, v in jif.items()},
                "rx": net[0] if net else None,
                "tx": net[1] if net else None,
                "disk_r": disk[0] if disk else None,
                "disk_w": disk[1] if disk else None,
                "rapl": rapl,
                "disk_dev": disk_dev,
            },
            f,
        )

    # Retention trim (atomic replace)
    try:
        with open(LOG) as f:
            lines = f.readlines()
        if len(lines) > TRIM_AT:
            tmp = LOG + ".tmp"
            with open(tmp, "w") as f:
                f.writelines(lines[-MAX_LINES:])
            os.replace(tmp, LOG)
    except OSError:
        pass


if __name__ == "__main__":
    main()
