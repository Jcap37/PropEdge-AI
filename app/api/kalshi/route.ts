import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type KalshiMarket = {
  ticker: string;
  title: string;
  subtitle?: string;
  status?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume?: number;
  close_time?: string;
};

export async function GET() {
  try {
    const url =
      "https://api.elections.kalshi.com/trade-api/v2/markets?limit=100&status=open";

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Kalshi API returned ${response.status}`
      );
    }

    const data = await response.json();

    const markets: KalshiMarket[] = data.markets ?? [];

    return NextResponse.json({
      success: true,
      source: "Kalshi",
      count: markets.length,
      markets: markets.map((market) => ({
        ticker: market.ticker,
        title: market.title,
        subtitle: market.subtitle,
        status: market.status,
        yesBid: market.yes_bid_dollars,
        yesAsk: market.yes_ask_dollars,
        lastPrice: market.last_price_dollars,
        volume: market.volume,
        closeTime: market.close_time,
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
            : "Unable to retrieve Kalshi markets",
      },
      { status: 500 }
    );
  }
}
