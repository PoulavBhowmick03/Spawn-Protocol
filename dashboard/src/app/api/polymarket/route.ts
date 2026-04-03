import { NextResponse } from "next/server";
import { getCached, setCache } from "@/lib/server-client";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CACHE_KEY = "polymarket";
const CACHE_TTL = 30_000;

export async function GET() {
  const cached = getCached<any>(CACHE_KEY);
  try {
    const res = await fetch(
      `${GAMMA_API}/markets?limit=50&active=true&closed=false&order=volume24hr&ascending=false`,
      {
        next: { revalidate: 30 },
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) {
      if (cached) return NextResponse.json(cached);
      return NextResponse.json({ error: `Polymarket API ${res.status}` }, { status: res.statusText ? 502 : 502 });
    }
    const data = await res.json();
    setCache(CACHE_KEY, data, CACHE_TTL);
    return NextResponse.json(data);
  } catch (err: any) {
    if (cached) {
      return NextResponse.json(cached);
    }
    return NextResponse.json({ error: err?.message || "Failed to fetch" }, { status: 500 });
  }
}
