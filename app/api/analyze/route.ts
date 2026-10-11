
import { NextRequest, NextResponse } from "next/server";
import { getKalshiMarkets } from "../../../lib/kalshi";
import { getNFLStats } from "../../../lib/nfl-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));

    if (body?.action === "health-check") {
      return NextResponse.json({
        success: true,
        message: "PropEdge AI backend is configured.",
        apiKeyConfigured: true,
        analysisEnabled: true,
      });
    }

    if (body?.action !== "analyze") {
      return NextResponse.json(
        {
          success: false,
          error: 'Use {"action":"analyze"} to run AI analysis.',
        },
        { status: 400 }
      );
    }

    // Load verified data directly.
    // Avoid internal HTTP calls blocked by Vercel protection.
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

        // Require at least 3 recorded games.
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

    // Limit AI input to reduce cost and processing time.
    const selected = candidates.slice(0, 15);

    if (selected.length === 0) {
      return NextResponse.json({
        success: true,
        analysisEnabled: true,
        recommendations: [],
        message: "No props currently meet the minimum data requirements.",
      });
    }

    const systemPrompt = `
You are PropEdge AI, an NFL player-prop research assistant.

Analyze ONLY the verified data provided.

Rules:
- Never invent injuries, opponents, weather, matchups, statistics,
  player availability, betting prices, or probabilities.
- Historical hit rates are NOT predicted win probabilities.
- Do not call any prop a guaranteed win or lock.
- Explain the evidence and uncertainty.
- A small sample of 3-5 games is limited evidence.
- Do not assume the player will start or play.
- Do not infer positive expected value without reliable prices
  and an independently validated probability model.
- If evidence is weak, label the prop "insufficient_evidence".
- You may label a prop "worth_researching" when recent production
  supports the threshold, but this is not a bet recommendation.
- Return only valid JSON.

Return this exact JSON structure:
{
  "recommendations": [
    {
      "ticker": "exact ticker from input",
      "player": "exact player from input",
      "line": 250,
      "verdict": "worth_researching",
      "reason": "Concise evidence-based explanation",
      "risks": "Concise explanation of uncertainty"
    }
  ]
}

Allowed verdicts:
"worth_researching"
"insufficient_evidence"

Include at most 5 props.
Do not repeat the same player.
`;

    const openAIResponse = await fetch(
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

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();

      console.error(
        "OpenAI analysis failed:",
        openAIResponse.status,
        errorText.slice(0, 500)
      );

      return NextResponse.json(
        {
          success: false,
          error: `OpenAI request failed with HTTP ${openAIResponse.status}.`,
        },
        { status: 502 }
      );
    }

    const aiData = await openAIResponse.json();

    const content =
      aiData.choices?.[0]?.message?.content;

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
      throw new Error("OpenAI returned an invalid analysis format.");
    }

    const allowed = new Map(
      selected.map((item) => [item.ticker, item])
    );

    const seenPlayers = new Set<string>();

    const recommendations = parsed.recommendations
      .filter((item: unknown) => {
        if (
          typeof item !== "object" ||
          item === null ||
          !("ticker" in item) ||
          typeof item.ticker !== "string" ||
          !allowed.has(item.ticker)
        ) {
          return false;
        }

        return true;
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
              : "Player availability and matchup context are not verified.",
        };
      })
      .filter((item) => {
        const key = normalizeName(item.player);

        if (seenPlayers.has(key)) return false;

        seenPlayers.add(key);
        return true;
      })
      .slice(0, 5);

    return NextResponse.json({
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
        "AI-generated research commentary is not a validated " +
        "forecast or guarantee of betting outcomes.",
    });
  } catch (error) {
    console.error("PropEdge AI error:", error);

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
