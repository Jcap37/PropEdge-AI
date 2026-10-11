
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  "https://api.elections.kalshi.com/trade-api/v2";

const SERIES_TICKER = "KXNFLPASSYDS";

type KalshiMarket = {
  ticker: string;
  event_ticker?: string;
  title: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
  floor_strike?: number;
  occurrence_datetime?: string;
  close_time?: string;
};

type MarketsResponse = {
  markets?: KalshiMarket[];
  cursor?: string;
};

export async function GET() {
  try {
    const allMarkets: KalshiMarket[] = [];
    let cursor = "";

    for (let page = 0; page < 3; page++) {
      const url = new URL(`${BASE_URL}/markets`);

      url.searchParams.set("limit", "100");
      url.searchParams.set("status", "open");
      url.searchParams.set(
        "series_ticker",
        SERIES_TICKER
      );

      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await fetch(url.toString(), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Kalshi returned ${response.status}`
        );
      }

      const data =
        (await response.json()) as MarketsResponse;

      allMarkets.push(...(data.markets ?? []));
      cursor = data.cursor ?? "";

      if (!cursor) break;
    }

    const markets = allMarkets
      .filter(
        (market) =>
          market.ticker.startsWith(
            `${SERIES_TICKER}-`
          ) &&
          /^\S.+:\s*\d+\+\s*passing yards$/i.test(
            market.title
          )
      )
      .map((market) => {
        const match = market.title.match(
          /^(.+?):\s*(\d+)\+\s*passing yards$/i
        );

        const player = match?.[1] ?? "";
        const line = match
          ? Number(match[2])
          : null;

        return {
          id: market.ticker,
          ticker: market.ticker,
          eventTicker: market.event_ticker ?? null,
          title: market.title,
          question: market.title,
          player,
          sport: "NFL",
          propType: "Passing Yards",
          line,
          yesBid: market.yes_bid_dollars ?? null,
          yesAsk: market.yes_ask_dollars ?? null,
          lastPrice:
            market.last_price_dollars ?? null,
          volume: Number(market.volume_fp ?? 0),
          gameTime:
            market.occurrence_datetime ?? null,
          closeTime: market.close_time ?? null,
        };
      });

    markets.sort((a, b) => b.volume - a.volume);

    return NextResponse.json({
      success: true,
      source: "Kalshi",
      sport: "NFL",
      propType: "Passing Yards",
      seriesTicker: SERIES_TICKER,
      count: markets.length,
      markets,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        count: 0,
        markets: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to load markets",
      },
      { status: 500 }
    );
  }
}
