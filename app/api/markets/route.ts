import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Market = {
  id: string;
  question: string;
  outcomes: string | string[];
  outcomePrices: string | string[];
  volume?: string | number;
  liquidity?: string | number;
  active?: boolean;
  closed?: boolean;
};

type Event = {
  title?: string;
  markets?: Market[];
};

const propKeywords =
  /passing yards|rushing yards|receiving yards|receptions|passing touchdowns|rushing touchdowns|receiving touchdowns|interceptions|anytime touchdown|touchdown scorer/i;

export async function GET() {
  try {
    const searches = [
      "NFL passing yards",
      "NFL rushing yards",
      "NFL receiving yards",
      "NFL touchdown",
    ];

    const results = await Promise.all(
      searches.map(async (query) => {
        const url = new URL(
          "https://gamma-api.polymarket.com/public-search"
        );

        url.searchParams.set("q", query);
        url.searchParams.set("limit_per_type", "20");
        url.searchParams.set("events_status", "active");

        const response = await fetch(url, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `Polymarket returned ${response.status}`
          );
        }

        return response.json();
      })
    );

    const markets = results.flatMap((result) =>
      ((result.events ?? []) as Event[]).flatMap(
        (event) =>
          (event.markets ?? [])
            .filter((market) => {
              const text =
                `${event.title ?? ""} ${market.question}`;

              return (
                propKeywords.test(text) &&
                market.active !== false &&
                market.closed !== true
              );
            })
            .map((market) => ({
              id: market.id,
              event: event.title,
              question: market.question,
              outcomes: market.outcomes,
              outcomePrices: market.outcomePrices,
              volume: market.volume,
              liquidity: market.liquidity,
            }))
      )
    );

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
