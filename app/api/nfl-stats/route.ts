
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

const DATA_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv";

export async function GET() {
  try {
    const response = await fetch(DATA_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `NFL data source returned ${response.status}`
      );
    }

    const csv = await response.text();
    const lines = csv.trim().split(/\r?\n/);

    if (lines.length < 2) {
      throw new Error("No player statistics found");
    }

    const headers = lines[0]
      .replace(/^\uFEFF/, "")
      .split(",");

    const getIndex = (name: string) =>
      headers.indexOf(name);

    const seasonIndex = getIndex("season");
    const weekIndex = getIndex("week");
    const nameIndex = getIndex("player_display_name");
    const teamIndex = getIndex("recent_team");
    const positionIndex = getIndex("position");
    const passingIndex = getIndex("passing_yards");
    const rushingIndex = getIndex("rushing_yards");
    const receivingIndex = getIndex("receiving_yards");
    const receptionsIndex = getIndex("receptions");
    const targetsIndex = getIndex("targets");

    const requiredColumns = [
      seasonIndex,
      weekIndex,
      nameIndex,
      teamIndex,
      positionIndex,
    ];

    if (requiredColumns.some((index) => index === -1)) {
      throw new Error(
        "NFL statistics file is missing required columns"
      );
    }

    const players = lines
      .slice(1)
      .map((line) => line.split(","))
      .filter(
        (row) =>
          Number(row[seasonIndex]) === CURRENT_SEASON
      )
      .map((row) => ({
        player: row[nameIndex],
        team: row[teamIndex],
        position: row[positionIndex],
        season: Number(row[seasonIndex]),
        week: Number(row[weekIndex]),
        passingYards:
          passingIndex >= 0
            ? Number(row[passingIndex]) || 0
            : 0,
        rushingYards:
          rushingIndex >= 0
            ? Number(row[rushingIndex]) || 0
            : 0,
        receivingYards:
          receivingIndex >= 0
            ? Number(row[receivingIndex]) || 0
            : 0,
        receptions:
          receptionsIndex >= 0
            ? Number(row[receptionsIndex]) || 0
            : 0,
        targets:
          targetsIndex >= 0
            ? Number(row[targetsIndex]) || 0
            : 0,
      }))
      .filter((player) =>
        ["QB", "RB", "WR", "TE"].includes(
          player.position
        )
      );

    return NextResponse.json({
      success: true,
      source: "nflverse",
      season: CURRENT_SEASON,
      count: players.length,
      players,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        season: CURRENT_SEASON,
        count: 0,
        players: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to load NFL statistics",
      },
      { status: 500 }
    );
  }
}
