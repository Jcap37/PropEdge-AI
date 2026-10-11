
import { unstable_cache } from "next/cache";

const SEASON = 2026;

const DATA_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/" +
  `stats_player/stats_player_week_${SEASON}.csv`;

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
};

export type DefenseResponse = {
  success: boolean;
  season: number;
  latestWeek: number;
  teams: Record<string, DefensiveMatchup>;
  warnings: string[];
};

type GameTotals = {
  defense: string;
  week: number;
  passing: number;
  rushing: number;
  receiving: number;
  receptions: number;
};

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
    const character = text[i];

    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (
      (character === "\n" || character === "\r") &&
      !quoted
    ) {
      if (character === "\r" && text[i + 1] === "\n") {
        i++;
      }

      row.push(field);

      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

async function loadDefensiveStats(): Promise<DefenseResponse> {
  const response = await fetch(DATA_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(
      `Unable to load nflverse defensive data: HTTP ${response.status}`
    );
  }

  const csv = await response.text();
  const rows = parseCSV(csv);

  if (rows.length < 2) {
    throw new Error("The nflverse statistics file is empty.");
  }

  const headers = rows[0].map((value) =>
    value.trim().toLowerCase()
  );

  function column(...names: string[]): number {
    return names
      .map((name) => headers.indexOf(name))
      .find((index) => index >= 0) ?? -1;
  }

  const seasonIndex = column("season");
  const weekIndex = column("week");
  const offenseIndex = column(
    "recent_team",
    "team",
    "team_abbr"
  );
  const defenseIndex = column("opponent_team");
  const passingIndex = column("passing_yards");
  const rushingIndex = column("rushing_yards");
  const receivingIndex = column("receiving_yards");
  const receptionsIndex = column("receptions");
  const positionIndex = column("position");

  const required = [
    seasonIndex,
    weekIndex,
    offenseIndex,
    defenseIndex,
    passingIndex,
    rushingIndex,
    receivingIndex,
    receptionsIndex,
    positionIndex,
  ];

  if (required.some((index) => index < 0)) {
    throw new Error(
      "The nflverse file is missing required opponent or statistical columns."
    );
  }

  const games = new Map<string, GameTotals>();
  let latestWeek = 0;

  for (const row of rows.slice(1)) {
    const season = Number(row[seasonIndex]);
    const week = Number(row[weekIndex]);

    if (
      season !== SEASON ||
      !Number.isInteger(week) ||
      week < 1 ||
      week > 18
    ) {
      continue;
    }

    const offense = normalizeTeam(row[offenseIndex] ?? "");
    const defense = normalizeTeam(row[defenseIndex] ?? "");

    if (
      !offense ||
      !defense ||
      offense === defense
    ) {
      continue;
    }

    latestWeek = Math.max(latestWeek, week);

    const key = `${week}|${offense}|${defense}`;

    const existing = games.get(key) ?? {
      defense,
      week,
      passing: 0,
      rushing: 0,
      receiving: 0,
      receptions: 0,
    };

    // Sum passing yards from recorded quarterbacks.
    // This avoids counting receiving yards as passing yards.
    if ((row[positionIndex] ?? "").toUpperCase() === "QB") {
      existing.passing += numberOrZero(row[passingIndex]);
    }

    existing.rushing += numberOrZero(row[rushingIndex]);
    existing.receiving += numberOrZero(row[receivingIndex]);
    existing.receptions += numberOrZero(row[receptionsIndex]);

    games.set(key, existing);
  }

  if (games.size === 0) {
    throw new Error(
      "No complete NFL opponent statistics were found."
    );
  }

  const grouped = new Map<string, GameTotals[]>();

  for (const game of games.values()) {
    const existing = grouped.get(game.defense) ?? [];
    existing.push(game);
    grouped.set(game.defense, existing);
  }

  const teams: Record<string, DefensiveMatchup> = {};

  for (const [team, teamGames] of grouped) {
    const count = teamGames.length;

    if (count === 0) continue;

    const total = (
      field: "passing" | "rushing" | "receiving" | "receptions"
    ) =>
      teamGames.reduce(
        (sum, game) => sum + game[field],
        0
      );

    teams[team] = {
      opponent: team,
      gamesPlayed: count,
      passingYardsAllowedPerGame: round(
        total("passing") / count
      ),
      rushingYardsAllowedPerGame: round(
        total("rushing") / count
      ),
      receivingYardsAllowedPerGame: round(
        total("receiving") / count
      ),
      receptionsAllowedPerGame: round(
        total("receptions") / count
      ),
      latestWeek: Math.max(
        ...teamGames.map((game) => game.week)
      ),
      source: "nflverse player weekly statistics",
      verified: true,
    };
  }

  return {
    success: true,
    season: SEASON,
    latestWeek,
    teams,
    warnings: [
      "These are historical team-level totals derived from player statistics.",
      "Passing totals include recorded quarterback passing yards; non-quarterback passes may be omitted.",
      "These totals are not position-specific defensive rankings or predictions.",
      "Sacks, penalties, and some official team-stat adjustments may not be represented.",
      "Injuries and current defensive personnel are not verified.",
    ],
  };
}

const getCachedDefensiveStats = unstable_cache(
  loadDefensiveStats,
  ["propedge-defense-stats-2026-v1"],
  {
    revalidate: 6 * 60 * 60,
    tags: ["propedge-defense-stats"],
  }
);

export async function getNFLDefenseStats() {
  return getCachedDefensiveStats();
}
