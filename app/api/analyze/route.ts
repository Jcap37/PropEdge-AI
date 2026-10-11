
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

type SupportedProp =
  | "Passing Yards"
  | "Rushing Yards"
  | "Receiving Yards"
  | "Receptions"
  | "Rushing + Receiving Yards";

const CATEGORIES: SupportedProp[] = [
  "Passing Yards",
  "Rushing Yards",
  "Receiving Yards",
  "Receptions",
  "Rushing + Receiving Yards",
];

type Candidate = {
  ticker: string;
  player: string;
  propType: SupportedProp;
  line: number;
  gameTime: string | null;
  recentValues: number[];
  sampleSize: number;
  average: number;
  historicalHits: number;
  historicalHitRate: number;
  differenceFromLine: number;
  marketVolume: number;
};

type Verdict = "worth_researching" | "insufficient_evidence";

type Recommendation = Candidate & {
  verdict: Verdict;
  reason: string;
  risks: string;
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.ANALYZE_ADMIN_SECRET;
  const provided = request.headers.get("x-admin-secret");

  if (!secret || !provided) return false;

  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(provided, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

function supportedProp(value: string): SupportedProp | null {
  return (
    CATEGORIES.find(
      (prop) => prop.toLowerCase() === value.toLowerCase()
    ) ?? null
  );
}

function statForProp(
  game: NFLPlayerGame,
  prop: SupportedProp
): number | null {
  switch (prop) {
    case "Passing Yards":
      return game.passingYards;

    case "Rushing Yards":
      return game.rushingYards;

    case "Receiving Yards":
      return game.receivingYards;

    case "Receptions":
      return game.receptions;

    case "Rushing + Receiving Yards":
      return game.rushingYards !== null &&
        game.receivingYards !== null
        ? game.rushingYards + game.receivingYards
        : null;
  }
}

function candidateScore(candidate: Candidate): number {
  // This is a research-priority score, not a win probability
  // or an expected-value calculation.
  const hitRate = candidate.historicalHitRate / 100;
  const sampleFactor = candidate.sampleSize / 5;

  const relativeDifference =
    Math.abs(candidate.differenceFromLine) /
    Math.max(Math.abs(candidate.line), 1);

  const volumeFactor =
    Math.log10(Math.max(candidate.marketVolume, 0) + 1) / 6;

  return (
    hitRate * 0.4 +
    sampleFactor * 0.2 +
    Math.min(relativeDifference, 1) * 0.25 +
    Math.min(volumeFactor, 1) * 0.15
  );
}

function selectDiverseCandidates(
  candidates: Candidate[],
  limit: number
): Candidate[] {
  const groups = new Map<SupportedProp, Candidate[]>();

  for (const category of CATEGORIES) {
    groups.set(category, []);
  }

  for (const candidate of candidates) {
    groups.get(candidate.propType)?.push(candidate);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        candidateScore(b) - candidateScore(a) ||
        b.marketVolume - a.marketVolume
    );
  }

  const selected: Candidate[] = [];
  const seenPlayers = new Set<string>();
  const seenTickers = new Set<string>();

  function add(candidate: Candidate): boolean {
    const playerKey = normalizeName(candidate.player);

    if (
      seenPlayers.has(playerKey) ||
      seenTickers.has(candidate.ticker)
    ) {
      return false;
    }

    selected.push(candidate);
    seenPlayers.add(playerKey);
    seenTickers.add(candidate.ticker);

    return true;
  }

  // First, take one distinct player from each available category.
  for (const category of CATEGORIES) {
    if (selected.length >= limit) break;

    for (const candidate of groups.get(category) ?? []) {
      if (add(candidate)) break;
    }
  }

  // Fill remaining slots using a round-robin selection.
  let index = 0;

  while (selected.length < limit) {
    let added = false;

    for (const category of CATEGORIES) {
      if (selected.length >= limit) break;

      const candidate = groups.get(category)?.[index];

      if (candidate && add(candidate)) {
        added = true;
      }
    }

    index++;

    if (
      !added &&
      CATEGORIES.every(
        (category) =>
          index >= (groups.get(category)?.length ?? 0)
      )
    ) {
      break;
    }
  }

  // If duplicate players prevented filling slots,
  // scan the remaining candidates by research priority.
  if (selected.length < limit) {
    const remaining = [...candidates].sort(
      (a, b) => candidateScore(b) - candidateScore(a)
    );

    for (const candidate of remaining) {
      if (selected.length >= limit) break;
      add(candidate);
    }
  }

  return selected;
}

function fallbackRecommendation(
  candidate: Candidate
): Recommendation {
  return {
    ...candidate,
    verdict: "insufficient_evidence",
    reason:
      `${candidate.player} averaged ${candidate.average} ` +
      `${candidate.propType.toLowerCase()} across ` +
      `${candidate.sampleSize} recent recorded games. ` +
      `The player reached ${candidate.line}+ in ` +
      `${candidate.historicalHits} of those games. ` +
      `Additional research is needed.`,
    risks:
      "Recent historical results are a small sample and do not " +
      "establish a future probability. Player availability, " +
      "opponent context, and contract settlement details " +
      "have not been independently verified.",
  };
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

  const playerGames = new Map<string, NFLPlayerGame[]>();

  for (const game of nfl.players) {
    const key = normalizeName(game.player);
    const existing = playerGames.get(key) ?? [];

    existing.push(game);
    playerGames.set(key, existing);
  }

  const candidates: Candidate[] = kalshi.markets.flatMap(
    (market): Candidate[] => {
      const propType = supportedProp(market.propType ?? "");

      if (
        !propType ||
        market.line == null ||
        !Number.isFinite(market.line)
      ) {
        return [];
      }

      const games = (
        playerGames.get(normalizeName(market.player)) ?? []
      )
        .filter((game) => game.week <= nfl.latestWeek)
        .sort((a, b) => b.week - a.week);

      const recent = games.slice(0, 5);

      if (recent.length < 3) return [];

      const values = recent.map((game) =>
        statForProp(game, propType)
      );

      if (values.some((value) => value === null)) {
        return [];
      }

      const stats = values as number[];

      const average =
        stats.reduce((sum, value) => sum + value, 0) /
        stats.length;

      const hits = stats.filter(
        (value) => value >= market.line!
      ).length;

      return [
        {
          ticker: market.ticker,
          player: market.player,
          propType,
          line: market.line,
          gameTime: market.gameTime,
          recentValues: stats,
          sampleSize: stats.length,
          average: Number(average.toFixed(1)),
          historicalHits: hits,
          historicalHitRate: Number(
            ((100 * hits) / stats.length).toFixed(1)
          ),
          differenceFromLine: Number(
            (average - market.line).toFixed(1)
          ),
          marketVolume: market.volume ?? 0,
        },
      ];
    }
  );

  // Give the AI up to 20 candidates, with category diversity.
  const selected = selectDiverseCandidates(candidates, 20);

  const candidatesByPropType: Record<string, number> = {};

  for (const candidate of selected) {
    candidatesByPropType[candidate.propType] =
      (candidatesByPropType[candidate.propType] ?? 0) + 1;
  }

  if (selected.length === 0) {
    return {
      success: true,
      analysisEnabled: true,
      recommendations: [] as Recommendation[],
      candidatesReviewed: 0,
      candidatesByPropType,
      count: 0,
      updatedAt: new Date().toISOString(),
      message: "No props meet the minimum data requirements.",
    };
  }

  const systemPrompt = `
You are PropEdge AI, an NFL player-prop research assistant.

Analyze ONLY the verified candidate data provided.

Rules:
- Never invent injuries, opponents, weather, matchups,
  statistics, availability, prices, or probabilities.
- Historical hit rates are NOT future win probabilities.
- Never call a prop a guaranteed win or lock.
- Explain supporting evidence and uncertainty.
- Samples of 3-5 games are limited evidence.
- Compare each threshold ONLY to its named statistic.
- Some contracts are Protected or milestone contracts.
  Do not assume standard settlement rules.
- Do not claim positive expected value without
  validated probabilities and market prices.
- Never assume a player will start or play.
- Never treat research priority as betting profitability.
- Label weak evidence as "insufficient_evidence".
- Use "worth_researching" only when additional
  investigation is justified.
- Return valid JSON only.

Evaluate EVERY candidate provided, including
passing, rushing, receiving, receptions, and combined yards.

Return this exact structure:
{
  "evaluations": [
    {
      "ticker": "exact ticker from input",
      "verdict": "worth_researching",
      "reason": "Concise evidence-based explanation",
      "risks": "Concise uncertainty explanation"
    }
  ]
}

Allowed verdicts:
"worth_researching"
"insufficient_evidence"

Do not invent tickers.
Do not omit candidates simply because of their prop category.
Return one evaluation per input candidate.
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
    !("evaluations" in parsed) ||
    !Array.isArray(parsed.evaluations)
  ) {
    throw new Error("Invalid AI analysis format.");
  }

  const allowed = new Map(
    selected.map((candidate) => [
      candidate.ticker,
      candidate,
    ])
  );

  const evaluated = new Map<string, Recommendation>();

  for (const item of parsed.evaluations) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("ticker" in item) ||
      typeof item.ticker !== "string"
    ) {
      continue;
    }

    const verified = allowed.get(item.ticker);

    if (!verified || evaluated.has(item.ticker)) {
      continue;
    }

    const verdict: Verdict =
      "verdict" in item &&
      item.verdict === "worth_researching"
        ? "worth_researching"
        : "insufficient_evidence";

    const reason =
      "reason" in item &&
      typeof item.reason === "string"
        ? item.reason
        : "Review the historical statistics.";

    const risks =
      "risks" in item &&
      typeof item.risks === "string"
        ? item.risks
        : "Player availability and matchup context are unverified.";

    evaluated.set(item.ticker, {
      ...verified,
      verdict,
      reason,
      risks,
    });
  }

  // Preserve all verified candidates, even if the model
  // accidentally omits an evaluation.
  const allEvaluations: Recommendation[] = selected.map(
    (candidate) =>
      evaluated.get(candidate.ticker) ??
      fallbackRecommendation(candidate)
  );

  // Prefer props that the AI considers worth further research,
  // but do not exclude other categories just to favor QBs.
  const ranked = [...allEvaluations].sort((a, b) => {
    const verdictA =
      a.verdict === "worth_researching" ? 1 : 0;
    const verdictB =
      b.verdict === "worth_researching" ? 1 : 0;

    return (
      verdictB - verdictA ||
      candidateScore(b) - candidateScore(a)
    );
  });

  // Enforce diversity in the FINAL recommendations.
  // At most one prop per category initially.
  const recommendations: Recommendation[] = [];
  const seenPlayers = new Set<string>();
  const seenTickers = new Set<string>();

  function addRecommendation(
    recommendation: Recommendation
  ): boolean {
    const playerKey = normalizeName(recommendation.player);

    if (
      seenPlayers.has(playerKey) ||
      seenTickers.has(recommendation.ticker)
    ) {
      return false;
    }

    recommendations.push(recommendation);
    seenPlayers.add(playerKey);
    seenTickers.add(recommendation.ticker);

    return true;
  }

  for (const category of CATEGORIES) {
    if (recommendations.length >= 5) break;

    const best = ranked.find(
      (item) =>
        item.propType === category &&
        !seenPlayers.has(normalizeName(item.player))
    );

    if (best) {
      addRecommendation(best);
    }
  }

  // Fill any remaining positions from the strongest
  // remaining verified evaluations.
  for (const item of ranked) {
    if (recommendations.length >= 5) break;

    addRecommendation(item);
  }

  const recommendationsByPropType: Record<string, number> = {};

  for (const recommendation of recommendations) {
    recommendationsByPropType[recommendation.propType] =
      (recommendationsByPropType[recommendation.propType] ?? 0) +
      1;
  }

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
    candidatesByPropType,
    count: recommendations.length,
    recommendationsByPropType,
    recommendations,
    updatedAt: new Date().toISOString(),
    disclaimer:
      "AI-generated research is not a validated forecast " +
      "or guarantee of betting outcomes.",
  };
}

// New cache key prevents reuse of the previous QB-only report.
const getCachedAnalysis = unstable_cache(
  generateAnalysis,
  ["propedge-ai-analysis-v3-diverse-props"],
  {
    revalidate: CACHE_SECONDS,
    tags: ["propedge-ai-analysis-v3"],
  }
);

// Publish research to GitHub.
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
