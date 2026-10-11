
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getKalshiMarkets } from "../../../lib/kalshi";
import { getNFLStats } from "../../../lib/nfl-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_SECONDS = 6 * 60 * 60;

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function generateAnalysis() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const [kalshi, nfl] = await Promise.all([
    getKalshiMarkets(),
    getNFLStats(),
  ]);

  const playerGames = new Map<
    string,
    typeof nfl.players
  >();

  for (const game of nfl.players) {
    if (game.position !== "QB") continue;

    const key = normalizeName(game.player);
    const existing = playerGames.get(key) ?? [];

    existing.push(game);
    playerGames.set(key, existing);
  }

  const candidates = kalshi.markets
    .map((market) => {
      if (market.line === null) return null;

      const games = (
        playerGames.get(normalizeName(market.player)) ?? []
      )
        .filter((game) => game.passingYards !== null)
        .sort((a, b) => b.week - a.week)
        .slice(0, 5);

      if (games.length < 3) return null;

      const yards = games.map(
        (game) => game.passingYards as number
      );

      const average =
        yards.reduce((sum, value) => sum + value, 0) /
        yards.length;

      const hits = yards.filter(
        (value) => value >= market.line!
      ).length;

      return {
        ticker: market.ticker,
        player: market.player,
        propType: market.propType,
        line: market.line,
        gameTime: market.gameTime,
        recentPassingYards: yards,
        sampleSize: yards.length,
        averagePassingYards: Number(average.toFixed(1)),
        historicalHits: hits,
        historicalHitRate: Number(
          ((hits / yards.length) * 100).toFixed(1)
        ),
        differenceFromLine: Number(
          (average - market.line).toFixed(1)
        ),
      };
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null
    )
    .sort(
      (a, b) =>
        b.differenceFromLine - a.differenceFromLine
    );

  const selected = candidates.slice(0, 15);

  if (selected.length === 0) {
    return {
      success: true,
      analysisEnabled: true,
      recommendations: [],
      candidatesReviewed: 0,
      count: 0,
      updatedAt: new Date().toISOString(),
      message: "No props meet the minimum data requirements.",
    };
  }

  const systemPrompt = `
You are PropEdge AI, an NFL player-prop research assistant.

Analyze ONLY the verified data provided.

Rules:
- Never invent injuries, opponents, weather, matchups,
  statistics, availability, prices, or probabilities.
- Historical hit rates are NOT future win probabilities.
- Never call a prop a guaranteed win or lock.
- Explain both supporting evidence and uncertainty.
- Samples of 3-5 games are limited evidence.
- Never assume a player will start or play.
- Do not claim positive expected value without
  validated probabilities and market prices.
- Label weak evidence as "insufficient_evidence".
- Use "worth_researching" only for props that deserve
  further investigation, not as a betting recommendation.
- Return valid JSON only.

Return:
{
  "recommendations": [
    {
      "ticker": "exact ticker from input",
      "player": "exact player from input",
      "line": 250,
      "verdict": "worth_researching",
      "reason": "Concise evidence-based explanation",
      "risks": "Concise uncertainty explanation"
    }
  ]
}

Allowed verdicts:
"worth_researching"
"insufficient_evidence"

Include at most 5 props.
Do not repeat players.
`;

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: JSON.stringify({
              season: nfl.season,
              latestWeek: nfl.latestWeek,
              candidates: selected,
            }),
          },
        ],
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const details = await response.text();

    console.error(
      "OpenAI request failed:",
      response.status,
      details.slice(0, 500)
    );

    throw new Error(
      `OpenAI request failed with HTTP ${response.status}.`
    );
  }

  const aiData = await response.json();
  const content = aiData.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("OpenAI returned no analysis content.");
  }

  const parsed: unknown = JSON.parse(content);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("recommendations" in parsed) ||
    !Array.isArray(parsed.recommendations)
  ) {
    throw new Error("Invalid AI analysis format.");
  }

  const allowed = new Map(
    selected.map((item) => [item.ticker, item])
  );

  const seenPlayers = new Set<string>();

  const recommendations = parsed.recommendations
    .filter((item: unknown) => {
      return (
        typeof item === "object" &&
        item !== null &&
        "ticker" in item &&
        typeof item.ticker === "string" &&
        allowed.has(item.ticker)
      );
    })
    .map((item: {
      ticker: string;
      verdict?: unknown;
      reason?: unknown;
      risks?: unknown;
    }) => {
      const verified = allowed.get(item.ticker)!;

      return {
        ...verified,
        verdict:
          item.verdict === "worth_researching"
            ? "worth_researching"
            : "insufficient_evidence",
        reason:
          typeof item.reason === "string"
            ? item.reason
            : "Review the historical statistics.",
        risks:
          typeof item.risks === "string"
            ? item.risks
            : "Player availability and matchup context are unverified.",
      };
    })
    .filter((item) => {
      const key = normalizeName(item.player);

      if (seenPlayers.has(key)) return false;

      seenPlayers.add(key);
      return true;
    })
    .slice(0, 5);

  return {
    success: true,
    analysisEnabled: true,
    source: {
      markets: "Kalshi",
      statistics: "nflverse",
      analysis: "OpenAI",
    },
    season: nfl.season,
    latestWeek: nfl.latestWeek,
    candidatesReviewed: selected.length,
    count: recommendations.length,
    recommendations,
    updatedAt: new Date().toISOString(),
    disclaimer:
      "AI-generated research is not a validated forecast " +
      "or guarantee of betting outcomes.",
  };
}

// Reuse successful analysis results for six hours.
// The cached function receives no user-controlled inputs.
const getCachedAnalysis = unstable_cache(
  generateAnalysis,
  ["propedge-ai-analysis-v1"],
  {
    revalidate: CACHE_SECONDS,
    tags: ["propedge-ai-analysis"],
  }
);

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    // Basic browser-origin check, not authentication.
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json(
        {
          success: false,
          error: "Cross-origin analysis requests are not allowed.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    if (body?.action === "health-check") {
      return NextResponse.json({
        success: true,
        message: "PropEdge AI backend is configured.",
        apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
        analysisEnabled: true,
        cacheDurationHours: 6,
      });
    }

    if (body?.action !== "analyze") {
      return NextResponse.json(
        {
          success: false,
          error: 'Use {"action":"analyze"} to run analysis.',
        },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "OpenAI API key is not configured.",
        },
        { status: 500 }
      );
    }

    const analysis = await getCachedAnalysis();

    return NextResponse.json(analysis, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("PropEdge AI analysis error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate analysis.",
      },
      { status: 500 }
    );
  }
}
