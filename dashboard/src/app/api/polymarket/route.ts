import { NextResponse } from "next/server";

const GAMMA_API = "https://gamma-api.polymarket.com";

export async function GET() {
  try {
    const res = await fetch(
      `${GAMMA_API}/markets?limit=50&active=true&closed=false&order=volume24hr&ascending=false`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Polymarket API ${res.status}` }, { status: res.statusText ? 502 : 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch" }, { status: 500 });
  }
}
