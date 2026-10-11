
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PlayerGame = {
  player: string;
  team: string;
  position: string;
  season: number;
  week: number;
  passingYards: number;
  rushingYards: number;
  receivingYards: number;
  receptions: number;
  targets: number;
};

type PropMarket = {
  player: string;
  propType: string;
  line: number | null;
  ticker: string;
};

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getStat(
  game: PlayerGame,
  propType: string
): number | null {
  const type = propType.toLowerCase();

  if (type.includes("passing yards")) {
    return game.passingYards;
  }

  if (type.includes("rushing yards")) {
    return game.rushingYards;
  }

  if (type.includes("receiving yards")) {
    return game.receivingYards;
  }

  if (type.includes("receptions")) {
    return game.receptions;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;

    const [marketResponse, statsResponse] =
      await Promise.all([
        fetch(`${origin}/api/kalshi`, {
          cache: "no-store",
        }),
        fetch(`${origin}/api/nfl-stats`, {
          cache: "no-store",
        }),
      ]);

    if (!marketResponse.ok || !statsResponse.ok) {
      throw new Error("Unable to retrieve source data");
    }

    const marketData = await marketResponse.json();
    const statsData = await statsResponse.json();

    if (!marketData.success || !statsData.success) {
      throw new Error("A data source failed");
    }

    const markets: PropMarket[] =
      marketData.markets ?? [];

    const games: PlayerGame[] =
      statsData.players ?? [];

    const research = markets
      .filter(
        (market) =>
          market.line != null &&
          market.player &&
          market.propType
      )
      .map((market) => {
        const playerGames = games
          .filter(
            (game) =>
              normalizeName(game.player) ===
              normalizeName(market.player)
          )
          .sort(
            (a, b) =>
              b.season - a.season ||
              b.week - a.week
          )
          .slice(0, 5);

        const values = playerGames
          .map((game) =>
            getStat(game, market.propType)
          )
          .filter(
            (value): value is number =>
              value !== null
          );

        if (values.length === 0) return null;

        const average =
          values.reduce((sum, value) => sum + value, 0) /
          values.length;

        const hits = values.filter(
          (value) => value >= market.line!
        ).length;

        return {
          player: market.player,
          propType: market.propType,
          line: market.line,
          platform: "Kalshi",
          ticker: market.ticker,
          gamesAnalyzed: values.length,
          recentValues: values,
          recentAverage: Number(average.toFixed(1)),
          hitRate: Number(
            ((hits / values.length) * 100).toFixed(1)
          ),
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      count: research.length,
      research,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to build player research",
      },
      { status: 500 }
    );
  }
}
