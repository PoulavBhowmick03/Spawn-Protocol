import { NextResponse } from "next/server";
import { getJudgeReceipt } from "@/lib/judge-receipt";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const receipt = await getJudgeReceipt(runId);
    if (!receipt) {
      return NextResponse.json(
        { error: `No judge receipt found for ${runId}` },
        { status: 404 }
      );
    }
    return NextResponse.json(receipt);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load judge receipt" },
      { status: 500 }
    );
  }
}
