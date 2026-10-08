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

export async function GET() {
  try {
    const url =
      "https://api.elections.kalshi.com/trade-api/v2/markets?limit=1000&status=open";

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

    const allMarkets: KalshiMarket[] =
      data.markets ?? [];

    // Preliminary filter for NFL player statistics.
    const playerPropTerms =
      /passing|rushing|receiving|receptions|touchdown|interceptions|completions|pass yards|rush yards|rec yards/i;

    const nflTerms =
      /NFL|football|passing|rushing|receiving|Dak Prescott|Tyson Bagent/i;

    const markets = allMarkets.slice(0, 50);
      const text = [
        market.title,
        market.subtitle,
        market.yes_sub_title,
        market.no_sub_title,
        market.ticker,
      ].join(" ");

      return (
        playerPropTerms.test(text) &&
        nflTerms.test(text)
      );
    });

    return NextResponse.json({
      success: true,
      source: "Kalshi",
      sport: "NFL",
      sampleMarkets: allMarkets.slice(0, 10).map((market) => ({
  ticker: market.ticker,
  title: market.title,
  subtitle: market.subtitle,
})),
      count: markets.length,
      scanned: allMarkets.length,
      nextPageAvailable: Boolean(data.cursor),
      markets: markets.map((market) => ({
        ticker: market.ticker,
        title: market.title,
        subtitle: market.subtitle,
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
