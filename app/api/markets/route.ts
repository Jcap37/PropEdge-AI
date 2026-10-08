import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(
      "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=20",
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Polymarket API returned ${response.status}`
      );
    }

    const markets = await response.json();

    return NextResponse.json({
      success: true,
      source: "Polymarket",
      count: markets.length,
      markets: markets.map((market: any) => ({
        id: market.id,
        question: market.question,
        outcomes: market.outcomes,
        outcomePrices: market.outcomePrices,
        volume: market.volume,
        liquidity: market.liquidity,
      })),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch markets",
      },
      { status: 500 }
    );
  }
}
