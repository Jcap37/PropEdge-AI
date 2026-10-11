
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured." },
        { status: 500 }
      );
    }

    // Do not accept arbitrary user-supplied statistics.
    // Verified research data will be connected here later.
    const body = await request.json().catch(() => ({}));

    if (body?.action !== "health-check") {
      return NextResponse.json(
        {
          error:
            "Player-prop analysis is not enabled yet. " +
            "Verified player statistics and prop lines " +
            "must be connected first.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "PropEdge AI backend is configured.",
      apiKeyConfigured: true,
      analysisEnabled: false,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to process request." },
      { status: 500 }
    );
  }
}
