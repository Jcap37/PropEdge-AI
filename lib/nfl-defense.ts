import { unstable_cache } from "next/cache";

const SEASON = 2026;
const DATA_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/" +
  `stats_player/stats_player_week_${SEASON}.csv`;

const TEAM_ALIASES: Record<string, string> = {
  ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", JAC: "JAX",
  KAN: "KC", LAR: "LA", OAK: "LV", SD: "LAC", STL: "LA", WSH: "WAS",
};

export type PlayerPosition = "QB" | "RB" | "WR" | "TE";
export type DefensiveMetric =
  | "passingYardsAllowedPerGame"
  | "rushingYardsAllowedPerGame"
  | "receivingYardsAllowedPerGame"
  | "receptionsAllowedPerGame"
  | "targetsAllowedPerGame";

export type PositionGame = {
  week: number;
  opponentOffense: string;
  passingYards: number;
  rushingYards: number;
  receivingYards: number;
  receptions: number;
  targets: number;
  individualPlayers: Array<{
    player: string;
    passingYards: number;
    rushingYards: number;
    receivingYards: number;
    receptions: number;
    targets: number;
  }>;
};

export type PositionDefensiveMatchup = {
  position: PlayerPosition;
  gamesPlayed: number;
  passingYardsAllowedPerGame: number;
  rushingYardsAllowedPerGame: number;
  receivingYardsAllowedPerGame: number;
  receptionsAllowedPerGame: number;
  targetsAllowedPerGame: number;
  leagueAverage: Record<DefensiveMetric, number>;
  // Rank 1 = most allowed (most permissive defense), not strongest defense.
  mostAllowedRank: Record<DefensiveMetric, number>;
  teamsRanked: number;
  recentGames: PositionGame[];
  latestWeek: number;
};

export type DefensiveMatchup = {
  opponent: string;
  gamesPlayed: number;
  passingYardsAllowedPerGame: number;
  rushingYardsAllowedPerGame: number;
  receivingYardsAllowedPerGame: number;
  receptionsAllowedPerGame: number;
  latestWeek: number;
  source: "nflverse player weekly statistics";
  verified: true;
  // New optional field: existing v8 code can still read legacy team totals.
  byPosition?: Partial<Record<PlayerPosition, PositionDefensiveMatchup>>;
};

export type DefenseResponse = {
  success: boolean;
  season: number;
  latestWeek: number;
  teams: Record<string, DefensiveMatchup>;
  warnings: string[];
};

type PlayerRecord = PositionGame["individualPlayers"][number];
type GameTotals = {
  defense: string;
  offense: string;
  week: number;
  passing: number;
  rushing: number;
  receiving: number;
  receptions: number;
  byPosition: Partial<Record<PlayerPosition, PositionGame>>;
};

const POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];
const METRICS: DefensiveMetric[] = [
  "passingYardsAllowedPerGame",
  "rushingYardsAllowedPerGame",
  "receivingYardsAllowedPerGame",
  "receptionsAllowedPerGame",
  "targetsAllowedPerGame",
];

function normalizeTeam(value: string): string {
  const team = value.trim().toUpperCase();
  return TEAM_ALIASES[team] ?? team;
}
function numberOrZero(value: string | undefined): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field); field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function emptyPositionGame(week: number, offense: string): PositionGame {
  return {
    week, opponentOffense: offense, passingYards: 0, rushingYards: 0,
    receivingYards: 0, receptions: 0, targets: 0, individualPlayers: [],
  };
}

function metricValue(games: PositionGame[], metric: DefensiveMetric): number {
  if (!games.length) return 0;
  const field: keyof Pick<PositionGame, "passingYards" | "rushingYards" | "receivingYards" | "receptions" | "targets"> =
    metric === "passingYardsAllowedPerGame" ? "passingYards" :
    metric === "rushingYardsAllowedPerGame" ? "rushingYards" :
    metric === "receivingYardsAllowedPerGame" ? "receivingYards" :
    metric === "receptionsAllowedPerGame" ? "receptions" : "targets";
  return round(games.reduce((sum, game) => sum + game[field], 0) / games.length);
}

async function loadDefensiveStats(): Promise<DefenseResponse> {
  const response = await fetch(DATA_URL, {
    cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Unable to load nflverse defensive data: HTTP ${response.status}`);
  const rows = parseCSV(await response.text());
  if (rows.length < 2) throw new Error("The nflverse statistics file is empty.");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  function column(...names: string[]): number {
    return names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  }
  const seasonIndex = column("season");
  const weekIndex = column("week");
  const offenseIndex = column("recent_team", "team", "team_abbr");
  const defenseIndex = column("opponent_team");
  const passingIndex = column("passing_yards");
  const rushingIndex = column("rushing_yards");
  const receivingIndex = column("receiving_yards");
  const receptionsIndex = column("receptions");
  const positionIndex = column("position");
  const targetsIndex = column("targets");
  const playerIndex = column("player_display_name", "player_name", "player_id");
  if ([seasonIndex, weekIndex, offenseIndex, defenseIndex, passingIndex,
    rushingIndex, receivingIndex, receptionsIndex, positionIndex].some((index) => index < 0)) {
    throw new Error("The nflverse file is missing required opponent or statistical columns.");
  }

  const games = new Map<string, GameTotals>();
  let latestWeek = 0;
  for (const row of rows.slice(1)) {
    const season = Number(row[seasonIndex]);
    const week = Number(row[weekIndex]);
    if (season !== SEASON || !Number.isInteger(week) || week < 1 || week > 18) continue;
    const offense = normalizeTeam(row[offenseIndex] ?? "");
    const defense = normalizeTeam(row[defenseIndex] ?? "");
    if (!offense || !defense || offense === defense) continue;
    const position = (row[positionIndex] ?? "").toUpperCase();
    latestWeek = Math.max(latestWeek, week);
    const key = `${week}|${offense}|${defense}`;
    const game = games.get(key) ?? {
      defense, offense, week, passing: 0, rushing: 0, receiving: 0,
      receptions: 0, byPosition: {},
    };
    const passing = numberOrZero(row[passingIndex]);
    const rushing = numberOrZero(row[rushingIndex]);
    const receiving = numberOrZero(row[receivingIndex]);
    const receptions = numberOrZero(row[receptionsIndex]);
    const targets = targetsIndex >= 0 ? numberOrZero(row[targetsIndex]) : 0;
    if (position === "QB") game.passing += passing;
    game.rushing += rushing;
    game.receiving += receiving;
    game.receptions += receptions;
    if (POSITIONS.includes(position as PlayerPosition)) {
      const pos = position as PlayerPosition;
      const p = game.byPosition[pos] ?? emptyPositionGame(week, offense);
      p.passingYards += passing;
      p.rushingYards += rushing;
      p.receivingYards += receiving;
      p.receptions += receptions;
      p.targets += targets;
      const player = playerIndex >= 0 ? (row[playerIndex] ?? "").trim() : "";
      if (player) {
        const existing = p.individualPlayers.find((item) => item.player === player);
        if (existing) {
          existing.passingYards += passing;
          existing.rushingYards += rushing;
          existing.receivingYards += receiving;
          existing.receptions += receptions;
          existing.targets += targets;
        } else {
          const record: PlayerRecord = {
            player, passingYards: passing, rushingYards: rushing,
            receivingYards: receiving, receptions, targets,
          };
          p.individualPlayers.push(record);
        }
      }
      game.byPosition[pos] = p;
    }
    games.set(key, game);
  }
  if (!games.size) throw new Error("No complete NFL opponent statistics were found.");

  const grouped = new Map<string, GameTotals[]>();
  for (const game of games.values()) {
    const existing = grouped.get(game.defense) ?? [];
    existing.push(game);
    grouped.set(game.defense, existing);
  }

  const teams: Record<string, DefensiveMatchup> = {};
  // A position with no recorded player stats in a game is counted as zero,
  // rather than removing that game and inflating per-game averages.
  for (const [team, teamGames] of grouped) {
    const count = teamGames.length;
    const total = (field: "passing" | "rushing" | "receiving" | "receptions") =>
      teamGames.reduce((sum, game) => sum + game[field], 0);
    const byPosition: Partial<Record<PlayerPosition, PositionDefensiveMatchup>> = {};
    for (const pos of POSITIONS) {
      const posGames = teamGames.map((game) =>
        game.byPosition[pos] ?? emptyPositionGame(game.week, game.offense)
      ).sort((a, b) => b.week - a.week);
      byPosition[pos] = {
        position: pos,
        gamesPlayed: count,
        passingYardsAllowedPerGame: metricValue(posGames, "passingYardsAllowedPerGame"),
        rushingYardsAllowedPerGame: metricValue(posGames, "rushingYardsAllowedPerGame"),
        receivingYardsAllowedPerGame: metricValue(posGames, "receivingYardsAllowedPerGame"),
        receptionsAllowedPerGame: metricValue(posGames, "receptionsAllowedPerGame"),
        targetsAllowedPerGame: metricValue(posGames, "targetsAllowedPerGame"),
        leagueAverage: {} as Record<DefensiveMetric, number>,
        mostAllowedRank: {} as Record<DefensiveMetric, number>,
        teamsRanked: 0,
        recentGames: posGames.slice(0, 5),
        latestWeek: Math.max(...teamGames.map((game) => game.week)),
      };
    }
    teams[team] = {
      opponent: team, gamesPlayed: count,
      passingYardsAllowedPerGame: round(total("passing") / count),
      rushingYardsAllowedPerGame: round(total("rushing") / count),
      receivingYardsAllowedPerGame: round(total("receiving") / count),
      receptionsAllowedPerGame: round(total("receptions") / count),
      latestWeek: Math.max(...teamGames.map((game) => game.week)),
      source: "nflverse player weekly statistics", verified: true, byPosition,
    };
  }

  // Baseline weighted by defensive games, so bye weeks do not skew it.
  for (const pos of POSITIONS) {
    for (const metric of METRICS) {
      const entries = Object.values(teams).map((team) => ({
        team, value: team.byPosition![pos]![metric],
      }));
      const gameCount = entries.reduce((sum, entry) => sum + entry.team.gamesPlayed, 0);
      const average = gameCount
        ? round(entries.reduce((sum, entry) => sum + entry.value * entry.team.gamesPlayed, 0) / gameCount)
        : 0;
      const ranked = [...entries].sort((a, b) => b.value - a.value);
      entries.forEach(({ team, value }) => {
        const data = team.byPosition![pos]!;
        data.leagueAverage[metric] = average;
        data.mostAllowedRank[metric] = 1 + ranked.filter((entry) => entry.value > value).length;
        data.teamsRanked = entries.length;
      });
    }
  }

  const warnings = [
    "These are historical team and position-group totals derived from nflverse weekly player statistics, not projections.",
    "Position-group totals sum all players at that position; individual-player records are provided separately.",
    "Most-allowed rank 1 means the defense allowed the most production, not that it has the best defense.",
    "Missing position production in an otherwise recorded game is treated as zero; incomplete player data can affect results.",
    "Passing totals include recorded QB passing yards; non-QB passes may be omitted.",
    "Sacks, penalties, and official team-stat adjustments may not be represented.",
    "Injuries, current rosters, and defensive personnel are not verified.",
  ];
  if (targetsIndex < 0) warnings.push("Targets column unavailable; target totals are zero and should not be interpreted.");
  if (playerIndex < 0) warnings.push("Player identifier unavailable; individual-player defensive comparisons are unavailable.");
  return { success: true, season: SEASON, latestWeek, teams, warnings };
}

const getCachedDefensiveStats = unstable_cache(
  loadDefensiveStats,
  ["propedge-defense-stats-2026-v9-position-v1"],
  { revalidate: 6 * 60 * 60, tags: ["propedge-defense-stats"] }
);

export async function getNFLDefenseStats(): Promise<DefenseResponse> {
  return getCachedDefensiveStats();
}
