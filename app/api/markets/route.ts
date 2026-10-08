import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Market = {
  id: string;
  question?: string;
  groupItemTitle?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  volume?: string | number;
  liquidity?: string | number;
  active?: boolean;
  closed?: boolean;
};

type Event = {
  title?: string;
  slug?: string;
  endDate?: string;
  markets?: Market[];
};

const playerPropTerms =
  /\b(passing yards|rushing yards|receiving yards|receptions|completions|passing touchdowns|rushing touchdowns|receiving touchdowns|anytime touchdown|touchdown scorer|interceptions|player props?)\b/i;

const seasonLongTerms =
  /\b(season|regular season|single.season|2026.2027|mvp|super bowl|playoffs|award|record)\b/i;

export async function GET() {
  try {
    const url = new URL(
      "https://gamma-api.polymarket.com/events"
    );

    url.searchParams.set("tag_slug", "nfl");
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", "100");

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Polymarket returned ${response.status}`
      );
    }

    const events = (await response.json()) as Event[];

    const markets = events.flatMap((event) => {
      const eventTitle = event.title ?? "";

      // Exclude season-long prediction events.
      if (seasonLongTerms.test(eventTitle)) {
        return [];
      }

      return (event.markets ?? [])
        .filter((market) => {
          const question = market.question ?? "";
          const label = market.groupItemTitle ?? "";

          const marketText = `${question} ${label}`;

          return (
            market.active !== false &&
            market.closed !== true &&
            playerPropTerms.test(marketText) &&
            !seasonLongTerms.test(marketText)
          );
        })
        .map((market) => ({
          id: market.id,
          event: eventTitle,
          question: market.question ?? "",
          outcomes: market.outcomes ?? "[]",
          outcomePrices: market.outcomePrices ?? "[]",
          volume: market.volume ?? 0,
          liquidity: market.liquidity ?? 0,
        }));
    });

    const uniqueMarkets = Array.from(
      new Map(
        markets.map((market) => [market.id, market])
      ).values()
    );

    return NextResponse.json({
      success: true,
      source: "Polymarket",
      sport: "NFL",
      count: uniqueMarkets.length,
      markets: uniqueMarkets,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to retrieve NFL markets",
      },
      { status: 500 }
    );
  }
}
