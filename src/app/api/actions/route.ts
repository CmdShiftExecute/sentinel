import { NextRequest, NextResponse } from "next/server";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import os from "os";

const exec = promisify(execCb);
const PLATFORM = os.platform();

export async function POST(req: NextRequest) {
  const { action } = await req.json();

  if (!["reboot", "shutdown"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Determine the command based on platform
  let cmd: string;
  if (PLATFORM === "darwin") {
    cmd = action === "reboot"
      ? "sudo shutdown -r now"
      : "sudo shutdown -h now";
  } else {
    // Linux — prefer systemctl, fall back to shutdown
    cmd = action === "reboot"
      ? "sudo systemctl reboot || sudo shutdown -r now"
      : "sudo systemctl poweroff || sudo shutdown -h now";
  }

  try {
    await exec(cmd, { timeout: 10000 });
    return NextResponse.json({ ok: true, message: `${action} initiated` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // Permission denied is the most common issue
    if (msg.includes("password") || msg.includes("Permission") || msg.includes("not permitted")) {
      return NextResponse.json(
        { error: "Permission denied. Configure passwordless sudo for shutdown commands. See docs." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
