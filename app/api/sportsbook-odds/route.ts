
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT = "americanfootball_nfl";

const BOOKMAKERS = "draftkings,fanduel";

const CACHE_SECONDS = 30 * 60;
const MAX_GAMES = 16;

const MARKETS = [
  "player_pass_yds",
  "player_rush_yds",
  "player_reception_yds",
  "player_receptions",
  "player_rush_reception_yds",
  "player_pass_yds_alternate",
  "player_rush_yds_alternate",
  "player_reception_yds_alternate",
  "player_receptions_alternate",
  "player_rush_reception_yds_alternate",
];

const MARKET_LABELS: Record<string, string> = {
  player_pass_yds: "Passing Yards",
  player_rush_yds: "Rushing Yards",
  player_reception_yds: "Receiving Yards",
  player_receptions: "Receptions",
  player_rush_reception_yds: "Rushing + Receiving Yards",
  player_pass_yds_alternate: "Passing Yards",
  player_rush_yds_alternate: "Rushing Yards",
  player_reception_yds_alternate: "Receiving Yards",
  player_receptions_alternate: "Receptions",
  player_rush_reception_yds_alternate:
    "Rushing + Receiving Yards",
};

type EventData = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
};

type Outcome = {
  name: string;
  description?: string;
  price: number;
  point?: number;
};

type OddsMarket = {
  key: string;
  last_update?: string;
  outcomes: Outcome[];
};

type Bookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsMarket[];
};

type EventOdds = EventData & {
  bookmakers?: Bookmaker[];
};

type PlayerLine = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  player: string;
  propType: string;
  bookmaker: string;
  bookmakerKey: string;
  marketType: "main" | "alternate";
  line: number;
  overOdds: number | null;
  underOdds: number | null;
  lastUpdate: string | null;
};

type EventFailure = {
  eventId: string;
  matchup: string;
  error: string;
};

type OddsResult = {
  success: true;
  source: string;
  sport: string;
  bookmakersRequested: string[];
  eventsAvailable: number;
  eventsRequested: number;
  eventsSucceeded: number;
  eventsFailed: number;
  eventFailures: EventFailure[];
  count: number;
  mainLineCount: number;
  alternateLineCount: number;
  mainLines: PlayerLine[];
  alternateLines: PlayerLine[];
  updatedAt: string;
};

type CacheEntry = {
  expiresAt: number;
  result: OddsResult;
};

const globalCache = globalThis as typeof globalThis & {
  __propEdgeOddsCache?: Map<string, CacheEntry>;
};

const oddsCache =
  globalCache.__propEdgeOddsCache ??
  new Map<string, CacheEntry>();

globalCache.__propEdgeOddsCache = oddsCache;

function safeErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return (
      "The Odds API rejected the request. " +
      "Check the API key, plan, and available credits."
    );
  }

  if (status === 404) {
    return "The requested NFL event or market was not found.";
  }

  if (status === 422) {
    return "The Odds API rejected one or more requested markets.";
  }

  if (status === 429) {
    return "The Odds API rate limit was reached.";
  }

  return `The Odds API returned HTTP ${status}.`;
}

async function requestOdds<T>(
  path: string,
  apiKey: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);

  url.searchParams.set("apiKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(safeErrorMessage(response.status));
  }

  return (await response.json()) as T;
}

function extractLines(event: EventOdds): PlayerLine[] {
  const lines: PlayerLine[] = [];

  for (const bookmaker of event.bookmakers ?? []) {
    if (
      bookmaker.key !== "draftkings" &&
      bookmaker.key !== "fanduel"
    ) {
      continue;
    }

    for (const market of bookmaker.markets ?? []) {
      const propType = MARKET_LABELS[market.key];

      if (!propType) continue;

      const marketType = market.key.endsWith("_alternate")
        ? "alternate"
        : "main";

      const grouped = new Map<
        string,
        {
          player: string;
          line: number;
          overOdds: number | null;
          underOdds: number | null;
        }
      >();

      for (const outcome of market.outcomes ?? []) {
        if (
          !outcome.description ||
          typeof outcome.point !== "number" ||
          !Number.isFinite(outcome.point)
        ) {
          continue;
        }

        if (
          outcome.name !== "Over" &&
          outcome.name !== "Under"
        ) {
          continue;
        }

        const player = outcome.description.trim();
        const key =
          `${player.toLowerCase()}|${outcome.point}`;

        const existing = grouped.get(key) ?? {
          player,
          line: outcome.point,
          overOdds: null,
          underOdds: null,
        };

        if (outcome.name === "Over") {
          existing.overOdds = outcome.price;
        } else {
          existing.underOdds = outcome.price;
        }

        grouped.set(key, existing);
      }

      for (const item of grouped.values()) {
        lines.push({
          eventId: event.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          gameTime: event.commence_time,
          player: item.player,
          propType,
          bookmaker: bookmaker.title,
          bookmakerKey: bookmaker.key,
          marketType,
          line: item.line,
          overOdds: item.overOdds,
          underOdds: item.underOdds,
          lastUpdate:
            market.last_update ??
            bookmaker.last_update ??
            null,
        });
      }
    }
  }

  return lines;
}

function createEmptyResult(
  eventsAvailable: number,
  eventsRequested: number
): OddsResult {
  return {
    success: true,
    source: "The Odds API",
    sport: "NFL",
    bookmakersRequested: [
      "DraftKings",
      "FanDuel",
    ],
    eventsAvailable,
    eventsRequested,
    eventsSucceeded: 0,
    eventsFailed: 0,
    eventFailures: [],
    count: 0,
    mainLineCount: 0,
    alternateLineCount: 0,
    mainLines: [],
    alternateLines: [],
    updatedAt: new Date().toISOString(),
  };
}

async function fetchSportsbookOdds(
  apiKey: string,
  gameLimit: number,
  requestedEventId: string | null
): Promise<OddsResult> {
  const events = await requestOdds<EventData[]>(
    `/sports/${SPORT}/events`,
    apiKey
  );

  if (!Array.isArray(events)) {
    throw new Error("Invalid NFL events response.");
  }

  const upcoming = events
    .filter(
      (event) =>
        new Date(event.commence_time).getTime() >
        Date.now()
    )
    .sort(
      (a, b) =>
        new Date(a.commence_time).getTime() -
        new Date(b.commence_time).getTime()
    );

  let selectedEvents: EventData[];

  if (requestedEventId) {
    selectedEvents = upcoming.filter(
      (event) => event.id === requestedEventId
    );
  } else {
    selectedEvents = upcoming.slice(0, gameLimit);
  }

  const result = createEmptyResult(
    upcoming.length,
    selectedEvents.length
  );

  if (selectedEvents.length === 0) {
    return result;
  }

  // Limit simultaneous requests to avoid overloading
  // the odds provider.
  const CONCURRENCY = 3;

  const allLines: PlayerLine[] = [];

  for (
    let start = 0;
    start < selectedEvents.length;
    start += CONCURRENCY
  ) {
    const batch = selectedEvents.slice(
      start,
      start + CONCURRENCY
    );

    const responses = await Promise.allSettled(
      batch.map((event) =>
        requestOdds<EventOdds>(
          `/sports/${SPORT}/events/${encodeURIComponent(
            event.id
          )}/odds`,
          apiKey,
          {
            bookmakers: BOOKMAKERS,
            markets: MARKETS.join(","),
            oddsFormat: "american",
            dateFormat: "iso",
          }
        )
      )
    );

    for (let index = 0; index < responses.length; index++) {
      const response = responses[index];
      const event = batch[index];

      if (response.status === "fulfilled") {
        result.eventsSucceeded++;

        allLines.push(
          ...extractLines(response.value)
        );
      } else {
        result.eventsFailed++;

        result.eventFailures.push({
          eventId: event.id,
          matchup:
            `${event.away_team} at ${event.home_team}`,
          error:
            response.reason instanceof Error
              ? response.reason.message
              : "Unable to retrieve event odds.",
        });
      }
    }
  }

  result.mainLines = allLines.filter(
    (line) => line.marketType === "main"
  );

  result.alternateLines = allLines.filter(
    (line) => line.marketType === "alternate"
  );

  result.mainLineCount = result.mainLines.length;
  result.alternateLineCount =
    result.alternateLines.length;

  result.count = allLines.length;

  return result;
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.ODDS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ODDS_API_KEY is not configured in Vercel.",
        },
        { status: 503 }
      );
    }

    const requestedEventId =
      request.nextUrl.searchParams.get("eventId");

    const rawGames =
      request.nextUrl.searchParams.get("games");

    const parsedGames = rawGames
      ? Number(rawGames)
      : 1;

    if (
      !Number.isInteger(parsedGames) ||
      parsedGames < 1 ||
      parsedGames > MAX_GAMES
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `games must be a whole number between 1 and ${MAX_GAMES}.`,
        },
        { status: 400 }
      );
    }

    const cacheKey = requestedEventId
      ? `event:${requestedEventId}`
      : `games:${parsedGames}`;

    const cached = oddsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(
        {
          ...cached.result,
          cached: true,
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    const result = await fetchSportsbookOdds(
      apiKey,
      parsedGames,
      requestedEventId
    );

    // Avoid caching partial failures as if they were
    // complete successful odds snapshots.
    if (result.eventsFailed === 0) {
      oddsCache.set(cacheKey, {
        expiresAt:
          Date.now() + CACHE_SECONDS * 1000,
        result,
      });
    }

    return NextResponse.json(
      {
        ...result,
        cached: false,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Sportsbook odds API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to retrieve sportsbook odds.",
      },
      { status: 500 }
    );
  }
}
