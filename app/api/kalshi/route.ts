
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  "https://api.elections.kalshi.com/trade-api/v2";

const SERIES = [
  {
    ticker: "KXNFLPASSYDS",
    propType: "Passing Yards",
  },
  {
    ticker: "KXNFLRRYDS",
    propType: "Rushing + Receiving Yards",
  },
] as const;

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

type MarketOutput = {
  id: string;
  ticker: string;
  eventTicker: string | null;
  title: string;
  question: string;
  player: string;
  sport: string;
  propType: string;
  line: number;
  yesBid: string | null;
  yesAsk: string | null;
  lastPrice: string | null;
  volume: number;
  gameTime: string | null;
  closeTime: string | null;
};

async function fetchSeries(
  seriesTicker: string
): Promise<KalshiMarket[]> {
  const allMarkets: KalshiMarket[] = [];
  let cursor = "";

  for (let page = 0; page < 10; page++) {
    const url = new URL(`${BASE_URL}/markets`);

    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "open");
    url.searchParams.set(
      "series_ticker",
      seriesTicker
    );

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `${seriesTicker} returned HTTP ${response.status}`
      );
    }

    const data =
      (await response.json()) as MarketsResponse;

    allMarkets.push(...(data.markets ?? []));
    cursor = data.cursor ?? "";

    if (!cursor) break;
  }

  return allMarkets;
}

function parseMarket(
  market: KalshiMarket,
  seriesTicker: string,
  propType: string
): MarketOutput | null {
  if (
    !market.ticker.startsWith(
      `${seriesTicker}-`
    )
  ) {
    return null;
  }

  const match = market.title.match(
    /^(.+?):\s*(\d+(?:\.\d+)?)\+\s*(.+)$/i
  );

  if (!match) return null;

  const player = match[1].trim();
  const line = Number(match[2]);
  const marketDescription = match[3]
    .trim()
    .toLowerCase();

  if (
    !player ||
    !Number.isFinite(line)
  ) {
    return null;
  }

  if (
    seriesTicker === "KXNFLPASSYDS"
  ) {
    if (
      marketDescription !== "passing yards"
    ) {
      return null;
    }
  }

  if (
    seriesTicker === "KXNFLRRYDS"
  ) {
    const acceptedDescriptions = [
      "rushing and receiving yards",
      "rushing and receiving yards combined",
      "rushing + receiving yards",
      "rushing + receiving yards combined",
      "rushing & receiving yards",
      "rushing & receiving yards combined",
    ];

    if (
      !acceptedDescriptions.includes(
        marketDescription
      )
    ) {
      return null;
    }
  }

  return {
    id: market.ticker,
    ticker: market.ticker,
    eventTicker:
      market.event_ticker ?? null,
    title: market.title,
    question: market.title,
    player,
    sport: "NFL",
    propType,
    line,
    yesBid:
      market.yes_bid_dollars ?? null,
    yesAsk:
      market.yes_ask_dollars ?? null,
    lastPrice:
      market.last_price_dollars ?? null,
    volume: Number(
      market.volume_fp ?? 0
    ),
    gameTime:
      market.occurrence_datetime ?? null,
    closeTime:
      market.close_time ?? null,
  };
}

export async function GET() {
  try {
    const results =
      await Promise.allSettled(
        SERIES.map(async (series) => {
          const rawMarkets =
            await fetchSeries(
              series.ticker
            );

          return rawMarkets
            .map((market) =>
              parseMarket(
                market,
                series.ticker,
                series.propType
              )
            )
            .filter(
              (
                market
              ): market is MarketOutput =>
                market !== null
            );
        })
      );

    const markets: MarketOutput[] = [];
    const errors: string[] = [];

    results.forEach(
      (result, index) => {
        if (
          result.status === "fulfilled"
        ) {
          markets.push(
            ...result.value
          );
        } else {
          errors.push(
            `${SERIES[index].ticker}: ${
              result.reason instanceof Error
                ? result.reason.message
                : "Unable to load"
            }`
          );
        }
      }
    );

    if (
      results.every(
        (result) =>
          result.status === "rejected"
      )
    ) {
      throw new Error(
        errors.join("; ") ||
          "Unable to load Kalshi markets."
      );
    }

    const uniqueMarkets =
      Array.from(
        new Map(
          markets.map((market) => [
            market.ticker,
            market,
          ])
        ).values()
      );

    uniqueMarkets.sort(
      (a, b) =>
        b.volume - a.volume
    );

    const byPropType: Record<
      string,
      number
    > = {};

    for (
      const market of uniqueMarkets
    ) {
      byPropType[
        market.propType
      ] =
        (byPropType[
          market.propType
        ] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      source: "Kalshi",
      sport: "NFL",
      propType: "Multiple",
      seriesTickers:
        SERIES.map(
          (series) =>
            series.ticker
        ),
      count:
        uniqueMarkets.length,
      byPropType,
      markets:
        uniqueMarkets,
      warnings: errors,
      updatedAt:
        new Date().toISOString(),
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
      {
        status: 500,
      }
    );
  }
}
