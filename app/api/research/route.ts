
import { NextResponse } from "next/server";
import { getKalshiMarkets } from "../../../lib/kalshi";
import {
  getNFLStats,
  type NFLPlayerGame,
} from "../../../lib/nfl-stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function GET() {
  try {
    // Get data directly from shared functions.
    // No internal HTTP requests or Vercel auth issues.
    const [kalshi, nfl] = await Promise.all([
      getKalshiMarkets(),
      getNFLStats(),
    ]);

    const gamesByPlayer = new Map<
      string,
      NFLPlayerGame[]
    >();

    for (const game of nfl.players) {
      if (game.position !== "QB") continue;

      const key = normalizeName(game.player);
      const existing = gamesByPlayer.get(key) ?? [];

      existing.push(game);
      gamesByPlayer.set(key, existing);
    }

    const research = kalshi.markets
      .map((market) => {
        if (market.line === null) return null;

        const key = normalizeName(market.player);

        const recentGames = (
          gamesByPlayer.get(key) ?? []
        )
          .filter(
            (game) =>
              game.passingYards !== null &&
              game.week <= nfl.latestWeek
          )
          .sort((a, b) => b.week - a.week)
          .slice(0, 5);

        if (recentGames.length === 0) {
          return null;
        }

        const yards = recentGames.map(
          (game) => game.passingYards as number
        );

        const total = yards.reduce(
          (sum, value) => sum + value,
          0
        );

        const average = total / yards.length;

        // "250+" means 250 or more.
        const hits = yards.filter(
          (value) => value >= market.line!
        ).length;

        const hitRate = hits / yards.length;

        return {
          id: market.id,
          ticker: market.ticker,
          player: market.player,
          propType: market.propType,
          line: market.line,
          gameTime: market.gameTime,
          sampleSize: yards.length,
          recentPassingYards: yards,
          averagePassingYards:
            Math.round(average * 10) / 10,
          hits,
          hitRatePercent:
            Math.round(hitRate * 100),
          differenceFromLine:
            Math.round(
              (average - market.line) * 10
            ) / 10,
          marketVolume: market.volume,
          evidence:
            `${market.player} averaged ` +
            `${average.toFixed(1)} passing yards ` +
            `across ${yards.length} recent ` +
            `recorded games and reached ` +
            `${market.line}+ yards in ` +
            `${hits} of those games.`,
        };
      })
      .filter(
        (item): item is NonNullable<
          typeof item
        > => item !== null
      )
      .sort(
        (a, b) =>
          b.marketVolume - a.marketVolume
      );

    return NextResponse.json({
      success: true,
      source: {
        markets: "Kalshi",
        statistics: "nflverse",
      },
      season: nfl.season,
      latestWeek: nfl.latestWeek,
      marketsChecked: kalshi.count,
      count: research.length,
      research,
      updatedAt: new Date().toISOString(),
      disclaimer:
        "Historical hit rates are descriptive, " +
        "not predictions of future outcomes.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        count: 0,
        research: [],
        error:
          error instanceof Error
            ? error.message
            : "Research failed",
      },
      { status: 500 }
    );
  }
}
