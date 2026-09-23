#!/usr/bin/env python3
"""Sentinel power sampler — whole-machine power draw, measured, not guessed.

Runs as ROOT under systemd (collectors/node-power-sampler.service) because
both sensors it reads are root-only:

  * Apple SMC (applesmc driver): key PD0R is DC-in power, the total power
    entering the logic board from the internal supply. Cross-checked at
    install time against ID0R (current) x VD0R (voltage). Present on Intel
    Mac minis; absent elsewhere, in which case dc_w is null.
  * Intel RAPL (/sys/class/powercap/intel-rapl:0/energy_uj): CPU package
    energy. Root-only on current kernels (CVE-2020-8694), which is why a
    user-level reader silently gets nothing.

It writes two files and nothing else. Readers (the Sentinel dashboard, the
metrics sampler) read these files and never touch the sensors:

  /run/node-power/now.json          live reading, rewritten every INTERVAL_S
  /var/lib/node-power/minutes.jsonl one line per minute: avg/min/max watts,
                                    energy in Wh (integrated, not sampled),
                                    and seconds actually covered, so a gap
                                    (reboot, service down) is visible as
                                    missing coverage rather than zero draw.

Timestamps are epoch seconds (instants have no timezone); readers render
them in local time. Minutes older than KEEP_DAYS are pruned once a day.
"""
import json
import os
import struct
import sys
import time

SMC = "/sys/devices/platform/applesmc.768/"
RAPL = "/sys/class/powercap/intel-rapl:0/"
RUN_DIR = os.environ.get("NODE_POWER_RUN_DIR", "/run/node-power")
STATE_DIR = os.environ.get("NODE_POWER_STATE_DIR", "/var/lib/node-power")
INTERVAL_S = 2.0
KEEP_DAYS = 400

# SMC fixed-point types: spXY = signed, fraction bits = Y (hex digit).
FRAC = {"sp78": 8, "sp5a": 10, "sp4b": 11, "sp1e": 14, "sp87": 7, "sp96": 6, "sp69": 9}


class Smc:
    def __init__(self):
        self.idx = {}
        if not os.path.exists(SMC + "key_count"):
            return
        n = int(open(SMC + "key_count").read())
        for i in range(n):
            self._select(i)
            name = open(SMC + "key_at_index_name").read().strip()
            if name in ("PD0R", "ID0R", "VD0R"):
                self.idx[name] = (i, open(SMC + "key_at_index_type").read().strip())

    def _select(self, i):
        with open(SMC + "key_at_index", "w") as f:
            f.write(str(i))

    def read(self, key):
        if key not in self.idx:
            return None
        i, typ = self.idx[key]
        self._select(i)
        raw = open(SMC + "key_at_index_data", "rb").read()
        frac = FRAC.get(typ)
        if frac is None or len(raw) < 2:
            return None
        return struct.unpack(">h", raw[:2])[0] / (1 << frac)

    def dc_watts(self):
        w = self.read("PD0R")
        if w is None:
            i, v = self.read("ID0R"), self.read("VD0R")
            w = i * v if i is not None and v is not None else None
        # A negative or absurd value is a bad read, not a measurement.
        return round(w, 2) if w is not None and 0 < w < 1000 else None


class Rapl:
    def __init__(self):
        self.ok = os.path.exists(RAPL + "energy_uj")
        self.max = int(open(RAPL + "max_energy_range_uj").read()) if self.ok else 0
        self.prev = None

    def watts(self, now):
        if not self.ok:
            return None
        try:
            e = int(open(RAPL + "energy_uj").read())
        except OSError:
            return None
        prev, self.prev = self.prev, (e, now)
        if prev is None or now <= prev[1]:
            return None
        d = e - prev[0]
        if d < 0:  # counter wrapped
            d += self.max
        return round(d / 1e6 / (now - prev[1]), 2)


def write_atomic(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def prune(path, keep_days):
    cutoff = time.time() - keep_days * 86400
    try:
        with open(path) as f:
            lines = [ln for ln in f if ln.strip() and json.loads(ln).get("ts", 0) >= cutoff]
    except (OSError, ValueError):
        return
    write_atomic(path, "".join(lines))


class Minute:
    def __init__(self, start):
        self.start = start
        self.secs = 0.0
        self.dc_ws = 0.0   # watt-seconds while dc was known
        self.dc_secs = 0.0
        self.cpu_ws = 0.0
        self.cpu_secs = 0.0
        self.dc_min = None
        self.dc_max = None

    def add(self, dc, cpu, dt):
        self.secs += dt
        if dc is not None:
            self.dc_ws += dc * dt
            self.dc_secs += dt
            self.dc_min = dc if self.dc_min is None else min(self.dc_min, dc)
            self.dc_max = dc if self.dc_max is None else max(self.dc_max, dc)
        if cpu is not None:
            self.cpu_ws += cpu * dt
            self.cpu_secs += dt

    def record(self):
        r = {"ts": self.start, "secs": round(self.secs, 1)}
        if self.dc_secs:
            r.update(dc_avg=round(self.dc_ws / self.dc_secs, 2), dc_min=self.dc_min,
                     dc_max=self.dc_max, wh=round(self.dc_ws / 3600, 4))
        if self.cpu_secs:
            r["cpu_avg"] = round(self.cpu_ws / self.cpu_secs, 2)
        return r


def main():
    os.makedirs(RUN_DIR, exist_ok=True)
    os.makedirs(STATE_DIR, exist_ok=True)
    minutes = os.path.join(STATE_DIR, "minutes.jsonl")
    now_path = os.path.join(RUN_DIR, "now.json")
    smc, rapl = Smc(), Rapl()
    source = "smc:PD0R" if "PD0R" in smc.idx else ("smc:ID0R*VD0R" if smc.idx else None)
    print(f"power-sampler: dc source={source} rapl={'yes' if rapl.ok else 'no'}", flush=True)
    if source is None and not rapl.ok:
        write_atomic(now_path, json.dumps({"ts": int(time.time()), "available": False}))
        print("power-sampler: no power sensor on this machine; exiting", flush=True)
        return 0

    rapl.watts(time.time())
    last = time.time()
    cur = Minute(int(last // 60) * 60)
    last_prune_day = None
    while True:
        time.sleep(INTERVAL_S - (time.time() % INTERVAL_S))
        now = time.time()
        dt = min(now - last, INTERVAL_S * 3)  # a stalled loop must not invent energy
        last = now
        try:
            dc = smc.dc_watts() if source else None
        except OSError:
            dc = None
        cpu = rapl.watts(now)
        write_atomic(now_path, json.dumps({
            "ts": round(now, 1), "available": True, "dc_w": dc, "cpu_w": cpu,
            "source": source, "interval_s": INTERVAL_S,
        }))
        start = int(now // 60) * 60
        if start != cur.start:
            if cur.secs > 0:
                with open(minutes, "a") as f:
                    f.write(json.dumps(cur.record()) + "\n")
                os.chmod(minutes, 0o644)
            cur = Minute(start)
            day = time.strftime("%Y-%m-%d")
            if day != last_prune_day:
                prune(minutes, KEEP_DAYS)
                last_prune_day = day
        cur.add(dc, cpu, dt)


if __name__ == "__main__":
    sys.exit(main())
