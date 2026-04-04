import { NextResponse } from "next/server";
import { readRegisteredDAOs } from "@/lib/dao-onboarding-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ daos: readRegisteredDAOs() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to read registered DAOs" },
      { status: 500 }
    );
  }
}
