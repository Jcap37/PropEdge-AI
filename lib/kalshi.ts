
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
  occurrence_datetime?: string;
  close_time?: string;
};

type MarketsResponse = {
  markets?: KalshiMarket[];
  cursor?: string;
};

export async function getKalshiMarkets() {
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
        `Kalshi returned HTTP ${response.status}`
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
        /^.+:\s*\d+\+\s*passing yards$/i.test(
          market.title
        )
    )
    .map((market) => {
      const match = market.title.match(
        /^(.+?):\s*(\d+)\+\s*passing yards$/i
      );

      return {
        id: market.ticker,
        ticker: market.ticker,
        eventTicker:
          market.event_ticker ?? null,
        title: market.title,
        question: market.title,
        player: match?.[1] ?? "",
        sport: "NFL",
        propType: "Passing Yards",
        line: match ? Number(match[2]) : null,
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
    });

  markets.sort(
    (a, b) => b.volume - a.volume
  );

  return {
    success: true,
    source: "Kalshi",
    sport: "NFL",
    propType: "Passing Yards",
    seriesTicker: SERIES_TICKER,
    count: markets.length,
    markets,
    updatedAt: new Date().toISOString(),
  };
}
