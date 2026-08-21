import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { isAllowedModel, DEFAULT_MODEL_ID } from "@/lib/browser-agent-models";
import { loadConfig } from "@/lib/config";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configurable via sentinel.config.json (browserAgent.agentScript); defaults
// to ~/browser-agent/run.sh for a conventional install.
const AGENT_SCRIPT =
  loadConfig().browserAgent?.agentScript ||
  path.join(os.homedir(), "browser-agent", "run.sh");
const MAX_TASK_LEN = 2000;
const TOKENS_PREFIX = "[[TOKENS]] ";

export async function POST(req: NextRequest) {
  let body: { task?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const task = typeof body.task === "string" ? body.task.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : DEFAULT_MODEL_ID;

  if (!task) return new Response("empty task", { status: 400 });
  if (task.length > MAX_TASK_LEN) return new Response("task too long", { status: 400 });
  if (!isAllowedModel(model)) return new Response("model not allowed", { status: 400 });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: string) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${data.replace(/\n/g, "\\n")}\n\n`));
      };

      send("meta", JSON.stringify({ model, startedAt: Date.now() }));

      // `detached: true` makes the child a new process-group leader so that
      // `process.kill(-pid, ...)` reaches every descendant (bash → python → chromium).
      const child = spawn(AGENT_SCRIPT, [task], {
        env: { ...process.env, BROWSER_USE_MODEL_PRIMARY: model },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

      let buf = "";
      const flush = (chunk: string) => {
        buf += chunk;
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line) continue;
          if (line.startsWith(TOKENS_PREFIX)) {
            send("tokens", line.slice(TOKENS_PREFIX.length));
          } else {
            send("log", line);
          }
        }
      };

      child.stdout.on("data", (d: Buffer) => flush(d.toString("utf8")));
      child.stderr.on("data", (d: Buffer) => flush(d.toString("utf8")));

      const killTree = (sig: NodeJS.Signals) => {
        if (child.pid === undefined) return;
        try {
          // Negative pid = entire process group.
          process.kill(-child.pid, sig);
        } catch {
          try { child.kill(sig); } catch { /* already gone */ }
        }
      };

      req.signal.addEventListener("abort", () => {
        killTree("SIGTERM");
        // Escalate if the group hasn't exited within 2s.
        setTimeout(() => killTree("SIGKILL"), 2000);
      });

      child.on("close", (code) => {
        if (buf) send("log", buf);
        send("done", JSON.stringify({ exitCode: code }));
        controller.close();
      });

      child.on("error", (err) => {
        send("error", err.message);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
