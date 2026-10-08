
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  "https://api.elections.kalshi.com/trade-api/v2";

type KalshiMarket = {
  ticker: string;
  event_ticker?: string;
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

type KalshiEvent = {
  event_ticker: string;
  title?: string;
  subtitle?: string;
  series_ticker?: string;
  category?: string;
};

type MarketsResponse = {
  markets?: KalshiMarket[];
  cursor?: string;
};

type EventsResponse = {
  events?: KalshiEvent[];
};

async function getJSON<T>(url: string): Promise<T> {
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

  return (await response.json()) as T;
}

export async function GET() {
  try {
    // Step 1: Retrieve open Kalshi markets.
    const marketsURL = new URL(
      `${BASE_URL}/markets`
    );

    marketsURL.searchParams.set("limit", "100");
    marketsURL.searchParams.set("status", "open");

    const marketData = await getJSON<MarketsResponse>(
      marketsURL.toString()
    );

    const allMarkets = marketData.markets ?? [];

    // Step 2: Find the unique events these markets belong to.
    const eventTickers = Array.from(
      new Set(
        allMarkets
          .map((market) => market.event_ticker)
          .filter((ticker): ticker is string => Boolean(ticker))
      )
    );

    // Step 3: Fetch event details in parallel.
    const data = await getJSON<{
  event?: KalshiEvent;
}>(
  `${BASE_URL}/events/${encodeURIComponent(ticker)}`
);

return data.event ?? null;
      })
    );

    const eventMap = new Map<string, KalshiEvent>();

    eventResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        eventMap.set(result.value.event_ticker, result.value);
      }
    });

    // Step 4: Combine market and event information.
    const markets = allMarkets.map((market) => {
      const event = market.event_ticker
        ? eventMap.get(market.event_ticker)
        : undefined;

      return {
        id: market.ticker,
        ticker: market.ticker,
        eventTicker: market.event_ticker ?? null,
        title: market.title,
        question: market.title,
        subtitle: market.subtitle ?? "",
        yesSubtitle: market.yes_sub_title ?? "",
        noSubtitle: market.no_sub_title ?? "",
        eventTitle: event?.title ?? null,
        eventSubtitle: event?.subtitle ?? null,
        seriesTicker: event?.series_ticker ?? null,
        category: event?.category ?? null,
        yesBid: market.yes_bid_dollars ?? null,
        yesAsk: market.yes_ask_dollars ?? null,
        lastPrice: market.last_price_dollars ?? null,
        volume: market.volume ?? 0,
        closeTime: market.close_time ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      source: "Kalshi",
      count: markets.length,
      eventsFound: eventMap.size,
      nextPageAvailable: Boolean(marketData.cursor),
      markets,
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
