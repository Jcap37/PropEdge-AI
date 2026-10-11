
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
  line: number;
  title?: string;
  gameTime?: string | null;
};

function normalizeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getStat(game: PlayerGame, propType: string) {
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

async function fetchJSON(
  url: string,
  source: string
) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `${source} returned HTTP ${response.status}: ${text.slice(0, 120)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${source} returned invalid JSON. Response begins: ${text.slice(0, 100)}`
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;

    const [marketData, statsData] =
      await Promise.all([
        fetchJSON(
          `${origin}/api/kalshi`,
          "Kalshi API"
        ),
        fetchJSON(
          `${origin}/api/nfl-stats`,
          "NFL Stats API"
        ),
      ]);

    if (!marketData.success) {
      throw new Error("Kalshi API reported failure");
    }

    if (!statsData.success) {
      throw new Error("NFL Stats API reported failure");
    }

    const markets: PropMarket[] =
      marketData.markets ?? [];

    const games: PlayerGame[] =
      statsData.players ?? [];

    const season = statsData.season;

    const playerIndex = new Map<
      string,
      PlayerGame[]
    >();

    for (const game of games) {
      if (game.season !== season) continue;

      const key = normalizeName(game.player);
      const existing = playerIndex.get(key) ?? [];

      existing.push(game);
      playerIndex.set(key, existing);
    }

    for (const [key, playerGames] of playerIndex) {
      playerGames.sort(
        (a, b) =>
          b.season - a.season ||
          b.week - a.week
      );

      playerIndex.set(
        key,
        playerGames.slice(0, 5)
      );
    }

    const research = markets.flatMap((market) => {
      if (
        !market.player ||
        !market.propType ||
        !Number.isFinite(market.line)
      ) {
        return [];
      }

      const playerGames =
        playerIndex.get(
          normalizeName(market.player)
        );

      if (!playerGames?.length) {
        return [];
      }

      const recentGames = playerGames
        .map((game) => ({
          week: game.week,
          value: getStat(
            game,
            market.propType
          ),
        }))
        .filter(
          (
            game
          ): game is {
            week: number;
            value: number;
          } =>
            game.value !== null &&
            Number.isFinite(game.value)
        );

      if (!recentGames.length) {
        return [];
      }

      const values = recentGames.map(
        (game) => game.value
      );

      const total = values.reduce(
        (sum, value) => sum + value,
        0
      );

      const recentAverage =
        total / values.length;

      const hits = values.filter(
        (value) => value >= market.line
      ).length;

      return [
        {
          player: market.player,
          team: playerGames[0].team,
          position: playerGames[0].position,
          propType: market.propType,
          line: market.line,
          platform: "Kalshi",
          ticker: market.ticker,
          gameTime: market.gameTime ?? null,
          gamesAnalyzed: values.length,
          recentGames,
          recentAverage: Number(
            recentAverage.toFixed(1)
          ),
          hits,
          hitRate: Number(
            (
              (hits / values.length) *
              100
            ).toFixed(1)
          ),
          differenceFromLine: Number(
            (
              recentAverage - market.line
            ).toFixed(1)
          ),
          analysisReady: false,
        },
      ];
    });

    return NextResponse.json({
      success: true,
      source: "nflverse + Kalshi",
      season,
      latestWeek:
        statsData.latestWeek ?? null,
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
            : "Research API failed",
      },
      { status: 500 }
    );
  }
}
