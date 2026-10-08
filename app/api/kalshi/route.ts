import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type KalshiMarket = {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume?: number;
  close_time?: string;
};

type KalshiResponse = {
  markets?: KalshiMarket[];
  cursor?: string;
};

export async function GET() {
  try {
    const url = new URL(
      "https://api.elections.kalshi.com/trade-api/v2/markets"
    );

    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "open");

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Kalshi API returned status ${response.status}`
      );
    }

    const data: KalshiResponse = await response.json();

    const allMarkets = data.markets ?? [];

    // Temporary test: return the first 50 markets.
    // We will add NFL-specific filtering afterward.
    const markets = allMarkets.slice(0, 50);

    return NextResponse.json({
      success: true,
      source: "Kalshi",
      count: markets.length,
      scanned: allMarkets.length,
      nextPageAvailable: Boolean(data.cursor),

      markets: markets.map((market) => ({
        id: market.ticker,
        ticker: market.ticker,
        title: market.title,
        question: market.title,
        subtitle: market.subtitle ?? "",
        status: market.status ?? "",
        yesBid: market.yes_bid_dollars ?? null,
        yesAsk: market.yes_ask_dollars ?? null,
       lastPrice: market.last_price_dollars ?? null,
        volume: market.volume ?? 0,
        closeTime: market.close_time ?? null,
      })),

      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        source: "Kalshi",
        count: 0,
        markets: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to retrieve Kalshi markets",
      },
      { status: 500 }
    );
  }
}
