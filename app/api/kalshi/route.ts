
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  "https://api.elections.kalshi.com/trade-api/v2";

// Verified series from your API response.
// Put the weekly player categories first.
const PRIORITY_SERIES = [
  "KXNFLPASSYDS",
  "KXNFLPASSTDS",
  "KXNFLRRYDS",
  "KXNFLRSHYDS",
  "KXNFLRECYDSPROT",
  "KXNFLRECPROT",
  "KXNFLRSHYDSPROT",
  "KXNFLPASSTDSPROT",
  "KXNFLPASSYDSPROT",
  "KXNFLLONGRSH",
  "KXNFLLONGFG",
  "KXNFLLADDERREC",
  "KXNFLLADDERRSHYDS",
  "KXNFLLADDERRECYDS",
];

const MAX_SERIES = 18;
const MAX_PAGES_PER_SERIES = 3;
const PAGE_SIZE = 200;

// Only fetch one series at a time to reduce
// the chance of hitting Kalshi's rate limit.
const SERIES_DELAY_MS = 350;
const MAX_RETRIES = 2;

type KalshiSeries = {
  ticker: string;
  title?: string;
  tags?: string[] | null;
};

type KalshiMarket = {
  ticker: string;
  event_ticker?: string;
  title?: string;
  subtitle?: string;
  rules_primary?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: string;
  occurrence_datetime?: string;
  close_time?: string;
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

type MarketsResponse = {
  markets?: KalshiMarket[];
  cursor?: string;
};

const PROP_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
}> = [
  {
    name: "Passing + Rushing Yards",
    pattern:
      /\bpassing\s*(?:and|\+|&)\s*rushing yards\b/i,
  },
  {
    name: "Rushing + Receiving Yards",
    pattern:
      /\brushing\s*(?:and|\+|&)\s*receiving yards\b/i,
  },
  {
    name: "Passing Touchdowns",
    pattern:
      /\bpassing touchdowns?\b|\btouchdown passes?\b/i,
  },
  {
    name: "Passing Yards",
    pattern: /\bpassing yards\b/i,
  },
  {
    name: "Pass Completions",
    pattern:
      /\bpass completions?\b|\bcompleted passes\b/i,
  },
  {
    name: "Pass Attempts",
    pattern: /\bpass attempts?\b/i,
  },
  {
    name: "Interceptions",
    pattern:
      /\binterceptions? thrown\b|\bthrow an interception\b/i,
  },
  {
    name: "Longest Completion",
    pattern:
      /\blongest (?:pass|completion)\b/i,
  },
  {
    name: "Longest Rush",
    pattern: /\blongest rush\b/i,
  },
  {
    name: "Longest Reception",
    pattern: /\blongest reception\b/i,
  },
  {
    name: "Rushing Yards",
    pattern: /\brushing yards\b/i,
  },
  {
    name: "Rushing Attempts",
    pattern:
      /\brushing attempts?\b|\bcarries\b/i,
  },
  {
    name: "Receiving Yards",
    pattern: /\breceiving yards\b/i,
  },
  {
    name: "Receptions",
    pattern:
      /\breceptions?\b|\bcatches\b/i,
  },
  {
    name: "Targets",
    pattern: /\btargets\b/i,
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
    name: "Anytime Touchdown",
    pattern:
      /\bany\s*time touchdown\b|\bto score a touchdown\b/i,
  },
  {
    name: "Touchdowns Scored",
    pattern:
      /\btouchdowns? scored\b|\btotal touchdowns?\b/i,
  },
  {
    name: "Longest Field Goal",
    pattern: /\blongest field goal\b/i,
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
    name: "Extra Points Made",
    pattern:
      /\bextra points? made\b|\bPATs? made\b/i,
  },
  {
    name: "Kicking Points",
    pattern: /\bkicking points\b/i,
  },
];

function sleep(ms: number) {
  return new Promise<void>((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function fetchJSON<T>(
  url: string,
  revalidateSeconds: number
): Promise<T> {
  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    const response = await fetch(url, {
      next: {
        revalidate: revalidateSeconds,
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryable =
      response.status === 429 ||
      response.status >= 500;

    if (
      !retryable ||
      attempt === MAX_RETRIES
    ) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const retryAfter = Number(
      response.headers.get("retry-after")
    );

    const waitMs =
      Number.isFinite(retryAfter) &&
      retryAfter > 0
        ? Math.min(retryAfter * 1000, 10000)
        : 1200 * Math.pow(2, attempt);

    await sleep(waitMs);
  }

  throw new Error("Request failed");
}

function detectPropType(
  text: string
): string | null {
  for (const item of PROP_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.name;
    }
  }

  return null;
}

function isExcludedSeries(
  ticker: string,
  title = ""
): boolean {
  const combined = `${ticker} ${title}`;

  return /SEASON|CAREER|DRAFT|RECORD|LEADER|MOST|POTY|CPOTY|DPOY|MVP|FANTASY|FFPTS|FFSEASON|FFPLAYER|TEAMYDS|T100|SUPDRAFT|CHAMPION|SUPERBOWL|SUPER BOWL/i.test(
    combined
  );
}

function isNFLSeries(
  series: KalshiSeries
): boolean {
  const ticker = series.ticker.toUpperCase();

  return (
    ticker.startsWith("KXNFL") ||
    /\bNFL\b/i.test(
      `${series.title ?? ""} ${
        (series.tags ?? []).join(" ")
      }`
    )
  );
}

function isPlayerSeries(
  series: KalshiSeries
): boolean {
  const ticker = series.ticker.toUpperCase();

  if (
    isExcludedSeries(
      ticker,
      series.title ?? ""
    )
  ) {
    return false;
  }

  if (PRIORITY_SERIES.includes(ticker)) {
    return true;
  }

  return (
    detectPropType(series.title ?? "") !==
      null ||
    /PASSYDS|PASSTDS|RSHYDS|RRYDS|RECYDS|RECPROT|LONGFG|LONGRSH|LADDERREC/i.test(
      ticker
    )
  );
}

async function discoverSeries(): Promise<
  string[]
> {
  const selected = new Set<string>(
    PRIORITY_SERIES
  );

  try {
    const url = new URL(
      `${BASE_URL}/series`
    );

    url.searchParams.set(
      "category",
      "Sports"
    );
    url.searchParams.set(
      "tags",
      "Football"
    );

    const data = await fetchJSON<{
      series?: KalshiSeries[];
    }>(url.toString(), 3600);

    for (const series of data.series ?? []) {
      if (
        isNFLSeries(series) &&
        isPlayerSeries(series)
      ) {
        selected.add(
          series.ticker.toUpperCase()
        );
      }
    }
  } catch {
    // Known weekly series remain available
    // even if discovery temporarily fails.
  }

  return Array.from(selected)
    .filter(
      (ticker) =>
        !isExcludedSeries(ticker)
    )
    .slice(0, MAX_SERIES);
}

async function fetchSeriesMarkets(
  ticker: string
): Promise<{
  markets: KalshiMarket[];
  truncated: boolean;
}> {
  const markets: KalshiMarket[] = [];
  let cursor = "";
  let truncated = false;

  for (
    let page = 0;
    page < MAX_PAGES_PER_SERIES;
    page++
  ) {
    const url = new URL(
      `${BASE_URL}/markets`
    );

    url.searchParams.set(
      "series_ticker",
      ticker
    );
    url.searchParams.set(
      "status",
      "open"
    );
    url.searchParams.set(
      "limit",
      String(PAGE_SIZE)
    );

    if (cursor) {
      url.searchParams.set(
        "cursor",
        cursor
      );
    }

    const data =
      await fetchJSON<MarketsResponse>(
        url.toString(),
        300
      );

    markets.push(
      ...(data.markets ?? [])
    );

    cursor = data.cursor ?? "";

    if (!cursor) {
      break;
    }

    if (
      page ===
      MAX_PAGES_PER_SERIES - 1
    ) {
      truncated = true;
    }

    await sleep(150);
  }

  return {
    markets,
    truncated,
  };
}

function parseMarket(
  market: KalshiMarket,
  seriesTicker: string
): MarketOutput | null {
  const title = market.title ?? "";

  if (
    !market.ticker ||
    !market.ticker
      .toUpperCase()
      .startsWith(
        `${seriesTicker.toUpperCase()}-`
      )
  ) {
    return null;
  }

  // Game props generally have a dated
  // event ticker, e.g.:
  // KXNFLPASSYDS-26OCT11CINMIA
  const eventTicker =
    market.event_ticker ?? "";

  const eventSuffix =
    eventTicker.startsWith(
      `${seriesTicker}-`
    )
      ? eventTicker.slice(
          seriesTicker.length + 1
        )
      : "";

  if (
    !/^\d{2}[A-Z]{3}\d{2}/i.test(
      eventSuffix
    )
  ) {
    return null;
  }

  // Only parse player markets with a
  // recognizable "Player: description"
  // title, to avoid team props.
  const match = title.match(
    /^([^:]+):\s*(.+)$/
  );

  if (!match) {
    return null;
  }

  const player = match[1].trim();
  const description = match[2].trim();

  if (!player || !description) {
    return null;
  }

  const milestone = description.match(
    /^(\d+(?:\.\d+)?)\+\s*(.+)$/
  );

  const statDescription = milestone
    ? milestone[2]
    : description;

  let propType =
    detectPropType(statDescription);

  // Some Kalshi series have abbreviated
  // names and different title wording.
  if (!propType) {
    const tickerTypes: Record<
      string,
      string
    > = {
      KXNFLPASSYDS: "Passing Yards",
      KXNFLPASSTDS: "Passing Touchdowns",
      KXNFLRRYDS:
        "Rushing + Receiving Yards",
      KXNFLRSHYDS: "Rushing Yards",
      KXNFLRECYDSPROT:
        "Receiving Yards",
      KXNFLRECPROT: "Receptions",
      KXNFLRSHYDSPROT:
        "Rushing Yards",
      KXNFLPASSTDSPROT:
        "Passing Touchdowns",
      KXNFLPASSYDSPROT:
        "Passing Yards",
      KXNFLLONGRSH: "Longest Rush",
      KXNFLLONGFG:
        "Longest Field Goal",
    };

    propType =
      tickerTypes[seriesTicker] ??
      null;
  }

  if (!propType) {
    return null;
  }

  const line = milestone
    ? Number(milestone[1])
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
    ) || 0,
    gameTime:
      market.occurrence_datetime ??
      null,
    closeTime:
      market.close_time ?? null,
  };
}

export async function GET() {
  try {
    const warnings: string[] = [];

    const series =
      await discoverSeries();

    const markets: MarketOutput[] = [];
    const successfulSeries: string[] = [];

    for (
      let i = 0;
      i < series.length;
      i++
    ) {
      const ticker = series[i];

      try {
        const result =
          await fetchSeriesMarkets(
            ticker
          );

        successfulSeries.push(ticker);

        if (result.truncated) {
          warnings.push(
            `${ticker}: additional pages exist beyond the fetch limit`
          );
        }

        for (
          const raw of result.markets
        ) {
          const parsed = parseMarket(
            raw,
            ticker
          );

          if (parsed) {
            markets.push(parsed);
          }
        }
      } catch (error) {
        warnings.push(
          `${ticker}: ${
            error instanceof Error
              ? error.message
              : "Unable to load"
          }`
        );
      }

      if (
        i < series.length - 1
      ) {
        await sleep(
          SERIES_DELAY_MS
        );
      }
    }

    if (
      successfulSeries.length === 0
    ) {
      throw new Error(
        "No Kalshi series could be loaded."
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
        successfulSeries,
      discoveredSeriesCount:
        series.length,
      count:
        uniqueMarkets.length,
      byPropType,
      markets:
        uniqueMarkets,
      warnings,
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
