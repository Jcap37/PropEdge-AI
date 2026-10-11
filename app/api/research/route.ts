import { NextResponse } from "next/server";
import { getKalshiMarkets } from "../../../lib/kalshi";
import { getNFLStats, type NFLPlayerGame } from "../../../lib/nfl-stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SupportedProp =
  | "Passing Yards"
  | "Rushing Yards"
  | "Receiving Yards"
  | "Receptions"
  | "Rushing + Receiving Yards";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function supportedProp(propType: string): SupportedProp | null {
  switch (propType.trim().toLowerCase()) {
    case "passing yards": return "Passing Yards";
    case "rushing yards": return "Rushing Yards";
    case "receiving yards": return "Receiving Yards";
    case "receptions": return "Receptions";
    case "rushing + receiving yards": return "Rushing + Receiving Yards";
    default: return null;
  }
}

function statForGame(game: NFLPlayerGame, prop: SupportedProp): number | null {
  switch (prop) {
    case "Passing Yards": return game.passingYards;
    case "Rushing Yards": return game.rushingYards;
    case "Receiving Yards": return game.receivingYards;
    case "Receptions": return game.receptions;
    case "Rushing + Receiving Yards":
      // A missing value must not silently turn into zero.
      return game.rushingYards === null || game.receivingYards === null
        ? null
        : game.rushingYards + game.receivingYards;
  }
}

export async function GET() {
  try {
    const [kalshi, nfl] = await Promise.all([getKalshiMarkets(), getNFLStats()]);
    const gamesByPlayer = new Map<string, NFLPlayerGame[]>();

    for (const game of nfl.players) {
      if (game.week > nfl.latestWeek) continue;
      const key = normalizeName(game.player);
      const games = gamesByPlayer.get(key) ?? [];
      games.push(game);
      gamesByPlayer.set(key, games);
    }

    const byPropType: Record<string, number> = {};
    const research = kalshi.markets.flatMap((market) => {
      const prop = supportedProp(market.propType ?? "");
      if (!prop || market.line == null || !Number.isFinite(market.line)) return [];

      const games = (gamesByPlayer.get(normalizeName(market.player)) ?? [])
        .filter((game) => statForGame(game, prop) !== null)
        .sort((a, b) => b.week - a.week)
        .slice(0, 5);

      if (games.length === 0) return [];
      const values = games.map((game) => statForGame(game, prop) as number);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const hits = values.filter((value) => value >= market.line).length;
      const hitRate = hits / values.length;
      byPropType[prop] = (byPropType[prop] ?? 0) + 1;

      return [{
        id: market.id,
        ticker: market.ticker,
        player: market.player,
        propType: prop,
        line: market.line,
        gameTime: market.gameTime,
        sampleSize: values.length,
        recentValues: values,
        average: Math.round(average * 10) / 10,
        hits,
        hitRatePercent: Math.round(hitRate * 100),
        differenceFromLine: Math.round((average - market.line) * 10) / 10,
        marketVolume: market.volume,
        evidence: `${market.player} averaged ${average.toFixed(1)} ${prop.toLowerCase()} across ${values.length} recent recorded games and reached ${market.line}+ in ${hits} of those games.`,
      }];
    }).sort((a, b) => (b.marketVolume ?? 0) - (a.marketVolume ?? 0));

    return NextResponse.json({
      success: true,
      source: { markets: "Kalshi", statistics: "nflverse" },
      season: nfl.season,
      latestWeek: nfl.latestWeek,
      marketsChecked: kalshi.count,
      count: research.length,
      byPropType,
      supportedPropTypes: ["Passing Yards", "Rushing Yards", "Receiving Yards", "Receptions", "Rushing + Receiving Yards"],
      research,
      updatedAt: new Date().toISOString(),
      disclaimer: "Historical hit rates are descriptive, not predictions of future outcomes. Protected contracts may have different settlement rules.",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      count: 0,
      research: [],
      error: error instanceof Error ? error.message : "Research failed",
    }, { status: 500 });
  }
}
