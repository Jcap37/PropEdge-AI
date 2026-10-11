
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import {
  getNFLStats,
  type NFLPlayerGame,
} from "../../../lib/nfl-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_SECONDS = 6 * 60 * 60;

const GITHUB_OWNER = "Jcap37";
const GITHUB_REPO = "PropEdge-AI";
const GITHUB_BRANCH = "main";
const PUBLISHED_PATH = "data/published-research.json";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const ODDS_SPORT = "americanfootball_nfl";

const MAX_GAMES_TO_ANALYZE = 8;
const MAX_CANDIDATES_FOR_AI = 20;
const MAX_RECOMMENDATIONS = 5;

const BOOKMAKERS = "draftkings,fanduel";

type SupportedProp =
  | "Passing Yards"
  | "Rushing Yards"
  | "Receiving Yards"
  | "Receptions"
  | "Rushing + Receiving Yards";

type Side = "Over" | "Under";

type Verdict =
  | "worth_researching"
  | "insufficient_evidence";

const CATEGORIES: SupportedProp[] = [
  "Passing Yards",
  "Rushing Yards",
  "Receiving Yards",
  "Receptions",
  "Rushing + Receiving Yards",
];

const MARKET_LABELS: Record<string, SupportedProp> = {
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

const ODDS_MARKETS = Object.keys(MARKET_LABELS);

type EventData = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
};

type OddsOutcome = {
  name: string;
  description?: string;
  point?: number;
  price: number;
};

type OddsMarket = {
  key: string;
  last_update?: string;
  outcomes: OddsOutcome[];
};

type OddsBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsMarket[];
};

type EventOdds = EventData & {
  bookmakers?: OddsBookmaker[];
};

type SportsbookLine = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  player: string;
  propType: SupportedProp;
  bookmaker: string;
  bookmakerKey: string;
  marketType: "main" | "alternate";
  line: number;
  overOdds: number | null;
  underOdds: number | null;
  lastUpdate: string | null;
};

type DisplayLine = {
  bookmaker: string;
  line: number;
  overOdds: number | null;
  underOdds: number | null;
};

type GameDetail = {
  week: number;
  value: number;
  targets: number | null;
  receptions: number | null;
  rushingYards: number | null;
  receivingYards: number | null;
  passingYards: number | null;
};

type Candidate = {
  ticker: string;
  player: string;
  propType: SupportedProp;
  line: number;
  side: Side;
  odds: number;
  bookmaker: string;
  bookmakerKey: string;
  source: "Sportsbook";
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  lastOddsUpdate: string | null;
  sportsbookLines: DisplayLine[];
  alternateLines: DisplayLine[];
  recentValues: number[];
  recentWeeks: number[];
  gameDetails: GameDetail[];
  sampleSize: number;
  average: number;
  historicalHits: number;
  historicalHitRate: number;
  differenceFromLine: number;
  marketVolume: number;
  evidenceNotes: string[];
  opportunityVerified: boolean;
};

type Recommendation = Candidate & {
  verdict: Verdict;
  reason: string;
  risks: string;
};

type OddsSnapshot = {
  lines: SportsbookLine[];
  eventsAvailable: number;
  eventsRequested: number;
  eventsSucceeded: number;
  eventsFailed: number;
  failures: string[];
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function round(value: number): number {
  return Number(value.toFixed(1));
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.ANALYZE_ADMIN_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!secret || !provided) return false;

  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(provided, "utf8");

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

function statForProp(
  game: NFLPlayerGame,
  prop: SupportedProp
): number | null {
  switch (prop) {
    case "Passing Yards":
      return numericValue(game.passingYards);

    case "Rushing Yards":
      return numericValue(game.rushingYards);

    case "Receiving Yards":
      return numericValue(game.receivingYards);

    case "Receptions":
      return numericValue(game.receptions);

    case "Rushing + Receiving Yards": {
      const rushing = numericValue(game.rushingYards);
      const receiving = numericValue(game.receivingYards);

      return rushing !== null && receiving !== null
        ? rushing + receiving
        : null;
    }
  }
}

function historicalHit(
  value: number,
  line: number,
  side: Side
): boolean {
  return side === "Over"
    ? value > line
    : value < line;
}

function getOddsForSide(
  line: SportsbookLine,
  side: Side
): number | null {
  return side === "Over"
    ? line.overOdds
    : line.underOdds;
}

function candidateScore(candidate: Candidate): number {
  const hitRate =
    candidate.historicalHitRate / 100;

  const sampleFactor =
    Math.min(candidate.sampleSize / 5, 1);

  const relativeDifference =
    Math.max(
      0,
      candidate.differenceFromLine /
        Math.max(Math.abs(candidate.line), 1)
    );

  const consistency =
    candidate.recentValues.filter(
      (value) => value > 0
    ).length / candidate.sampleSize;

  return (
    hitRate * 0.45 +
    sampleFactor * 0.2 +
    Math.min(relativeDifference, 1) * 0.2 +
    consistency * 0.15
  );
}

function safeOddsError(status: number): string {
  if (status === 401 || status === 403) {
    return "Odds API key or plan was rejected.";
  }

  if (status === 422) {
    return "The Odds API rejected a requested market.";
  }

  if (status === 429) {
    return "Odds API rate limit reached.";
  }

  return `Odds API HTTP ${status}.`;
}

async function oddsRequest<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ODDS_API_KEY is not configured."
    );
  }

  const url = new URL(`${ODDS_BASE}${path}`);

  url.searchParams.set("apiKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(safeOddsError(response.status));
  }

  return (await response.json()) as T;
}

function extractSportsbookLines(
  event: EventOdds
): SportsbookLine[] {
  const lines: SportsbookLine[] = [];

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
          !Number.isFinite(outcome.point) ||
          !Number.isFinite(outcome.price)
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
          `${normalizeName(player)}|${outcome.point}`;

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

async function fetchSportsbookSnapshot(): Promise<OddsSnapshot> {
  const events = await oddsRequest<EventData[]>(
    `/sports/${ODDS_SPORT}/events`
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

  const selected = upcoming.slice(
    0,
    MAX_GAMES_TO_ANALYZE
  );

  const snapshot: OddsSnapshot = {
    lines: [],
    eventsAvailable: upcoming.length,
    eventsRequested: selected.length,
    eventsSucceeded: 0,
    eventsFailed: 0,
    failures: [],
  };

  for (
    let start = 0;
    start < selected.length;
    start += 3
  ) {
    const batch = selected.slice(start, start + 3);

    const responses = await Promise.allSettled(
      batch.map((event) =>
        oddsRequest<EventOdds>(
          `/sports/${ODDS_SPORT}/events/${encodeURIComponent(
            event.id
          )}/odds`,
          {
            bookmakers: BOOKMAKERS,
            markets: ODDS_MARKETS.join(","),
            oddsFormat: "american",
            dateFormat: "iso",
          }
        )
      )
    );

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      const event = batch[i];

      if (response.status === "fulfilled") {
        snapshot.eventsSucceeded++;

        snapshot.lines.push(
          ...extractSportsbookLines(response.value)
        );
      } else {
        snapshot.eventsFailed++;

        snapshot.failures.push(
          `${event.away_team} at ${event.home_team}: ` +
            (response.reason instanceof Error
              ? response.reason.message
              : "Unknown odds error")
        );
      }
    }
  }

  return snapshot;
}

function selectDiverseCandidates(
  candidates: Candidate[],
  limit: number
): Candidate[] {
  const ranked = [...candidates].sort(
    (a, b) =>
      candidateScore(b) - candidateScore(a)
  );

  const selected: Candidate[] = [];
  const seenPlayers = new Set<string>();

  function add(candidate: Candidate): boolean {
    const key = normalizeName(candidate.player);

    if (seenPlayers.has(key)) return false;

    seenPlayers.add(key);
    selected.push(candidate);

    return true;
  }

  for (const category of CATEGORIES) {
    const best = ranked.find(
      (candidate) =>
        candidate.propType === category &&
        candidate.historicalHitRate >= 60 &&
        !seenPlayers.has(
          normalizeName(candidate.player)
        )
    );

    if (best && selected.length < limit) {
      add(best);
    }
  }

  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    add(candidate);
  }

  return selected;
}

function fallbackRecommendation(
  candidate: Candidate
): Recommendation {
  return {
    ...candidate,
    verdict: "insufficient_evidence",
    reason:
      `${candidate.player} averaged ${candidate.average} ` +
      `${candidate.propType.toLowerCase()} across ` +
      `${candidate.sampleSize} recent recorded games. ` +
      `The ${candidate.side.toLowerCase()} ${candidate.line} ` +
      `result occurred ${candidate.historicalHits} times. ` +
      `The quoted ${candidate.bookmaker} price was ` +
      `${candidate.odds > 0 ? "+" : ""}${candidate.odds}.`,
    risks:
      "This is a small historical sample. Playing time, " +
      "rushing attempts, injuries, opponent defense, " +
      "and expected value have not been verified.",
  };
}

function buildEvidenceNotes(
  games: NFLPlayerGame[],
  prop: SupportedProp,
  values: number[]
): string[] {
  const notes: string[] = [];

  const zeroGames = values.filter(
    (value) => value === 0
  ).length;

  notes.push(
    `${zeroGames} of ${values.length} recorded games had zero ` +
      `${prop.toLowerCase()}.`
  );

  if (
    prop === "Receiving Yards" ||
    prop === "Receptions" ||
    prop === "Rushing + Receiving Yards"
  ) {
    const targets = games.map((game) =>
      numericValue(game.targets)
    );

    if (targets.every((value) => value !== null)) {
      const validTargets = targets as number[];

      const averageTargets =
        validTargets.reduce(
          (sum, value) => sum + value,
          0
        ) / validTargets.length;

      notes.push(
        `Recorded targets by recent week: ` +
          validTargets.join(", ") +
          `. Average targets: ${round(averageTargets)}.`
      );
    } else {
      notes.push(
        "Complete recent target data was not available."
      );
    }
  }

  if (
    prop === "Rushing Yards" ||
    prop === "Rushing + Receiving Yards"
  ) {
    notes.push(
      "Rushing attempts and carry share are not available " +
        "in the current stats feed."
    );
  }

  notes.push(
    "Injuries, snap counts, defensive rankings, " +
      "game spread, and game total are not verified."
  );

  return notes;
}

function passesEvidenceFilters(
  games: NFLPlayerGame[],
  prop: SupportedProp,
  values: number[]
): boolean {
  if (values.length < 4) return false;

  const positiveGames = values.filter(
    (value) => value > 0
  ).length;

  // Exclude samples dominated by zero-stat games.
  // This prevents inactive or rarely used players
  // from ranking highly based on automatic unders.
  if (positiveGames < 3) return false;

  const mostRecent = values[0];

  // Avoid players whose latest recorded game
  // provides no production evidence.
  if (mostRecent === 0) return false;

  if (
    prop === "Receiving Yards" ||
    prop === "Receptions"
  ) {
    const targets = games.map((game) =>
      numericValue(game.targets)
    );

    if (targets.some((value) => value === null)) {
      return false;
    }

    const validTargets = targets as number[];

    const targetedGames = validTargets.filter(
      (value) => value > 0
    ).length;

    const averageTargets =
      validTargets.reduce(
        (sum, value) => sum + value,
        0
      ) / validTargets.length;

    // Require actual recorded receiving opportunities.
    if (
      targetedGames < 3 ||
      averageTargets < 2 ||
      validTargets[0] === 0
    ) {
      return false;
    }
  }

  if (prop === "Rushing Yards") {
    // We cannot verify rushing attempts yet.
    // Require meaningful recorded rushing production
    // rather than automatically counting zeroes.
    const positiveRushingGames = games.filter(
      (game) =>
        (numericValue(game.rushingYards) ?? 0) > 0
    ).length;

    if (positiveRushingGames < 3) return false;
  }

  if (prop === "Rushing + Receiving Yards") {
    const activeProductionGames = games.filter(
      (game) =>
        (numericValue(game.rushingYards) ?? 0) > 0 ||
        (numericValue(game.receivingYards) ?? 0) > 0
    ).length;

    if (activeProductionGames < 3) return false;
  }

  return true;
}

async function generateAnalysis() {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured."
    );
  }

  const [snapshot, nfl] = await Promise.all([
    fetchSportsbookSnapshot(),
    getNFLStats(),
  ]);

  if (
    snapshot.eventsRequested > 0 &&
    snapshot.eventsSucceeded === 0
  ) {
    throw new Error(
      "No NFL sportsbook requests succeeded. " +
        snapshot.failures.join("; ")
    );
  }

  if (snapshot.eventsFailed > 0) {
    throw new Error(
      "Some NFL sportsbook requests failed. " +
        "Research was not published. " +
        snapshot.failures.join("; ")
    );
  }

  const playerGames = new Map<
    string,
    NFLPlayerGame[]
  >();

  for (const game of nfl.players) {
    if (
      game.season !== nfl.season ||
      game.week > nfl.latestWeek
    ) {
      continue;
    }

    const key = normalizeName(game.player);
    const existing = playerGames.get(key) ?? [];

    existing.push(game);
    playerGames.set(key, existing);
  }

  for (const games of playerGames.values()) {
    games.sort((a, b) => b.week - a.week);
  }

  const mainLines = snapshot.lines.filter(
    (line) => line.marketType === "main"
  );

  const alternateLines = snapshot.lines.filter(
    (line) => line.marketType === "alternate"
  );

  const candidates: Candidate[] = [];
  let excludedForWeakEvidence = 0;

  for (const main of mainLines) {
    const games =
      playerGames.get(normalizeName(main.player)) ?? [];

    const recent = games.slice(0, 5);

    if (recent.length < 4) continue;

    const values = recent.map((game) =>
      statForProp(game, main.propType)
    );

    if (values.some((value) => value === null)) {
      continue;
    }

    const stats = values as number[];

    if (
      !passesEvidenceFilters(
        recent,
        main.propType,
        stats
      )
    ) {
      excludedForWeakEvidence++;
      continue;
    }

    const average =
      stats.reduce(
        (sum, value) => sum + value,
        0
      ) / stats.length;

    const matchingMainLines = mainLines.filter(
      (line) =>
        line.eventId === main.eventId &&
        normalizeName(line.player) ===
          normalizeName(main.player) &&
        line.propType === main.propType
    );

    const matchingAlternates = alternateLines.filter(
      (line) =>
        line.eventId === main.eventId &&
        normalizeName(line.player) ===
          normalizeName(main.player) &&
        line.propType === main.propType
    );

    const sportsbookLines: DisplayLine[] =
      matchingMainLines.map((line) => ({
        bookmaker: line.bookmaker,
        line: line.line,
        overOdds: line.overOdds,
        underOdds: line.underOdds,
      }));

    const alternatives: DisplayLine[] =
      matchingAlternates
        .map((line) => ({
          bookmaker: line.bookmaker,
          line: line.line,
          overOdds: line.overOdds,
          underOdds: line.underOdds,
        }))
        .sort((a, b) => a.line - b.line);

    const gameDetails: GameDetail[] = recent.map(
      (game, index) => ({
        week: game.week,
        value: stats[index],
        targets: numericValue(game.targets),
        receptions: numericValue(game.receptions),
        rushingYards: numericValue(game.rushingYards),
        receivingYards: numericValue(game.receivingYards),
        passingYards: numericValue(game.passingYards),
      })
    );

    const evidenceNotes = buildEvidenceNotes(
      recent,
      main.propType,
      stats
    );

    for (const side of ["Over", "Under"] as const) {
      const odds = getOddsForSide(main, side);

      if (odds === null) continue;

      const hits = stats.filter((value) =>
        historicalHit(value, main.line, side)
      ).length;

      const directionalDifference =
        side === "Over"
          ? average - main.line
          : main.line - average;

      // Do not send historically weak or contradictory
      // candidates to OpenAI simply to fill slots.
      if (hits < 3 || directionalDifference <= 0) {
        continue;
      }

      const ticker = [
        "SPORTSBOOK",
        main.eventId,
        normalizeName(main.player),
        main.propType.replace(/\W/g, ""),
        main.bookmakerKey,
        String(main.line),
        side.toUpperCase(),
      ].join("-");

      candidates.push({
        ticker,
        player: main.player,
        propType: main.propType,
        line: main.line,
        side,
        odds,
        bookmaker: main.bookmaker,
        bookmakerKey: main.bookmakerKey,
        source: "Sportsbook",
        eventId: main.eventId,
        homeTeam: main.homeTeam,
        awayTeam: main.awayTeam,
        gameTime: main.gameTime,
        lastOddsUpdate: main.lastUpdate,
        sportsbookLines,
        alternateLines: alternatives,
        recentValues: stats,
        recentWeeks: recent.map(
          (game) => game.week
        ),
        gameDetails,
        sampleSize: stats.length,
        average: round(average),
        historicalHits: hits,
        historicalHitRate: round(
          (hits / stats.length) * 100
        ),
        differenceFromLine: round(
          directionalDifference
        ),
        marketVolume: 0,
        evidenceNotes,
        opportunityVerified:
          main.propType === "Receiving Yards" ||
          main.propType === "Receptions",
      });
    }
  }

  const bestByPlayerPropSide = new Map<
    string,
    Candidate
  >();

  for (const candidate of candidates) {
    const key = [
      candidate.eventId,
      normalizeName(candidate.player),
      candidate.propType,
      candidate.side,
    ].join("|");

    const existing = bestByPlayerPropSide.get(key);

    if (
      !existing ||
      candidateScore(candidate) >
        candidateScore(existing) ||
      (
        candidateScore(candidate) ===
          candidateScore(existing) &&
        candidate.odds > existing.odds
      )
    ) {
      bestByPlayerPropSide.set(key, candidate);
    }
  }

  const selected = selectDiverseCandidates(
    [...bestByPlayerPropSide.values()],
    MAX_CANDIDATES_FOR_AI
  );

  const candidatesByPropType: Record<
    string,
    number
  > = {};

  for (const candidate of selected) {
    candidatesByPropType[candidate.propType] =
      (candidatesByPropType[candidate.propType] ?? 0) + 1;
  }

  const baseReport = {
    success: true,
    analysisEnabled: true,
    source: {
      markets:
        "DraftKings and FanDuel via The Odds API",
      statistics: "nflverse",
      analysis: "OpenAI",
    },
    season: nfl.season,
    latestWeek: nfl.latestWeek,
    sportsbookEventsChecked:
      snapshot.eventsSucceeded,
    sportsbookEventsAvailable:
      snapshot.eventsAvailable,
    sportsbookMainLinesChecked:
      mainLines.length,
    sportsbookAlternateLinesChecked:
      alternateLines.length,
    excludedForWeakEvidence,
    candidatesReviewed: selected.length,
    candidatesByPropType,
  };

  if (selected.length === 0) {
    return {
      ...baseReport,
      recommendationsByPropType: {},
      count: 0,
      recommendations: [] as Recommendation[],
      updatedAt: new Date().toISOString(),
      message:
        "No sportsbook props passed the stronger " +
        "historical evidence requirements.",
      disclaimer:
        "Historical research is not a forecast " +
        "or guarantee of betting outcomes.",
    };
  }

  const systemPrompt = `
You are PropEdge AI, an NFL player-prop research assistant.

Analyze ONLY the supplied data.

All candidates use actual quoted sportsbook MAIN lines
from DraftKings or FanDuel.

Each candidate includes:
- Player and prop category
- Over or Under
- Main line and American odds
- Sportsbook
- Recent individual game results
- Recent week numbers
- Historical hit count
- Recorded targets for receiving props
- Other sportsbook main lines
- Available alternate lines
- Scheduled game teams and time
- Evidence limitations

IMPORTANT RULES:

1. Never invent injuries, depth chart changes,
   carry share, snap counts, defensive rankings,
   weather, game spreads, totals, or comparable
   opponents' performances.

2. Never infer rushing attempts from rushing yards.
   Rushing attempts are not supplied.

3. Recorded targets are available for some
   receiving props, but targets are not snap counts.

4. Do not call a player a starter, backup,
   injured, inactive, or promoted unless
   the supplied data establishes that fact.

5. Never describe a historical hit rate
   as a predicted win probability.

6. Never claim positive expected value without
   a validated probability model.

7. Do not describe any recommendation
   as a lock, guarantee, or sure thing.

8. Explain the individual game results and
   how they compare with the selected line.

9. For receiving props, discuss recorded
   targets when available.

10. Explain whether the player's recent
    production appears consistent or volatile.

11. Quote sportsbook odds exactly.

12. Do not substitute an alternate line
    for the main recommendation.

13. Do not claim alternate odds exist unless
    they appear in the supplied data.

14. Explain missing matchup, injury, and
    opportunity information in the risks.

15. Use "worth_researching" only if the
    historical evidence genuinely supports
    further investigation.

16. Use "insufficient_evidence" when evidence
    is weak, contradictory, or incomplete.

17. Aim for 100-160 words in the reason
    when enough verified information exists.

18. Return one evaluation for every candidate.

Return valid JSON only:

{
  "evaluations": [
    {
      "ticker": "exact ticker from input",
      "verdict": "worth_researching",
      "reason": "Evidence-based explanation",
      "risks": "Specific uncertainties"
    }
  ]
}

Allowed verdicts:
"worth_researching"
"insufficient_evidence"
`;

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: JSON.stringify({
              season: nfl.season,
              latestWeek: nfl.latestWeek,
              candidates: selected,
            }),
          },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    const details = await response.text();

    console.error(
      "OpenAI request failed:",
      response.status,
      details.slice(0, 500)
    );

    throw new Error(
      `OpenAI request failed with HTTP ${response.status}.`
    );
  }

  const aiData = await response.json();

  const content =
    aiData.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error(
      "OpenAI returned no analysis content."
    );
  }

  const parsed: unknown = JSON.parse(content);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("evaluations" in parsed) ||
    !Array.isArray(parsed.evaluations)
  ) {
    throw new Error(
      "Invalid AI analysis format."
    );
  }

  const allowed = new Map(
    selected.map((candidate) => [
      candidate.ticker,
      candidate,
    ])
  );

  const evaluated = new Map<
    string,
    Recommendation
  >();

  for (const item of parsed.evaluations) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("ticker" in item) ||
      typeof item.ticker !== "string"
    ) {
      continue;
    }

    const verified = allowed.get(item.ticker);

    if (
      !verified ||
      evaluated.has(item.ticker)
    ) {
      continue;
    }

    const verdict: Verdict =
      "verdict" in item &&
      item.verdict === "worth_researching"
        ? "worth_researching"
        : "insufficient_evidence";

    const reason =
      "reason" in item &&
      typeof item.reason === "string"
        ? item.reason
        : "Review the historical statistics.";

    const risks =
      "risks" in item &&
      typeof item.risks === "string"
        ? item.risks
        : "Player availability and matchup context are unverified.";

    evaluated.set(item.ticker, {
      ...verified,
      verdict,
      reason,
      risks,
    });
  }

  const allEvaluations: Recommendation[] =
    selected.map(
      (candidate) =>
        evaluated.get(candidate.ticker) ??
        fallbackRecommendation(candidate)
    );

  const ranked = [...allEvaluations].sort(
    (a, b) => {
      const verdictA =
        a.verdict === "worth_researching"
          ? 1
          : 0;

      const verdictB =
        b.verdict === "worth_researching"
          ? 1
          : 0;

      return (
        verdictB - verdictA ||
        candidateScore(b) - candidateScore(a)
      );
    }
  );

  const recommendations: Recommendation[] = [];
  const seenPlayers = new Set<string>();

  function addRecommendation(
    recommendation: Recommendation
  ): boolean {
    const key = normalizeName(
      recommendation.player
    );

    if (seenPlayers.has(key)) return false;

    seenPlayers.add(key);
    recommendations.push(recommendation);

    return true;
  }

  for (const category of CATEGORIES) {
    if (
      recommendations.length >=
      MAX_RECOMMENDATIONS
    ) {
      break;
    }

    const best = ranked.find(
      (item) =>
        item.propType === category &&
        item.verdict === "worth_researching" &&
        !seenPlayers.has(
          normalizeName(item.player)
        )
    );

    if (best) {
      addRecommendation(best);
    }
  }

  for (const item of ranked) {
    if (
      recommendations.length >=
      MAX_RECOMMENDATIONS
    ) {
      break;
    }

    if (
      item.verdict === "worth_researching"
    ) {
      addRecommendation(item);
    }
  }

  const recommendationsByPropType: Record<
    string,
    number
  > = {};

  for (const recommendation of recommendations) {
    recommendationsByPropType[
      recommendation.propType
    ] =
      (recommendationsByPropType[
        recommendation.propType
      ] ?? 0) + 1;
  }

  return {
    ...baseReport,
    count: recommendations.length,
    recommendationsByPropType,
    recommendations,
    updatedAt: new Date().toISOString(),
    disclaimer:
      "AI-generated research uses recent historical " +
      "results and quoted sportsbook prices. " +
      "It is not a validated forecast, an expected-value " +
      "calculation, or a guarantee of betting outcomes. " +
      "Player availability and opponent matchup factors " +
      "have not been independently verified. " +
      "Odds and availability may change.",
  };
}

// New version prevents reuse of previous analysis.
const getCachedAnalysis = unstable_cache(
  generateAnalysis,
  ["propedge-ai-analysis-v5-opportunity-filters"],
  {
    revalidate: CACHE_SECONDS,
    tags: ["propedge-ai-analysis-v5"],
  }
);

async function publishToGitHub(
  analysis: Awaited<
    ReturnType<typeof generateAnalysis>
  >
) {
  const token = process.env.GITHUB_PUBLISH_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_PUBLISH_TOKEN is not configured."
    );
  }

  const url =
    `https://api.github.com/repos/` +
    `${GITHUB_OWNER}/${GITHUB_REPO}/contents/${PUBLISHED_PATH}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const existingResponse = await fetch(
    `${url}?ref=${encodeURIComponent(
      GITHUB_BRANCH
    )}`,
    {
      headers,
      cache: "no-store",
    }
  );

  let sha: string | undefined;

  if (existingResponse.status === 200) {
    const existing: {
      sha?: string;
      content?: string;
      encoding?: string;
    } = await existingResponse.json();

    if (!existing.sha) {
      throw new Error(
        "GitHub returned a file without its SHA."
      );
    }

    sha = existing.sha;

    if (
      existing.encoding === "base64" &&
      typeof existing.content === "string"
    ) {
      const oldText = Buffer.from(
        existing.content.replace(/\s/g, ""),
        "base64"
      ).toString("utf8");

      try {
        if (
          JSON.stringify(JSON.parse(oldText)) ===
          JSON.stringify(analysis)
        ) {
          return {
            published: true,
            changed: false,
          };
        }
      } catch {
        // Replace invalid old JSON.
      }
    }
  } else if (existingResponse.status !== 404) {
    throw new Error(
      `GitHub could not read the published file ` +
      `(HTTP ${existingResponse.status}).`
    );
  }

  const content = Buffer.from(
    JSON.stringify(analysis, null, 2) + "\n",
    "utf8"
  ).toString("base64");

  const publishResponse = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message:
        "Publish improved PropEdge AI NFL research",
      content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
    cache: "no-store",
  });

  if (!publishResponse.ok) {
    throw new Error(
      `GitHub publishing failed ` +
      `(HTTP ${publishResponse.status}). ` +
      `Check token permissions and repository access.`
    );
  }

  return {
    published: true,
    changed: true,
  };
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (
      origin &&
      origin !== request.nextUrl.origin
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cross-origin analysis requests are not allowed.",
        },
        { status: 403 }
      );
    }

    const body = await request
      .json()
      .catch(() => ({}));

    if (body?.action === "health-check") {
      return NextResponse.json({
        success: true,
        message:
          "PropEdge AI backend is configured.",
        apiKeyConfigured: Boolean(
          process.env.OPENAI_API_KEY
        ),
        oddsApiConfigured: Boolean(
          process.env.ODDS_API_KEY
        ),
        analysisEnabled: true,
        authenticationRequired: true,
        cacheDurationHours: 6,
        sportsbookGamesPerAnalysis:
          MAX_GAMES_TO_ANALYZE,
        evidenceFilterVersion: 5,
      });
    }

    if (body?.action !== "analyze") {
      return NextResponse.json(
        {
          success: false,
          error:
            'Use {"action":"analyze"} to run analysis.',
        },
        { status: 400 }
      );
    }

    if (!process.env.ANALYZE_ADMIN_SECRET) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Admin authentication is not configured.",
        },
        { status: 503 }
      );
    }

    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Admin authorization required.",
        },
        { status: 401 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "OpenAI API key is not configured.",
        },
        { status: 503 }
      );
    }

    if (!process.env.ODDS_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ODDS_API_KEY is not configured.",
        },
        { status: 503 }
      );
    }

    if (!process.env.GITHUB_PUBLISH_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error:
            "GitHub publishing token is not configured.",
        },
        { status: 503 }
      );
    }

    const analysis = await getCachedAnalysis();

    try {
      const publication =
        await publishToGitHub(analysis);

      return NextResponse.json(
        {
          ...analysis,
          ...publication,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    } catch (error) {
      console.error(
        "PropEdge AI publishing error:",
        error
      );

      return NextResponse.json(
        {
          ...analysis,
          published: false,
          publishError:
            error instanceof Error
              ? error.message
              : "Publishing failed.",
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    }
  } catch (error) {
    console.error(
      "PropEdge AI analysis error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate analysis.",
      },
      { status: 500 }
    );
  }
}
