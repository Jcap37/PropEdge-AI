
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import {
  getNFLStats,
  type NFLPlayerGame,
} from "../../../lib/nfl-stats";
import {
  getNFLDefenseStats,
  type DefensiveMatchup,
  type PositionDefensiveMatchup,
  type PlayerPosition,
} from "../../../lib/nfl-defense";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_SECONDS = 6 * 60 * 60;

const GITHUB_OWNER = "Jcap37";
const GITHUB_REPO = "PropEdge-AI";
const GITHUB_BRANCH = "main";
const PUBLISHED_PATH = "data/published-research.json";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const ODDS_SPORT = "americanfootball_nfl";

// Analyze a broader upcoming slate. Each event uses an Odds API request.
const MAX_GAMES_TO_ANALYZE = 16;
const MAX_CANDIDATES_FOR_AI = 20;
const MAX_RECOMMENDATIONS = 5;
const BOOKMAKERS = "draftkings,fanduel";

// These names correspond to the sportsbook event names.
// LA and LAR both refer to the Los Angeles Rams.
const TEAM_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams",
  LAC: "Los Angeles Chargers",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

const TEAM_ALIASES: Record<string, string> = {
  ARZ: "ARI",
  BLT: "BAL",
  CLV: "CLE",
  HST: "HOU",
  JAC: "JAX",
  KAN: "KC",
  LAR: "LA",
  OAK: "LV",
  SD: "LAC",
  STL: "LA",
  WSH: "WAS",
};

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
  playerTeam: string;
  playerTeamAbbr: string;
  teamMatchVerified: boolean;
  teamMatchSource: string;
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
  defensiveMatchup: DefensiveMatchup | null;
  playerPosition: PlayerPosition;
  positionDefensiveMatchup: PositionDefensiveMatchup | null;
  opponentTeam: string;
  // Neutral (0) when league context is missing or unsuitable.
  defensiveRankingAdjustment: number;
  defensiveComparison: string;
  opportunityVerified: boolean;
  headToHead: HeadToHeadGame[];
  longerTermGames: number;
  longerTermHits: number;
  longerTermHitRate: number | null;
};

// Actual player-vs-opponent NFL weekly results, not opposing position averages.
type HeadToHeadGame = {
  season: number;
  week: number;
  opponent: string;
  passingYards: number;
  rushingYards: number;
  receivingYards: number;
  receptions: number;
};

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchHeadToHeadSeason(season: number): Promise<Map<string, HeadToHeadGame[]>> {
  const url = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Historical season ${season} HTTP ${response.status}`);
  const rows = csvRows(await response.text());
  if (rows.length < 2) throw new Error(`Historical season ${season} is empty`);
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const col = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((i) => i >= 0) ?? -1;
  const nameIndex = col("player_display_name", "player_name");
  const opponentIndex = col("opponent_team");
  const weekIndex = col("week");
  const seasonTypeIndex = col("season_type");
  const passIndex = col("passing_yards");
  const rushIndex = col("rushing_yards");
  const receiveIndex = col("receiving_yards");
  const receptionsIndex = col("receptions");
  if ([nameIndex, opponentIndex, weekIndex].some((i) => i < 0)) {
    throw new Error(`Historical season ${season} missing required columns`);
  }
  const map = new Map<string, HeadToHeadGame[]>();
  const number = (row: string[], index: number) => index < 0 ? 0 : Number(row[index] || 0) || 0;
  for (const row of rows.slice(1)) {
    if (seasonTypeIndex >= 0 && row[seasonTypeIndex] !== "REG") continue;
    const player = row[nameIndex]?.trim();
    const opponent = normalizeTeam(row[opponentIndex] ?? "");
    const week = number(row, weekIndex);
    if (!player || !opponent || !week) continue;
    const key = normalizeName(player);
    const games = map.get(key) ?? [];
    games.push({ season, week, opponent,
      passingYards: number(row, passIndex), rushingYards: number(row, rushIndex),
      receivingYards: number(row, receiveIndex), receptions: number(row, receptionsIndex) });
    map.set(key, games);
  }
  return map;
}

const getHeadToHeadHistory = unstable_cache(async (season: number) => {
  const seasons = [season - 3, season - 2, season - 1, season];
  const results = await Promise.allSettled(seasons.map(fetchHeadToHeadSeason));
  const history = new Map<string, HeadToHeadGame[]>();
  const warnings: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      warnings.push(`Season ${seasons[index]}: historical data unavailable`);
      return;
    }
    for (const [player, games] of result.value) {
      history.set(player, [...(history.get(player) ?? []), ...games]);
    }
  });
  return { history: [...history.entries()], warnings };
}, ["propedge-head-to-head-history-v11-1"], { revalidate: 24 * 60 * 60 });

function headToHeadStat(game: HeadToHeadGame, prop: SupportedProp): number {
  switch (prop) {
    case "Passing Yards": return game.passingYards;
    case "Rushing Yards": return game.rushingYards;
    case "Receiving Yards": return game.receivingYards;
    case "Receptions": return game.receptions;
    case "Rushing + Receiving Yards": return game.rushingYards + game.receivingYards;
  }
}

function headToHeadExplanation(candidate: Candidate): string {
  const games = candidate.headToHead;
  if (!games.length) return `Player vs. ${candidate.opponentTeam}: no verified previous regular-season meetings found in the available historical dataset; no head-to-head trend is assumed.`;
  const hits = games.filter((game) => historicalHit(headToHeadStat(game, candidate.propType), candidate.line, candidate.side)).length;
  const values = games.map((game) => `${game.season} W${game.week}: ${round(headToHeadStat(game, candidate.propType))}`).join("; ");
  const average = games.reduce((sum, game) => sum + headToHeadStat(game, candidate.propType), 0) / games.length;
  return `Player vs. ${candidate.opponentTeam} history (${games.length} prior regular-season meetings, most recent first): ${values} ${candidate.propType.toLowerCase()}. ` +
    `Average ${round(average)}; ${hits} of ${games.length} would have finished ${candidate.side.toLowerCase()} today's ${candidate.line} line. ` +
    `These are historical comparisons to today's line, not the lines offered in those past games.`;
}

// v11.2: Prior meetings are a context signal, never an estimated win probability.
// Require at least three games before adjusting ranking or excluding a shortlist pick.
function headToHeadSignal(candidate: Candidate): {
  meetings: number;
  hits: number;
  hitShare: number | null;
  stronglyContradictory: boolean;
  adjustment: number;
} {
  const meetings = candidate.headToHead.length;
  const hits = candidate.headToHead.filter((game) =>
    historicalHit(headToHeadStat(game, candidate.propType), candidate.line, candidate.side)
  ).length;
  if (meetings < 3) {
    return { meetings, hits, hitShare: null, stronglyContradictory: false, adjustment: 0 };
  }
  const hitShare = hits / meetings;
  // 1/6 for Purdy and 2/5 for Sutton both contradict their recent streaks.
  const stronglyContradictory = hitShare <= 0.4;
  // Capped, deliberately modest ranking effects; H2H is not predictive by itself.
  const adjustment = stronglyContradictory ? -0.08 : hitShare >= 0.75 ? 0.02 : 0;
  return { meetings, hits, hitShare, stronglyContradictory, adjustment };
}

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

type TeamMatchResult = {
  valid: boolean;
  team: string;
  abbreviation: string;
  games: NFLPlayerGame[];
  reason: string;
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeTeam(team: string): string | null {
  const raw = team.trim().toUpperCase();

  if (TEAM_NAMES[raw]) return raw;

  if (TEAM_ALIASES[raw]) {
    return TEAM_ALIASES[raw];
  }

  const normalized = normalizeName(team);

  for (const [abbr, fullName] of Object.entries(
    TEAM_NAMES
  )) {
    if (normalizeName(fullName) === normalized) {
      return abbr;
    }
  }

  return null;
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

// This verifies a team match using the latest recorded
// nflverse team, not a live roster or injury report.
function verifyPlayerTeam(
  games: NFLPlayerGame[],
  homeTeam: string,
  awayTeam: string
): TeamMatchResult {
  const rejected: TeamMatchResult = {
    valid: false,
    team: "",
    abbreviation: "",
    games: [],
    reason: "Unable to verify player team.",
  };

  if (games.length === 0) return rejected;

  const ordered = [...games].sort(
    (a, b) => b.week - a.week
  );

  const latestWeek = ordered[0].week;

  const latestRecords = ordered.filter(
    (game) => game.week === latestWeek
  );

  const latestTeams = new Set(
    latestRecords.map((game) =>
      normalizeTeam(game.team)
    )
  );

  // Reject ambiguous latest-week team assignments.
  if (
    latestTeams.size !== 1 ||
    latestTeams.has(null)
  ) {
    return {
      ...rejected,
      reason: "Ambiguous latest-week team assignment.",
    };
  }

  const latestTeam = [...latestTeams][0];

  if (!latestTeam) return rejected;

  const homeAbbr = normalizeTeam(homeTeam);
  const awayAbbr = normalizeTeam(awayTeam);

  if (!homeAbbr || !awayAbbr) {
    return {
      ...rejected,
      reason: "Unrecognized sportsbook matchup team.",
    };
  }

  if (
    latestTeam !== homeAbbr &&
    latestTeam !== awayAbbr
  ) {
    return {
      ...rejected,
      reason: "Player team does not match matchup.",
    };
  }

  const matchingGames = ordered.filter(
    (game) =>
      normalizeTeam(game.team) === latestTeam
  );

  return {
    valid: true,
    team: TEAM_NAMES[latestTeam],
    abbreviation: latestTeam,
    games: matchingGames,
    reason: "Latest recorded nflverse team matches event.",
  };
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

// Use the defense's production allowed to the player's POSITION, not all players.
// Rank 1 = most allowed, so it is favorable for Overs, not Unders.
type PositionMetric =
  | "passingYardsAllowedPerGame"
  | "rushingYardsAllowedPerGame"
  | "receivingYardsAllowedPerGame"
  | "receptionsAllowedPerGame";

function propMetric(prop: SupportedProp): PositionMetric | null {
  switch (prop) {
    case "Passing Yards": return "passingYardsAllowedPerGame";
    case "Rushing Yards": return "rushingYardsAllowedPerGame";
    case "Receiving Yards": return "receivingYardsAllowedPerGame";
    case "Receptions": return "receptionsAllowedPerGame";
    default: return null;
  }
}

function getPosition(value: string | null | undefined): PlayerPosition | null {
  const position = (value ?? "").toUpperCase();
  return position === "QB" || position === "RB" ||
    position === "WR" || position === "TE"
    ? position : null;
}

function defensiveContextForCandidate(
  matchup: PositionDefensiveMatchup | null,
  prop: SupportedProp,
  side: Side,
  line: number
): { adjustment: number; comparison: string } {
  const metric = propMetric(prop);
  if (!matchup || matchup.gamesPlayed < 3 || matchup.teamsRanked < 24) {
    return { adjustment: 0, comparison: "Insufficient position-specific defensive data; no defensive ranking adjustment." };
  }
  // A combined prop requires both positional rushing and receiving evidence.
  const metrics: PositionMetric[] = metric
    ? [metric]
    : ["rushingYardsAllowedPerGame", "receivingYardsAllowedPerGame"];
  const opponent = metrics.reduce((sum, key) => sum + matchup[key], 0);
  const league = metrics.reduce((sum, key) => sum + matchup.leagueAverage[key], 0);
  if (!Number.isFinite(opponent) || !Number.isFinite(league) || league <= 0) {
    return { adjustment: 0, comparison: "Position-specific defensive comparison unavailable." };
  }
  const relative = (opponent - league) / league;
  const directional = side === "Over" ? relative : -relative;
  // Small capped adjustment, NOT a calibrated probability.
  const maxAdjustment = prop === "Rushing + Receiving Yards" ? 0.025 : 0.05;
  const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, directional * 0.2));
  const metricLabel = prop === "Rushing + Receiving Yards"
    ? "combined rushing + receiving yards"
    : prop.toLowerCase();
  const ranking = metric
    ? `; rank ${matchup.mostAllowedRank[metric]} of ${matchup.teamsRanked} (1 = most allowed)`
    : "; combined rank not calculated";
  const direction = opponent > league ? "above" : opponent < league ? "below" : "equal to";
  const relevantGames = matchup.recentGames.slice(0, 5);
  const individualGameHits = relevantGames.filter((game) =>
    game.individualPlayers.some((player) => {
      const value = prop === "Passing Yards" ? player.passingYards :
        prop === "Rushing Yards" ? player.rushingYards :
        prop === "Receiving Yards" ? player.receivingYards :
        prop === "Receptions" ? player.receptions :
        player.rushingYards + player.receivingYards;
      return side === "Over" ? value > line : value < line;
    })
  ).length;
  return {
    adjustment: Number(adjustment.toFixed(4)),
    comparison: `${matchup.position}-only opponent allowance: ${round(opponent)} ${metricLabel} per game ` +
      `vs league ${round(league)} (${direction} league average${ranking}); ` +
      `last ${relevantGames.length} recorded opponent games: ${individualGameHits} featured at least one ` +
      `${matchup.position} player ${side.toLowerCase()} ${line} ${metricLabel}. ` +
      `Group allowance is shared across players and does not predict one player's result. ` +
      `Ranking adjustment ${adjustment >= 0 ? "+" : ""}${round(adjustment * 100)} points is descriptive, not win probability.`,
  };
}

// v10: Recent INDIVIDUAL opponents at the same position, not just group totals.
// These are descriptive observations; roles and opportunity can differ substantially.
function individualOpponentContext(candidate: Candidate): string {
  const matchup = candidate.positionDefensiveMatchup;
  if (!matchup) return "Recent same-position opponent player results are unavailable.";
  const games = matchup.recentGames.slice(0, 5);
  const rows: Array<{week: number; name: string; value: number}> = [];
  for (const game of games) {
    for (const player of game.individualPlayers) {
      const value = candidate.propType === "Passing Yards" ? player.passingYards
        : candidate.propType === "Rushing Yards" ? player.rushingYards
        : candidate.propType === "Receiving Yards" ? player.receivingYards
        : candidate.propType === "Receptions" ? player.receptions
        : player.rushingYards + player.receivingYards;
      if (Number.isFinite(value) && player.player.trim()) {
        rows.push({week: game.week, name: player.player, value: round(value)});
      }
    }
  }
  if (!rows.length) return "Individual opposing-player results were not available for this position.";
  // Show top performers per game without pretending they had the same role as the candidate.
  const leaders = games.map((game) => rows.filter((r) => r.week === game.week)
    .sort((a,b) => b.value - a.value)[0]).filter((r): r is {week:number;name:string;value:number} => Boolean(r));
  const hits = rows.filter((r) => historicalHit(r.value, candidate.line, candidate.side)).length;
  return `Recent opposing ${candidate.playerPosition} individual results (top performer each week): ` +
    leaders.map((r) => `W${r.week} ${r.name} ${r.value}`).join("; ") + ". " +
    `Across ${rows.length} recorded ${candidate.playerPosition} player-game results, ${hits} finished ` +
    `${candidate.side.toLowerCase()} ${candidate.line}; these are not sportsbook outcomes or comparable roles. `;
}

// v10.1: Compare individual opposing players with the actual proposed line.
// All-player observations can be diluted by low-usage reserves. The best
// performer per opponent game is a second descriptive check, not a role match.
type OpponentDistribution = {
  playerGames: number;
  games: number;
  hits: number;
  topPerGameHits: number;
  hitShare: number;
  topHitShare: number;
  conflicting: boolean;
  adjustment: number;
};

function opponentDistribution(candidate: Candidate): OpponentDistribution | null {
  const matchup = candidate.positionDefensiveMatchup;
  if (!matchup || matchup.gamesPlayed < 4 || matchup.teamsRanked < 24) return null;
  const games = matchup.recentGames.slice(0, 5);
  let playerGames = 0;
  let hits = 0;
  let topPerGameHits = 0;
  let usableGames = 0;
  for (const game of games) {
    const values = game.individualPlayers.map((player) =>
      candidate.propType === "Passing Yards" ? player.passingYards :
      candidate.propType === "Rushing Yards" ? player.rushingYards :
      candidate.propType === "Receiving Yards" ? player.receivingYards :
      candidate.propType === "Receptions" ? player.receptions :
      player.rushingYards + player.receivingYards
    ).filter(Number.isFinite);
    if (!values.length) continue;
    usableGames++;
    playerGames += values.length;
    hits += values.filter((value) => historicalHit(value, candidate.line, candidate.side)).length;
    const best = candidate.side === "Over" ? Math.max(...values) : Math.min(...values);
    if (historicalHit(best, candidate.line, candidate.side)) topPerGameHits++;
  }
  if (usableGames < 4 || playerGames < 8) return null;
  const hitShare = hits / playerGames;
  const topHitShare = topPerGameHits / usableGames;
  // Require both distribution signals to agree before applying a material penalty.
  // A low all-player hit rate alone is NOT enough to reject an Over.
  const conflicting = hitShare <= 0.25 && topHitShare <= 0.25;
  const adjustment = conflicting ? -0.08 : hitShare <= 0.25 ? -0.025 : 0;
  return { playerGames, games: usableGames, hits, topPerGameHits,
    hitShare, topHitShare, conflicting, adjustment };
}

function opponentDistributionContext(candidate: Candidate): string {
  const sample = opponentDistribution(candidate);
  if (!sample) return "Individual-opponent distribution sample is insufficient for a ranking adjustment.";
  return `Same-position opponent distribution at the proposed ${candidate.line} line: ` +
    `${sample.hits} of ${sample.playerGames} individual player-games and ` +
    `${sample.topPerGameHits} of ${sample.games} weekly top-performer results finished ` +
    `${candidate.side.toLowerCase()}. ` +
    (sample.conflicting
      ? "Both samples are unfavorable; the candidate receives a cautious ranking penalty. "
      : sample.hitShare <= 0.25
        ? "The all-player sample is unfavorable, but the weekly top-performer sample does not confirm a strong mismatch. "
        : "No strong negative individual-opponent distribution signal was detected. ") +
    "Opposing players can have different roles and usage; these are descriptive counts, not probabilities.";
}

// Conservative screen: an unusually stingy position defense is a reason to
// withhold an OVER recommendation, even when the player's recent hit rate is high.
function stronglyUnfavorableDefense(candidate: Candidate): boolean {
  const matchup = candidate.positionDefensiveMatchup;
  if (!matchup || matchup.gamesPlayed < 4 || matchup.teamsRanked < 24) return false;
  const metric = propMetric(candidate.propType);
  const metrics: PositionMetric[] = metric ? [metric] :
    ["rushingYardsAllowedPerGame", "receivingYardsAllowedPerGame"];
  const allowed = metrics.reduce((sum, key) => sum + matchup[key], 0);
  const average = metrics.reduce((sum, key) => sum + matchup.leagueAverage[key], 0);
  if (!(average > 0) || !Number.isFinite(allowed)) return false;
  const difference = (allowed - average) / average;
  // At least 12% less than league average for Overs, or 12% more for Unders.
  return candidate.side === "Over" ? difference <= -0.12 : difference >= 0.12;
}

// v9.1: Facts shown to users are constructed from verified numeric inputs,
// rather than trusting the language model to recount hits or interpret defense.
function verifiedRecommendationReason(candidate: Candidate): string {
  const values = candidate.gameDetails
    .map((game) => `week ${game.week}: ${round(game.value)}`)
    .join(", ");
  const result = `${candidate.historicalHits} of ${candidate.sampleSize}`;
  const position = candidate.playerPosition;
  const lead = `${candidate.player} recorded ${candidate.propType.toLowerCase()} of ${values}. ` +
    `That is ${result} recorded games ${candidate.side.toLowerCase()} the ` +
    `${candidate.line} ${candidate.bookmaker} main line (${candidate.odds > 0 ? "+" : ""}${candidate.odds}), ` +
    `with a ${candidate.average} per-game average. `;

  let matchupText = `Verified ${position}-specific defensive comparison is unavailable; ` +
    `no favorable or unfavorable defensive matchup is assumed.`;
  const matchup = candidate.positionDefensiveMatchup;
  if (matchup && matchup.gamesPlayed >= 3 && matchup.teamsRanked >= 24) {
    const metric = propMetric(candidate.propType);
    const metrics: PositionMetric[] = metric
      ? [metric]
      : ["rushingYardsAllowedPerGame", "receivingYardsAllowedPerGame"];
    const opponent = metrics.reduce((sum, key) => sum + matchup[key], 0);
    const league = metrics.reduce((sum, key) => sum + matchup.leagueAverage[key], 0);
    if (Number.isFinite(opponent) && Number.isFinite(league) && league > 0) {
      const category = candidate.propType.toLowerCase();
      const tendency = opponent > league
        ? (candidate.side === "Over" ? "historically more favorable" : "historically less favorable")
        : opponent < league
          ? (candidate.side === "Over" ? "historically less favorable" : "historically more favorable")
          : "roughly neutral";
      const rankText = metric
        ? ` Rank ${matchup.mostAllowedRank[metric]} of ${matchup.teamsRanked} (1 allows most).`
        : " No combined defensive rank is calculated.";
      matchupText = `${candidate.opponentTeam} allowed ${round(opponent)} ${category} per game ` +
        `to opposing ${position}s combined across ${matchup.gamesPlayed} games, ` +
        `versus a ${round(league)} league average. This is ${tendency} for an ${candidate.side}, ` +
        `based on position-group history, not an individual-player forecast.${rankText}`;
    }
  }
  const longerTermText = candidate.longerTermGames > 0
    ? `Longer-term sample: ${candidate.longerTermHits}/${candidate.longerTermGames} recorded games would have hit today's ${candidate.line} line (available previous/current season data; not historic odds). `
    : "Longer-term sample unavailable; do not assume historical consistency. ";
  return lead + longerTermText + headToHeadExplanation(candidate) + " " + matchupText + " " + individualOpponentContext(candidate) + " " + opponentDistributionContext(candidate) +
    " Historical hit rates are not future probabilities; player availability and usage remain unverified.";
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

  // Count actual line hits, not merely games with nonzero production.
  // Penalize volatile production that depends on one extreme game.
  const consistency = candidate.recentValues.filter((value) =>
    historicalHit(value, candidate.line, candidate.side)
  ).length / candidate.sampleSize;
  const sorted = [...candidate.recentValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? candidate.average;
  const medianSupports = historicalHit(median, candidate.line, candidate.side);
  const volatilityPenalty = medianSupports ? 0 : 0.14;
  const longTermAdjustment = candidate.longerTermGames >= 8 && candidate.longerTermHitRate !== null
    ? Math.max(-0.12, Math.min(0.08, (candidate.longerTermHitRate / 100 - 0.65) * 0.3))
    : 0;

  return (
    hitRate * 0.45 +
    sampleFactor * 0.2 +
    Math.min(relativeDifference, 1) * 0.2 +
    consistency * 0.15 -
    volatilityPenalty +
    longTermAdjustment +
    candidate.defensiveRankingAdjustment +
    (opponentDistribution(candidate)?.adjustment ?? 0) +
    headToHeadSignal(candidate).adjustment
  );
}

// v11: A separate, stricter evidence shortlist. This is NOT a calibrated
// probability estimate, and no candidate is included merely to fill slots.
const MAX_HIGH_CONFIDENCE_RECOMMENDATIONS = 3;
const CONFIDENCE_METHODOLOGY =
  "At least 4 recorded games, 100% historical hits at the quoted main line, " +
  "a directional average at least 15% beyond that line, verified position-specific " +
  "defense that is not materially unfavorable, and no strongly conflicting " +
  "same-position opponent distribution. Receiving props also require " +
  "consistent recorded targets. At least 3 prior head-to-head meetings with 40% or " +
  "fewer historical hits at today's line disqualify a high-confidence pick; 0-2 " +
  "meetings are informational only. These are screening criteria, NOT predicted win probabilities.";

function qualifiesForHighConfidence(candidate: Recommendation): boolean {
  if (candidate.verdict !== "worth_researching") return false;
  if (headToHeadSignal(candidate).stronglyContradictory) return false;
  if (!candidate.teamMatchVerified || candidate.sampleSize < 4) return false;
  if (candidate.historicalHits !== candidate.sampleSize) return false;
  if (candidate.recentValues.length !== candidate.sampleSize) return false;
  if (!candidate.recentValues.every((value) => historicalHit(value, candidate.line, candidate.side))) return false;
  if (!(candidate.line > 0) || candidate.differenceFromLine / candidate.line < 0.15) return false;
  if (!Number.isFinite(candidate.odds) || !candidate.bookmaker) return false;

  const defense = candidate.positionDefensiveMatchup;
  if (!defense || defense.gamesPlayed < 4 || defense.teamsRanked < 24) return false;
  if (stronglyUnfavorableDefense(candidate)) return false;
  const metric = propMetric(candidate.propType);
  const metrics: PositionMetric[] = metric
    ? [metric]
    : ["rushingYardsAllowedPerGame", "receivingYardsAllowedPerGame"];
  const allowed = metrics.reduce((sum, key) => sum + defense[key], 0);
  const baseline = metrics.reduce((sum, key) => sum + defense.leagueAverage[key], 0);
  if (!(baseline > 0) || !Number.isFinite(allowed)) return false;
  const relative = (allowed - baseline) / baseline;
  if (candidate.side === "Over" ? relative < -0.05 : relative > 0.05) return false;

  const distribution = opponentDistribution(candidate);
  if (distribution?.conflicting) return false;

  if (candidate.propType === "Receiving Yards" || candidate.propType === "Receptions") {
    const targets = candidate.gameDetails.map((game) => game.targets);
    if (targets.some((value) => value === null)) return false;
    const recorded = targets as number[];
    if (recorded.some((value) => value < 2)) return false;
    if (recorded.reduce((sum, value) => sum + value, 0) / recorded.length < 3) return false;
  }
  return true;
}

function selectHighConfidence(recommendations: Recommendation[]): Recommendation[] {
  const qualified = recommendations.filter(qualifiesForHighConfidence)
    .sort((a, b) => candidateScore(b) - candidateScore(a));
  const selected: Recommendation[] = [];
  const players = new Set<string>();
  for (const item of qualified) {
    const player = normalizeName(item.player);
    if (players.has(player)) continue;
    players.add(player);
    selected.push(item);
    if (selected.length === MAX_HIGH_CONFIDENCE_RECOMMENDATIONS) break;
  }
  return selected;
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

async function fetchSportsbookSnapshot(gameId?: string): Promise<OddsSnapshot> {
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

  const selected = gameId
    ? upcoming.filter((event) => event.id === gameId)
    : upcoming.slice(0, MAX_GAMES_TO_ANALYZE);
  if (gameId && selected.length !== 1) {
    throw new Error("Selected game is unavailable or has already started. Refresh the game list.");
  }

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
    reason: verifiedRecommendationReason(candidate),
    risks:
      "This is a small historical sample. Playing time, " +
      "rushing attempts, injuries, opponent defense, " +
      "and expected value have not been verified.",
  };
}

function buildEvidenceNotes(
  games: NFLPlayerGame[],
  prop: SupportedProp,
  values: number[],
  playerTeam: string
): string[] {
  const notes: string[] = [];

  notes.push(
    `The player's latest recorded nflverse team is ` +
      `${playerTeam}, which matches the scheduled game.`
  );

  notes.push(
    "Team matching is based on historical weekly stats, " +
      "not an independently verified current roster."
  );

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
        `Recorded targets, newest first: ` +
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
      "Rushing attempts and carry share are not available."
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

  if (positiveGames < 3) return false;

  if (values[0] === 0) return false;

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

    if (
      targetedGames < 3 ||
      averageTargets < 2 ||
      validTargets[0] === 0
    ) {
      return false;
    }
  }

  if (prop === "Rushing Yards") {
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

async function generateAnalysis(gameId?: string) {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured."
    );
  }

  // Defensive data is supplemental: an outage must not be
  // mistaken for a favorable matchup or break existing research.
  const [snapshot, nfl, defenseResult] = await Promise.all([
    fetchSportsbookSnapshot(gameId),
    getNFLStats(),
    getNFLDefenseStats().then(
      (data) => ({ data, error: "" }),
      (error: unknown) => ({
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Defensive data unavailable.",
      })
    ),
  ]);

  // Past player-vs-team meetings are optional context; missing seasons are disclosed.
  const headToHeadResult = await getHeadToHeadHistory(nfl.season).catch(() => ({
    history: [] as Array<[string, HeadToHeadGame[]]>,
    warnings: ["Historical player-vs-opponent dataset unavailable"],
  }));
  const headToHeadByPlayer = new Map<string, HeadToHeadGame[]>(headToHeadResult.history);

  const defense = defenseResult.data;
  const defenseBaselineAvailable = Boolean(
    defense &&
      Object.values<DefensiveMatchup>(defense.teams).some((team) =>
        Object.values<PositionDefensiveMatchup>(team.byPosition ?? {}).some(
          (position) => position.teamsRanked >= 24
        )
      )
  );

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
  let excludedForTeamMismatch = 0;
  let excludedForAmbiguousPlayer = 0;

  for (const main of mainLines) {
    const allGames =
      playerGames.get(normalizeName(main.player)) ?? [];

    if (allGames.length === 0) continue;

    // Different display names can normalize to the
    // same string. Reject these ambiguous identities.
    const distinctNames = new Set(
      allGames.map((game) =>
        game.player.trim().toLowerCase()
      )
    );

    if (distinctNames.size > 1) {
      excludedForAmbiguousPlayer++;
      continue;
    }

    const teamMatch = verifyPlayerTeam(
      allGames,
      main.homeTeam,
      main.awayTeam
    );

    if (!teamMatch.valid) {
      excludedForTeamMismatch++;
      continue;
    }

    // Only use stats recorded with the matched team.
    // Do not silently mix in prior-team performances.
    const recent = teamMatch.games.slice(0, 5);

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

    const homeAbbr = normalizeTeam(main.homeTeam);
    const awayAbbr = normalizeTeam(main.awayTeam);
    const opponentAbbr =
      teamMatch.abbreviation === homeAbbr
        ? awayAbbr
        : homeAbbr;

    const playerPosition = getPosition(recent[0]?.position);
    if (!playerPosition) continue;

    const defensiveMatchup = opponentAbbr
      ? defense?.teams[opponentAbbr] ?? null
      : null;

    const positionDefensiveMatchup =
      defensiveMatchup?.byPosition?.[playerPosition] ?? null;

    const opponentTeam = opponentAbbr
      ? TEAM_NAMES[opponentAbbr] ?? opponentAbbr
      : "Unknown opponent";

    const headToHead = (headToHeadByPlayer.get(normalizeName(main.player)) ?? [])
      .filter((game) => game.opponent === opponentAbbr &&
        (game.season < nfl.season || game.week <= nfl.latestWeek))
      .sort((a, b) => b.season - a.season || b.week - a.week)
      .slice(0, 8);

    const evidenceNotes = buildEvidenceNotes(
      recent,
      main.propType,
      stats,
      teamMatch.team
    );

    if (positionDefensiveMatchup) {
      evidenceNotes.push(
        `${opponentTeam} defense against ${playerPosition}s through week ` +
        `${positionDefensiveMatchup.latestWeek} (${positionDefensiveMatchup.gamesPlayed} games): ` +
        `${positionDefensiveMatchup.passingYardsAllowedPerGame} passing yards, ` +
        `${positionDefensiveMatchup.rushingYardsAllowedPerGame} rushing yards, ` +
        `${positionDefensiveMatchup.receivingYardsAllowedPerGame} receiving yards, ` +
        `${positionDefensiveMatchup.receptionsAllowedPerGame} receptions, ` +
        `${positionDefensiveMatchup.targetsAllowedPerGame} targets per game ` +
        `to ALL opposing ${playerPosition}s combined. These are position-group totals, not individual projections.`
      );
    } else {
      evidenceNotes.push(`Position-specific defensive data for ${opponentTeam} vs ${playerPosition}s unavailable; do not infer matchup strength.`);
    }

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

      const sortedStats = [...stats].sort((a, b) => a - b);
      const median = sortedStats[Math.floor(sortedStats.length / 2)];
      const minimumHits = stats.length >= 5 ? 4 : 3;
      if (hits < minimumHits || directionalDifference <= 0 ||
          !historicalHit(median, main.line, side)) {
        continue;
      }

      // Longer-term consistency is calculated against today's quoted line.
      // This historical dataset may be incomplete; do not treat missing data as a miss.
      const longerTerm = (headToHeadByPlayer.get(normalizeName(main.player)) ?? [])
        .filter((game) => game.season >= nfl.season - 1 &&
          (game.season < nfl.season || game.week <= nfl.latestWeek))
        .sort((a, b) => b.season - a.season || b.week - a.week)
        .slice(0, 16);
      const longerTermHits = longerTerm.filter((game) =>
        historicalHit(headToHeadStat(game, main.propType), main.line, side)).length;
      // Reject a candidate when a meaningful longer sample strongly contradicts a hot recent streak.
      if (longerTerm.length >= 8 && longerTermHits / longerTerm.length < 0.55) continue;

      const ticker = [
        "SPORTSBOOK",
        main.eventId,
        normalizeName(main.player),
        main.propType.replace(/\W/g, ""),
        main.bookmakerKey,
        String(main.line),
        side.toUpperCase(),
      ].join("-");

      const defensiveContext = defensiveContextForCandidate(
        positionDefensiveMatchup,
        main.propType,
        side,
        main.line
      );

      candidates.push({
        ticker,
        player: main.player,
        playerTeam: teamMatch.team,
        playerTeamAbbr: teamMatch.abbreviation,
        teamMatchVerified: true,
        teamMatchSource:
          "nflverse latest recorded team vs sportsbook event",
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
        defensiveMatchup,
        playerPosition,
        positionDefensiveMatchup,
        opponentTeam,
        defensiveRankingAdjustment: defensiveContext.adjustment,
        defensiveComparison: defensiveContext.comparison,
        headToHead,
        longerTermGames: longerTerm.length,
        longerTermHits,
        longerTermHitRate: longerTerm.length ? round(100 * longerTermHits / longerTerm.length) : null,
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

  const distributionConflicts = [...bestByPlayerPropSide.values()].filter((candidate) => opponentDistribution(candidate)?.conflicting).length;

  const excludedForStrongDefensiveMatchup = [...bestByPlayerPropSide.values()].filter(stronglyUnfavorableDefense).length;

  const selected = selectDiverseCandidates(
    [...bestByPlayerPropSide.values()].filter((candidate) => !stronglyUnfavorableDefense(candidate)),
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
    researchScope: gameId ? "selected_game" : "all_games",
    selectedGameId: gameId ?? null,
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
    excludedForTeamMismatch,
    excludedForAmbiguousPlayer,
    candidatesReviewed: selected.length,
    candidatesByPropType,
    defensiveDataAvailable: Boolean(defense),
    defensiveLeagueBaselineAvailable: defenseBaselineAvailable,
    defensiveLeagueBaseline: null,
    defensivePositionSpecificEnabled: true,
    rankingVersion: 11.2,
    headToHeadEnabled: true,
    headToHeadWarnings: headToHeadResult.warnings,
    confidenceMethodology: CONFIDENCE_METHODOLOGY,
    highConfidenceCriteriaVersion: 2,
    headToHeadSelectionEnabled: true,
    distributionConflicts,
    individualOpponentDistributionEnabled: true,
    excludedForStrongDefensiveMatchup,
    recentIndividualOpponentContextEnabled: true,
    rankingDescription:
      "Historical player evidence, capped position-defense context, sample-gated individual opponent distribution, and cautiously weighted prior player-vs-opponent meetings; not a calibrated probability or expected-value model.",
    defensiveDataWarning: defenseResult.error || null,
    defensiveMatchupsVerified: selected.filter(
      (candidate) => candidate.positionDefensiveMatchup !== null
    ).length,
  };

  if (selected.length === 0) {
    return {
      ...baseReport,
      recommendationsByPropType: {},
      count: 0,
      recommendations: [] as Recommendation[],
      highConfidenceRecommendations: [] as Recommendation[],
      updatedAt: new Date().toISOString(),
      message:
        "No sportsbook props passed the team matching " +
        "and historical evidence requirements.",
      disclaimer:
        "Historical research is not a forecast " +
        "or guarantee of betting outcomes.",
    };
  }

  const systemPrompt = `
You are PropEdge AI, an NFL player-prop research assistant.

Analyze ONLY the supplied data.

All candidates use quoted sportsbook MAIN lines
from DraftKings or FanDuel.

The player's latest recorded nflverse team has been
checked against the scheduled sportsbook matchup.

This does NOT independently verify current roster
status or availability.

Candidates include:
- Player and matched historical team
- Prop category and direction
- Main sportsbook line and American odds
- Recent individual game results
- Recorded targets for receiving props
- Other sportsbook main lines
- Available alternate lines
- Scheduled game teams and time
- Evidence limitations
- Opponent defense against the player's exact position (QB/RB/WR/TE)
- Position-specific league average, rank and recent opposing-player performances
- Capped position-specific ranking adjustment when supported

RULES:

1. Never invent injuries, depth chart changes,
   carry share, snap counts, defensive rankings,
   weather, game spreads, totals, or comparable
   opponents' performances.

2. Never infer rushing attempts from rushing yards.

3. Recorded targets do not establish snap counts.

4. Do not call a player a starter, backup,
   injured, inactive, or promoted unless supplied
   evidence establishes that status.

5. Historical hit rates are not future probabilities.

6. Never claim positive expected value without
   a validated probability model.

7. Never describe a recommendation as guaranteed.

8. Explain individual game results and how
   they compare with the selected line.

9. Discuss recorded targets for receiving props
   when the information is available.

10. Explain consistency and volatility.

11. Quote sportsbook odds exactly.

12. Do not substitute an alternate line
    for the main recommendation.

13. Do not invent alternate lines or prices.

 14. Use ONLY positionDefensiveMatchup and defensiveComparison for matchup discussion.
     Never use overall team passing, rushing, or receiving yards to characterize
     an RB, WR, TE, or QB prop. For example, RB receiving yards must be
     compared with receiving yards allowed to RBs, not total receiving yards.
     State the position, metric, opponent allowance per game, league average,
     rank and sample size when provided. Rank 1 means MOST allowed, not best defense.
     If opponent allowance is BELOW league average, it is generally tougher
     for an OVER, not favorable. If ABOVE average, it may be more favorable
     for an OVER, but never guarantees the outcome. Reverse for UNDERS.
     Position-group totals are SHARED among multiple players: never imply
     a single player receives the whole group allowance.
     If referencing recentGames, distinguish group totals from individual
     performances. Never invent a positional hit count or ranking.
     If positionDefensiveMatchup is null, say positional matchup is unverified.

 15. Explain missing injury, matchup, and
     opportunity information in the risks.

16. Use "worth_researching" only when the
    evidence supports further investigation.

17. Use "insufficient_evidence" when the data
    is weak, contradictory, or incomplete.

18. Aim for 100-160 words in the reason
    when enough information is available.

 19. Return one evaluation per candidate.

 20. If defensiveComparison is available, state the
     opponent-versus-league comparison accurately.
     Do not turn the defensiveRankingAdjustment into
     a win probability, confidence score, or betting edge.

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
              candidates: selected.map(({ defensiveMatchup, ...candidate }) => candidate),
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

    const risks =
      "risks" in item &&
      typeof item.risks === "string"
        ? item.risks
        : "Player availability and matchup context are unverified.";

    evaluated.set(item.ticker, {
      ...verified,
      verdict,
      reason: verifiedRecommendationReason(verified),
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

  const highConfidenceRecommendations = selectHighConfidence(allEvaluations);

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
    highConfidenceRecommendations,
    highConfidenceCount: highConfidenceRecommendations.length,
    updatedAt: new Date().toISOString(),
    disclaimer:
      "AI-generated research uses recent historical " +
      "results and quoted sportsbook prices. " +
      "Player teams are matched using their latest " +
      "recorded nflverse team, not live roster status. " +
      "This is not a validated forecast, expected-value " +
      "calculation, or guarantee of betting outcomes. " +
      "Historical position-specific defensive group totals and capped " +
      "league-relative ranking adjustments are included when available. " +
      "These are not individual-player projections or predictive. " +
      "Injuries and current defensive personnel remain unverified. " +
      "Odds and availability may change.",
  };
}

// v11 adds a separately qualified high-confidence research shortlist.
const getCachedAnalysis = unstable_cache(
  generateAnalysis,
  ["propedge-ai-analysis-v11-2-h2h-screen"],
  {
    revalidate: CACHE_SECONDS,
    tags: ["propedge-ai-analysis-v11"],
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
        const oldReport = JSON.parse(oldText) as typeof analysis;
        if (analysis.selectedGameId && oldReport && typeof oldReport === "object") {
          const other = (items: Recommendation[] | undefined) =>
            (Array.isArray(items) ? items : []).filter((item) => item.eventId !== analysis.selectedGameId);
          const mergedRegular = [...other(oldReport.recommendations), ...analysis.recommendations];
          const mergedHigh = [...other(oldReport.highConfidenceRecommendations), ...analysis.highConfidenceRecommendations];
          analysis = {
            ...analysis,
            recommendations: mergedRegular,
            highConfidenceRecommendations: mergedHigh,
            count: mergedRegular.length,
            highConfidenceCount: mergedHigh.length,
            researchScope: "merged_game_research",
          };
        }
        if (
          JSON.stringify(oldReport) ===
          JSON.stringify(analysis)
        ) {
          return {
            published: true,
            changed: false,
            analysis,
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
        "Publish defensive-context PropEdge AI research",
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
    analysis,
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
        evidenceFilterVersion: 11,
        highConfidenceShortlistEnabled: true,
        individualOpponentDistributionEnabled: true,
        leagueRelativeDefenseRankingEnabled: true,
        positionSpecificDefenseEnabled: true,
        defensiveContextEnabled: true,
        teamMatchingEnabled: true,
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

    const gameId = typeof body?.gameId === "string" ? body.gameId.trim() : "";
    if (gameId && !/^[a-zA-Z0-9_-]{6,128}$/.test(gameId)) {
      return NextResponse.json({ success: false, error: "Invalid game identifier." }, { status: 400 });
    }
    const analysis = gameId ? await generateAnalysis(gameId) : await getCachedAnalysis();

    try {
      const publication =
        await publishToGitHub(analysis);

      return NextResponse.json(
        {
          ...publication.analysis,
          published: publication.published,
          changed: publication.changed,
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
// Fetches the upcoming NFL schedule only when the administrator requests it.
// One Odds API events call; no OpenAI request and no per-game prop calls.
export async function GET(request: NextRequest) {
  if (!process.env.ANALYZE_ADMIN_SECRET) {
    return NextResponse.json({ success: false, error: "Admin authentication is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Admin authorization required." }, { status: 401 });
  }
  try {
    const events = await oddsRequest<EventData[]>(`/sports/${ODDS_SPORT}/events`);
    const upcoming = events.filter((event) => Date.parse(event.commence_time) > Date.now())
      .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
    return NextResponse.json({ success: true, games: upcoming.map(({ id, home_team, away_team, commence_time }) =>
      ({ id, homeTeam: home_team, awayTeam: away_team, gameTime: commence_time })) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load games." }, { status: 500 });
  }
}
