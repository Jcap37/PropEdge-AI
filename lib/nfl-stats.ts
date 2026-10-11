
const SEASON = 2026;

const DATA_URL =
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${SEASON}.csv`;

export type NFLPlayerGame = {
  player: string;
  team: string;
  position: string;
  season: number;
  week: number;
  passingYards: number | null;
  rushingYards: number | null;
  receivingYards: number | null;
  receptions: number | null;
  targets: number | null;
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (
      (char === "\n" || char === "\r") &&
      !quoted
    ) {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }

      row.push(field);

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);

  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  return rows;
}

export async function getNFLStats() {
  const response = await fetch(DATA_URL, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(
      `NFL statistics download failed: ${response.status}`
    );
  }

  const csv = await response.text();
  const rows = parseCSV(csv);

  if (rows.length < 2) {
    throw new Error("NFL statistics dataset is empty");
  }

  const headers = rows[0].map((header) =>
    header.replace(/^\uFEFF/, "").trim()
  );

  const index = (name: string) =>
    headers.indexOf(name);

  const get = (row: string[], name: string) => {
    const column = index(name);
    return column >= 0 ? row[column] ?? "" : "";
  };

  const getFirst = (
    row: string[],
    names: string[]
  ) => {
    for (const name of names) {
      const value = get(row, name);

      if (value !== "") {
        return value;
      }
    }

    return "";
  };

  const number = (
    row: string[],
    name: string
  ): number | null => {
    const value = get(row, name);

    if (value === "") return null;

    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  };

  const required = [
    "season",
    "week",
    "player_display_name",
    "position",
    "passing_yards",
    "rushing_yards",
    "receiving_yards",
    "receptions",
    "targets",
  ];

  const missing = required.filter(
    (column) => index(column) === -1
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing expected columns: ${missing.join(", ")}`
    );
  }

  const players: NFLPlayerGame[] = rows
    .slice(1)
    .filter(
      (row) => number(row, "season") === SEASON
    )
    .map((row) => ({
      player: get(
        row,
        "player_display_name"
      ),

      team:
        getFirst(row, [
          "recent_team",
          "team",
          "team_name",
          "team_abbr",
        ]) || "Unknown",

      position: get(row, "position"),

      season: number(row, "season") ?? SEASON,
      week: number(row, "week") ?? 0,

      passingYards: number(
        row,
        "passing_yards"
      ),

      rushingYards: number(
        row,
        "rushing_yards"
      ),

      receivingYards: number(
        row,
        "receiving_yards"
      ),

      receptions: number(
        row,
        "receptions"
      ),

      targets: number(
        row,
        "targets"
      ),
    }))
    .filter(
      (player) =>
        player.player !== "" &&
        player.week > 0 &&
        ["QB", "RB", "WR", "TE"].includes(
          player.position
        )
    );

  if (players.length === 0) {
    throw new Error(
      "No 2026 weekly player records found"
    );
  }

  const latestWeek = Math.max(
    ...players.map(
      (player) => player.week
    )
  );

  return {
    success: true,
    source: "nflverse",
    season: SEASON,
    latestWeek,
    count: players.length,
    players,
    updatedAt: new Date().toISOString(),
  };
}
