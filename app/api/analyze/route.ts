
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { getKalshiMarkets } from "../../../lib/kalshi";
import { getNFLStats, type NFLPlayerGame } from "../../../lib/nfl-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_SECONDS = 6 * 60 * 60;
const GITHUB_OWNER = "Jcap37";
const GITHUB_REPO = "PropEdge-AI";
const GITHUB_BRANCH = "main";
const PUBLISHED_PATH = "data/published-research.json";

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.ANALYZE_ADMIN_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!secret || !provided) return false;

  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(provided, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

type SupportedProp =
  | "Passing Yards"
  | "Rushing Yards"
  | "Receiving Yards"
  | "Receptions"
  | "Rushing + Receiving Yards";

function statForProp(game: NFLPlayerGame, prop: SupportedProp): number | null {
  switch (prop) {
    case "Passing Yards": return game.passingYards;
    case "Rushing Yards": return game.rushingYards;
    case "Receiving Yards": return game.receivingYards;
    case "Receptions": return game.receptions;
    case "Rushing + Receiving Yards":
      return game.rushingYards !== null && game.receivingYards !== null
        ? game.rushingYards + game.receivingYards
        : null;
  }
}

function supportedProp(value: string): SupportedProp | null {
  const allowed: SupportedProp[] = [
    "Passing Yards", "Rushing Yards", "Receiving Yards",
    "Receptions", "Rushing + Receiving Yards",
  ];
  return allowed.find((prop) => prop.toLowerCase() === value.toLowerCase()) ?? null;
}

async function generateAnalysis() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key is not configured.");

  const [kalshi, nfl] = await Promise.all([getKalshiMarkets(), getNFLStats()]);
  const playerGames = new Map<string, NFLPlayerGame[]>();

  for (const game of nfl.players) {
    const key = normalizeName(game.player);
    const existing = playerGames.get(key) ?? [];
    existing.push(game);
    playerGames.set(key, existing);
  }

  const candidates = kalshi.markets.flatMap((market) => {
    const propType = supportedProp(market.propType ?? "");
    if (!propType || market.line == null || !Number.isFinite(market.line)) return [];

    const games = (playerGames.get(normalizeName(market.player)) ?? [])
      .filter((game) => game.week <= nfl.latestWeek)
      .sort((a, b) => b.week - a.week);

    // Use the last five recorded appearances, including zero-stat games.
    // Missing statistics are excluded rather than treated as zero.
    const recent = games.slice(0, 5);
    const values = recent.map((game) => statForProp(game, propType));
    if (recent.length < 3 || values.some((value) => value === null)) return [];
    const stats = values as number[];
    const average = stats.reduce((sum, value) => sum + value, 0) / stats.length;
    const hits = stats.filter((value) => value >= market.line).length;

    return [{
      ticker: market.ticker,
      player: market.player,
      propType,
      line: market.line,
      gameTime: market.gameTime,
      recentValues: stats,
      sampleSize: stats.length,
      average: Number(average.toFixed(1)),
      historicalHits: hits,
      historicalHitRate: Number((100 * hits / stats.length).toFixed(1)),
      differenceFromLine: Number((average - market.line).toFixed(1)),
      marketVolume: market.volume ?? 0,
    }];
  });

  // Avoid ranking incomparable yard and reception scales by raw difference.
  // Give the model a balanced, diverse selection across stat categories.
  const groups = new Map<SupportedProp, typeof candidates>();
  for (const item of candidates) {
    const group = groups.get(item.propType) ?? [];
    group.push(item);
    groups.set(item.propType, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.marketVolume - a.marketVolume);
  }
  const selected: typeof candidates = [];
  const selectedTickers = new Set<string>();
  const categories: SupportedProp[] = [
    "Passing Yards", "Rushing Yards", "Receiving Yards",
    "Receptions", "Rushing + Receiving Yards",
  ];
  for (let index = 0; selected.length < 15; index++) {
    let added = false;
    for (const category of categories) {
      const item = groups.get(category)?.[index];
      if (item && !selectedTickers.has(item.ticker) && selected.length < 15) {
        selected.push(item);
        selectedTickers.add(item.ticker);
        added = true;
      }
    }
    if (!added) break;
  }

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
- Compare each threshold ONLY to its own named statistic.
- Some contracts are Protected or milestone contracts; do not assume standard settlement rules.
- Do not treat the selection of candidates as evidence of profitability.
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

// Reuse successful results for six hours.
const getCachedAnalysis = unstable_cache(
  generateAnalysis,
  ["propedge-ai-analysis-v2-multi-prop"],
  {
    revalidate: CACHE_SECONDS,
    tags: ["propedge-ai-analysis-v2"],
  }
);

// Save the research to your GitHub repository.
async function publishToGitHub(
  analysis: Awaited<ReturnType<typeof generateAnalysis>>
) {
  const token = process.env.GITHUB_PUBLISH_TOKEN;

  if (!token) {
    throw new Error(
      "GITHUB_PUBLISH_TOKEN is not configured in Vercel."
    );
  }

  const url =
    `https://api.github.com/repos/` +
    `${GITHUB_OWNER}/${GITHUB_REPO}/contents/${PUBLISHED_PATH}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Check whether a published file already exists.
  const existingResponse = await fetch(
    `${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    {
      headers,
      cache: "no-store",
    }
  );

  let sha: string | undefined;

  if (existingResponse.status === 200) {
    const existing: {
      sha?: string;
      content?: string;
      encoding?: string;
    } = await existingResponse.json();

    if (!existing.sha) {
      throw new Error(
        "GitHub returned a file without its SHA."
      );
    }

    sha = existing.sha;

    // Avoid unnecessary commits for unchanged research.
    if (
      existing.encoding === "base64" &&
      typeof existing.content === "string"
    ) {
      const oldText = Buffer.from(
        existing.content.replace(/\s/g, ""),
        "base64"
      ).toString("utf8");

      try {
        if (
          JSON.stringify(JSON.parse(oldText)) ===
          JSON.stringify(analysis)
        ) {
          return {
            published: true,
            changed: false,
          };
        }
      } catch {
        // Replace invalid old JSON with valid research.
      }
    }
  } else if (existingResponse.status !== 404) {
    console.error(
      "GitHub read failed:",
      existingResponse.status
    );

    throw new Error(
      `GitHub could not read the published file ` +
      `(HTTP ${existingResponse.status}).`
    );
  }

  const content = Buffer.from(
    JSON.stringify(analysis, null, 2) + "\n",
    "utf8"
  ).toString("base64");

  const publishResponse = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Publish PropEdge AI research",
      content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
    cache: "no-store",
  });

  if (!publishResponse.ok) {
    console.error(
      "GitHub publish failed:",
      publishResponse.status
    );

    throw new Error(
      `GitHub publishing failed ` +
      `(HTTP ${publishResponse.status}). ` +
      `Check token permissions and repository access.`
    );
  }

  return {
    published: true,
    changed: true,
  };
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

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
        authenticationRequired: true,
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

    if (!process.env.ANALYZE_ADMIN_SECRET) {
      return NextResponse.json(
        {
          success: false,
          error: "Admin authentication is not configured.",
        },
        { status: 503 }
      );
    }

    // Require your password before any AI request.
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Admin authorization required.",
        },
        { status: 401 }
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

    if (!process.env.GITHUB_PUBLISH_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: "GitHub publishing token is not configured.",
        },
        { status: 503 }
      );
    }

    const analysis = await getCachedAnalysis();

    let publication;

    try {
      publication = await publishToGitHub(analysis);
    } catch (error) {
      console.error(
        "PropEdge AI publishing error:",
        error
      );

      return NextResponse.json(
        {
          ...analysis,
          published: false,
          publishError:
            error instanceof Error
              ? error.message
              : "Publishing failed.",
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    return NextResponse.json(
      {
        ...analysis,
        ...publication,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "PropEdge AI analysis error:",
      error
    );

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
