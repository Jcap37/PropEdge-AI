
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    const lines = csv.trim().split("\n");

    if (lines.length < 2) {
      throw new Error("No player statistics found");
    }

    const headers = lines[0].split(",");

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

    const rows = lines.slice(1).map((line) =>
      line.split(",")
    );

    const seasons = rows
      .map((row) => Number(row[seasonIndex]))
      .filter(Number.isFinite);

    const latestSeason = Math.max(...seasons);

    const players = rows
      .filter(
        (row) =>
          Number(row[seasonIndex]) === latestSeason
      )
      .map((row) => ({
        player: row[nameIndex],
        team: row[teamIndex],
        position: row[positionIndex],
        season: Number(row[seasonIndex]),
        week: Number(row[weekIndex]),
        passingYards:
          Number(row[passingIndex]) || 0,
        rushingYards:
          Number(row[rushingIndex]) || 0,
        receivingYards:
          Number(row[receivingIndex]) || 0,
        receptions:
          Number(row[receptionsIndex]) || 0,
        targets:
          Number(row[targetsIndex]) || 0,
      }))
      .filter((player) =>
        ["QB", "RB", "WR", "TE"].includes(
          player.position
        )
      );

    return NextResponse.json({
      success: true,
      source: "nflverse",
      season: latestSeason,
      count: players.length,
      players,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load NFL statistics",
      },
      { status: 500 }
    );
  }
}
