import { NextResponse } from "next/server";
import { loadConfig, saveConfig, SentinelConfig } from "@/lib/config";

export async function GET() {
  return NextResponse.json(loadConfig());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SentinelConfig;
    saveConfig(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
