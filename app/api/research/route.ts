
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PlayerGame = {
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

type PropMarket = {
  ticker: string;
  player: string;
  propType: string;
  line: number | null;
  title?: string;
  gameTime?: string | null;
};

type StatsResponse = {
  success: boolean;
  season: number;
  latestWeek?: number;
  players?: PlayerGame[];
};

type MarketsResponse = {
  success: boolean;
  markets?: PropMarket[];
};

function normalizeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
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

function average(values: number[]) {
  return (
    values.reduce((total, value) => total + value, 0) /
    values.length
  );
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
      throw new Error(
        "Unable to retrieve Kalshi or NFL statistics"
      );
    }

    const marketData =
      (await marketResponse.json()) as MarketsResponse;

    const statsData =
      (await statsResponse.json()) as StatsResponse;

    if (!marketData.success || !statsData.success) {
      throw new Error(
        "One or more research data sources failed"
      );
    }

    const season = statsData.season;
    const markets = marketData.markets ?? [];
    const games = statsData.players ?? [];

    // Group weekly records by player name.
    const playerIndex = new Map<string, PlayerGame[]>();

    for (const game of games) {
      if (game.season !== season) continue;

      const key = normalizeName(game.player);
      if (!key) continue;

      const existing = playerIndex.get(key) ?? [];
      existing.push(game);
      playerIndex.set(key, existing);
    }

    // Keep only the latest five regular weekly
    // records per player, in newest-first order.
    for (const [key, playerGames] of playerIndex) {
      playerGames.sort(
        (a, b) =>
          b.season - a.season ||
          b.week - a.week
      );

      playerIndex.set(key, playerGames.slice(0, 5));
    }

    const research = markets.flatMap((market) => {
      if (
        !market.player ||
        !market.propType ||
        market.line == null ||
        !Number.isFinite(market.line)
      ) {
        return [];
      }

      const key = normalizeName(market.player);
      const playerGames = playerIndex.get(key);

      if (!playerGames || playerGames.length === 0) {
        return [];
      }

      const gameValues = playerGames
        .map((game) => ({
          week: game.week,
          value: getStat(game, market.propType),
        }))
        .filter(
          (
            game
          ): game is { week: number; value: number } =>
            game.value !== null &&
            Number.isFinite(game.value)
        );

      if (gameValues.length === 0) {
        return [];
      }

      const values = gameValues.map(
        (game) => game.value
      );

      const recentAverage = average(values);

      // Kalshi's "250+" means reaching at least 250,
      // not strictly exceeding 250.
      const hits = values.filter(
        (value) => value >= market.line!
      ).length;

      const hitRate = (hits / values.length) * 100;

      const latestGame = playerGames[0];

      return [
        {
          player: market.player,
          team: latestGame.team,
          position: latestGame.position,
          season,
          propType: market.propType,
          line: market.line,
          platform: "Kalshi",
          ticker: market.ticker,
          gameTime: market.gameTime ?? null,
          gamesAnalyzed: values.length,
          recentGames: gameValues,
          recentValues: values,
          recentAverage: Number(
            recentAverage.toFixed(1)
          ),
          hits,
          hitRate: Number(hitRate.toFixed(1)),
          differenceFromLine: Number(
            (recentAverage - market.line).toFixed(1)
          ),
          analysisReady: false,
          dataLimitations: [
            "Historical hit rate is not a predicted probability.",
            "Opponent matchup has not been evaluated.",
            "Injuries and expected playing time have not been verified.",
            "Other platforms have not yet been compared.",
          ],
        },
      ];
    });

    research.sort(
      (a, b) =>
        b.gamesAnalyzed - a.gamesAnalyzed ||
        b.hits - a.hits
    );

    return NextResponse.json({
      success: true,
      source: "nflverse + Kalshi",
      season,
      latestWeek: statsData.latestWeek ?? null,
      marketsChecked: markets.length,
      count: research.length,
      research,
      recommendationsReady: false,
      updatedAt: new Date().toISOString(),
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
            : "Unable to build player research",
      },
      { status: 500 }
    );
  }
}
