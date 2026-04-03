import { NextResponse } from "next/server";
import { fetchStorageObject } from "@/lib/storage-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cid = searchParams.get("cid")?.trim();
    if (!cid) {
      return NextResponse.json({ error: "Missing cid query parameter" }, { status: 400 });
    }

    const payload = await fetchStorageObject(cid);
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch storage object" },
      { status: 500 }
    );
  }
}
