import { NextRequest, NextResponse } from "next/server";

const CONTROL_URL = (
  process.env.SPAWN_CONTROL_URL || "http://localhost:8787"
).replace(/\/$/, "");

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${CONTROL_URL}/dao/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: any) {
    const msg = err?.message || "Control server unreachable";
    const isTimeout = msg.includes("timeout") || msg.includes("abort");
    return NextResponse.json(
      { error: isTimeout ? "Control server timed out" : `Control server error: ${msg}` },
      { status: 502 }
    );
  }
}
