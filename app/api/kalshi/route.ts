
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  "https://api.elections.kalshi.com/trade-api/v2";

// Keep the two series we already know work.
const KNOWN_SERIES = [
  "KXNFLPASSYDS",
  "KXNFLRRYDS",
];

const MAX_SERIES_TO_FETCH = 40;
const MAX_PAGES_PER_SERIES = 5;
const PAGE_SIZE = 200;
const BATCH_SIZE = 5;

type KalshiSeries = {
  ticker: string;
  title?: string;
  category?: string;
  tags?: string[] | null;
};

type SeriesResponse = {
  series?: KalshiSeries[];
};

type KalshiMarket = {
  ticker: string;
  event_ticker?: string;
  title: string;
  rules_primary?: string;
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
  line: number | null;
  yesBid: string | null;
  yesAsk: string | null;
  lastPrice: string | null;
  volume: number;
  gameTime: string | null;
  closeTime: string | null;
};

const PROP_PATTERNS: {
  name: string;
  pattern: RegExp;
}[] = [
  {
    name: "Passing Yards",
    pattern: /\bpassing yards\b/i,
  },
  {
    name: "Passing Touchdowns",
    pattern: /\b(?:passing touchdowns?|touchdown passes?)\b/i,
  },
  {
    name: "Pass Completions",
    pattern: /\b(?:pass completions?|completed passes)\b/i,
  },
  {
    name: "Pass Attempts",
    pattern: /\bpass attempts?\b/i,
  },
  {
    name: "Interceptions",
    pattern: /\binterceptions? thrown\b|\bthrow an interception\b/i,
  },
  {
    name: "Longest Completion",
    pattern: /\b(?:longest pass|longest completion)\b/i,
  },
  {
    name: "Passing + Rushing Yards",
    pattern:
      /\b(?:passing and rushing|passing \+ rushing|passing & rushing)\s+yards\b/i,
  },
  {
    name: "Rushing + Receiving Yards",
    pattern:
      /\b(?:rushing and receiving|rushing \+ receiving|rushing & receiving)\s+yards\b/i,
  },
  {
    name: "Rushing Yards",
    pattern: /\brushing yards\b/i,
  },
  {
    name: "Rushing Attempts",
    pattern: /\b(?:rushing attempts?|carries)\b/i,
  },
  {
    name: "Longest Rush",
    pattern: /\blongest rush\b/i,
  },
  {
    name: "Receiving Yards",
    pattern: /\breceiving yards\b/i,
  },
  {
    name: "Receptions",
    pattern: /\b(?:receptions?|catches)\b/i,
  },
  {
    name: "Targets",
    pattern: /\btargets\b/i,
  },
  {
    name: "Longest Reception",
    pattern: /\blongest reception\b/i,
  },
  {
    name: "Anytime Touchdown",
    pattern: /\b(?:anytime|any time)\s+touchdown\b/i,
  },
  {
    name: "First Touchdown",
    pattern: /\bfirst touchdown\b/i,
  },
  {
    name: "Last Touchdown",
    pattern: /\blast touchdown\b/i,
  },
  {
    name: "Touchdowns Scored",
    pattern:
      /\b(?:touchdowns? scored|total touchdowns?)\b/i,
  },
  {
    name: "Kicking Points",
    pattern: /\bkicking points\b/i,
  },
  {
    name: "Field Goals Made",
    pattern: /\bfield goals? made\b/i,
  },
  {
    name: "Field Goal Attempts",
    pattern: /\bfield goal attempts?\b/i,
  },
  {
    name: "Longest Field Goal",
    pattern: /\blongest field goal\b/i,
  },
  {
    name: "Extra Points Made",
    pattern: /\b(?:extra points? made|pats? made)\b/i,
  },
];

function detectPropType(
  text: string
): string | null {
  for (const prop of PROP_PATTERNS) {
    if (prop.pattern.test(text)) {
      return prop.name;
    }
  }

  return null;
}

function isNFLSeries(
  series: KalshiSeries
): boolean {
  const ticker = series.ticker.toUpperCase();
  const title = series.title ?? "";
  const tags = (series.tags ?? []).join(" ");

  // Strongly prefer NFL-specific series.
  if (ticker.startsWith("KXNFL")) {
    return true;
  }

  return /\bNFL\b|\bpro football\b/i.test(
    `${title} ${tags}`
  );
}

function isPlayerPropSeries(
  series: KalshiSeries
): boolean {
  const title = series.title ?? "";

  if (
    KNOWN_SERIES.includes(
      series.ticker.toUpperCase()
    )
  ) {
    return true;
  }

  // Exclude obvious team/game outcome markets.
  if (
    /\b(?:winner|moneyline|spread|game total|division winner|super bowl winner|champion)\b/i.test(
      title
    )
  ) {
    return false;
  }

  // Series names may describe the stat differently.
  return (
    detectPropType(title) !== null ||
    /\b(?:player|touchdown scorer|pass|rush|receiv|reception|interception|completion|field goal|kicking|yards|attempts)\b/i.test(
      title
    )
  );
}

async function discoverSeries(): Promise<
  KalshiSeries[]
> {
  const url = new URL(`${BASE_URL}/series`);

  url.searchParams.set("category", "Sports");
  url.searchParams.set("tags", "Football");

  const response = await fetch(url.toString(), {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(
      `Series discovery returned HTTP ${response.status}`
    );
  }

  const data =
    (await response.json()) as SeriesResponse;

  const discovered = (data.series ?? [])
    .filter(isNFLSeries)
    .filter(isPlayerPropSeries);

  const byTicker = new Map<
    string,
    KalshiSeries
  >();

  // Prioritize our already-working series.
  for (const ticker of KNOWN_SERIES) {
    byTicker.set(ticker, {
      ticker,
      title: ticker,
    });
  }

  for (const series of discovered) {
    const ticker = series.ticker.toUpperCase();

    if (!byTicker.has(ticker)) {
      byTicker.set(ticker, series);
    }
  }

  return Array.from(byTicker.values()).slice(
    0,
    MAX_SERIES_TO_FETCH
  );
}

async function fetchMarketsForSeries(
  seriesTicker: string
): Promise<KalshiMarket[]> {
  const allMarkets: KalshiMarket[] = [];
  let cursor = "";

  for (
    let page = 0;
    page < MAX_PAGES_PER_SERIES;
    page++
  ) {
    const url = new URL(`${BASE_URL}/markets`);

    url.searchParams.set(
      "series_ticker",
      seriesTicker
    );
    url.searchParams.set("status", "open");
    url.searchParams.set(
      "limit",
      String(PAGE_SIZE)
    );

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `${seriesTicker}: HTTP ${response.status}`
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
  series: KalshiSeries
): MarketOutput | null {
  const ticker = series.ticker.toUpperCase();

  if (
    !market.ticker
      .toUpperCase()
      .startsWith(`${ticker}-`)
  ) {
    return null;
  }

  const title = market.title ?? "";

  // Standard player milestone:
  // "Joe Burrow: 250+ passing yards"
  // "Omarion Hampton: 100+ rushing and
  // receiving yards combined"
  const milestoneMatch = title.match(
    /^(.+?):\s*(\d+(?:\.\d+)?)\+\s*(.+)$/i
  );

  // Also accept formats such as:
  // "Player: 2+ touchdowns"
  // "Player: to score a touchdown"
  const playerMatch = title.match(
    /^([^:]+):\s*(.+)$/i
  );

  if (!playerMatch) {
    return null;
  }

  const player = playerMatch[1].trim();

  if (!player) {
    return null;
  }

  const description = milestoneMatch
    ? milestoneMatch[3].trim()
    : playerMatch[2].trim();

  const combinedText = [
    description,
    series.title ?? "",
    market.rules_primary ?? "",
  ].join(" ");

  let propType = detectPropType(description);

  if (!propType) {
    propType = detectPropType(
      series.title ?? ""
    );
  }

  if (!propType) {
    propType = detectPropType(
      market.rules_primary ?? ""
    );
  }

  // Handle touchdown markets that may not
  // use our standard stat descriptions.
  if (
    !propType &&
    /\b(?:score|scored|scoring)\b.*\btouchdown\b|\btouchdown\b.*\b(?:score|scored|scoring)\b/i.test(
      combinedText
    )
  ) {
    propType = "Touchdowns Scored";
  }

  if (!propType) {
    return null;
  }

  // Prefer the explicitly stated milestone.
  // For non-milestone markets, leave the line
  // null instead of inventing a threshold.
  const line = milestoneMatch
    ? Number(milestoneMatch[2])
    : null;

  if (
    line !== null &&
    !Number.isFinite(line)
  ) {
    return null;
  }

  return {
    id: market.ticker,
    ticker: market.ticker,
    eventTicker:
      market.event_ticker ?? null,
    title,
    question: title,
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
    const warnings: string[] = [];

    let series: KalshiSeries[];

    try {
      series = await discoverSeries();
    } catch (error) {
      warnings.push(
        `Series discovery failed: ${
          error instanceof Error
            ? error.message
            : "Unknown error"
        }`
      );

      // Fall back to the existing two series.
      series = KNOWN_SERIES.map((ticker) => ({
        ticker,
        title: ticker,
      }));
    }

    const markets: MarketOutput[] = [];
    const successfulSeries: string[] = [];

    // Fetch in small batches to avoid sending
    // too many simultaneous Kalshi requests.
    for (
      let i = 0;
      i < series.length;
      i += BATCH_SIZE
    ) {
      const batch = series.slice(
        i,
        i + BATCH_SIZE
      );

      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const rawMarkets =
            await fetchMarketsForSeries(
              item.ticker
            );

          return rawMarkets
            .map((market) =>
              parseMarket(market, item)
            )
            .filter(
              (
                market
              ): market is MarketOutput =>
                market !== null
            );
        })
      );

      results.forEach((result, index) => {
        const ticker = batch[index].ticker;

        if (result.status === "fulfilled") {
          successfulSeries.push(ticker);
          markets.push(...result.value);
        } else {
          warnings.push(
            `${ticker}: ${
              result.reason instanceof Error
                ? result.reason.message
                : "Unable to load"
            }`
          );
        }
      });
    }

    if (successfulSeries.length === 0) {
      throw new Error(
        "Could not load any Kalshi series."
      );
    }

    // Remove duplicate markets.
    const uniqueMarkets = Array.from(
      new Map(
        markets.map((market) => [
          market.ticker,
          market,
        ])
      ).values()
    );

    uniqueMarkets.sort(
      (a, b) => b.volume - a.volume
    );

    const byPropType: Record<
      string,
      number
    > = {};

    for (const market of uniqueMarkets) {
      byPropType[market.propType] =
        (byPropType[market.propType] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      source: "Kalshi",
      sport: "NFL",
      propType: "Multiple",
      seriesTickers: successfulSeries,
      discoveredSeriesCount: series.length,
      count: uniqueMarkets.length,
      byPropType,
      markets: uniqueMarkets,
      warnings,
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
