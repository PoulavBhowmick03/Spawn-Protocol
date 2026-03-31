import { NextResponse } from "next/server";
import { getJudgeReceipt } from "@/lib/judge-receipt";

export const dynamic = "force-dynamic";
const JUDGE_FLOW_PROXY_URL = process.env.JUDGE_FLOW_PROXY_URL?.replace(/\/$/, "");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

    if (JUDGE_FLOW_PROXY_URL) {
      const res = await fetch(
        `${JUDGE_FLOW_PROXY_URL}/receipt/${encodeURIComponent(runId)}`,
        {
          cache: "no-store",
          headers: { accept: "application/json" },
        }
      );
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const receipt = getJudgeReceipt(runId);
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
