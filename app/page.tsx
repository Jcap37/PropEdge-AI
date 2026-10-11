
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

type Market = {
  id: string;
  ticker: string;
  title: string;
  player?: string;
  sport?: string;
  propType?: string;
  line?: number | null;
  yesBid?: string | null;
  yesAsk?: string | null;
  lastPrice?: string | null;
  volume?: number;
  gameTime?: string | null;
};

type ApiResponse = {
  success: boolean;
  markets?: Market[];
  updatedAt?: string;
  error?: string;
};

type Recommendation = {
  ticker: string;
  player: string;
  propType: string;
  line: number;
  gameTime?: string | null;
  recentPassingYards: number[];
  sampleSize: number;
  averagePassingYards: number;
  historicalHits: number;
  historicalHitRate: number;
  differenceFromLine: number;
  verdict: "worth_researching" | "insufficient_evidence";
  reason: string;
  risks: string;
};

type AnalysisResponse = {
  success: boolean;
  recommendations?: Recommendation[];
  updatedAt?: string;
  error?: string;
};

type Position = "All" | "QB" | "RB" | "WR/TE" | "Kicker";

const positions: Position[] = [
  "All",
  "QB",
  "RB",
  "WR/TE",
  "Kicker",
];

function marketPosition(market: Market): Position {
  const type = (market.propType || "").toLowerCase();

  if (
    type.includes("field goal") ||
    type.includes("kicking") ||
    type.includes("extra point")
  ) {
    return "Kicker";
  }

  if (
    type.includes("reception") ||
    type.includes("receiving")
  ) {
    return "WR/TE";
  }

  if (
    type.includes("rushing") ||
    type.includes("touchdown")
  ) {
    // Rushing and TD props can belong to multiple
    // positions. Don't guess from the stat alone.
    return "All";
  }

  if (type.includes("passing")) return "QB";

  return "All";
}

function displayPrice(value?: string | null) {
  if (value == null || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number)
    ? `${Math.round(number * 100)}¢`
    : "—";
}

function displayVolume(value?: number) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function displayDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function playerName(market: Market) {
  return market.player || market.title.split(":")[0] || "Unknown";
}

function propLabel(market: Market) {
  if (market.line != null && market.propType) {
    return `${market.line}+ ${market.propType}`;
  }
  return market.title;
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position>("All");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState("");
  const [analysisAttempted, setAnalysisAttempted] = useState(false);

  const generateResearch = useCallback(async () => {
    if (analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysisAttempted(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      const data = (await response.json()) as AnalysisResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to generate research");
      }
      setRecommendations(data.recommendations || []);
      setAnalysisUpdatedAt(data.updatedAt || "");
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Unable to generate research"
      );
    } finally {
      setAnalysisLoading(false);
    }
  }, [analysisLoading]);

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/kalshi", {
        cache: "no-store",
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load markets");
      }

      setMarkets(data.markets || []);
      setUpdatedAt(data.updatedAt || "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load markets"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();

    return markets.filter((market) => {
      const matchesSearch =
        !query ||
        market.title.toLowerCase().includes(query) ||
        playerName(market).toLowerCase().includes(query);

      const matchesPosition =
        position === "All" ||
        marketPosition(market) === position;

      return matchesSearch && matchesPosition;
    });
  }, [markets, search, position]);

  const visible = showAll ? filtered : filtered.slice(0, 20);

  const playersTracked = new Set(
    markets.map((market) => playerName(market))
  ).size;

  return (
    <main className="min-h-screen bg-[#080808] text-[#f5f5f5]">
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#242424] pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-[#333] bg-[#161616] p-3">
              <BrainCircuit size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                PropEdge AI
              </h1>
              <p className="text-xs text-[#999]">
                Player prop research & intelligence
              </p>
            </div>
          </div>

          <button
            onClick={() => void loadMarkets()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[#333] bg-[#171717] px-4 py-2 text-sm hover:bg-[#242424] disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={loading ? "animate-spin" : ""}
            />
            Refresh Markets
          </button>
        </header>

        <section className="mb-10">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-2 text-2xl font-bold">
                <Sparkles size={22} />
                Top AI Player Props
              </h2>
              <span className="rounded-full bg-[#222] px-3 py-1 text-xs text-[#aaa]">
                Research preview
              </span>
            </div>
            <button
              onClick={() => void generateResearch()}
              disabled={analysisLoading}
              className="flex items-center gap-2 rounded-lg border border-[#444] bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-[#ddd] disabled:opacity-50"
            >
              <BrainCircuit size={16} />
              {analysisLoading ? "Analyzing..." : "Generate AI Research"}
            </button>
          </div>

          <p className="mb-4 text-sm leading-6 text-[#999]">
            Experimental analysis of historical NFL passing-yard results and
            Kalshi thresholds. Historical hit rates are not predicted win
            probabilities. Matchups, injuries, and expected value are not verified.
          </p>

          {analysisError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-900 bg-[#1b1010] p-4 text-sm text-red-300">
              <ShieldAlert size={18} />
              {analysisError}
            </div>
          )}

          {analysisLoading && (
            <div className="rounded-2xl border border-[#303030] bg-[#111] p-8 text-center text-sm text-[#aaa]">
              <RefreshCw size={22} className="mx-auto mb-3 animate-spin" />
              Reviewing verified research and generating explanations...
            </div>
          )}

          {!analysisLoading && recommendations.length === 0 && (
            <div className="rounded-2xl border border-[#303030] bg-[#111] p-6 md:p-8">
              <div className="mb-3 flex items-center gap-2 text-sm text-[#aaa]">
                <BrainCircuit size={18} />
                AI Recommendations
              </div>
              <h3 className="mb-3 text-xl font-semibold">
                Evidence-backed player prop research
              </h3>
              <p className="text-sm leading-7 text-[#aaa]">
                {analysisAttempted && !analysisError
                  ? "No research candidates were returned. Try again when more data is available."
                  : "Generate an analysis to see up to five NFL passing-yard research candidates, with recent performance, AI explanations, and risks."}
              </p>
              <p className="mt-5 border-t border-[#292929] pt-4 text-xs text-[#888]">
                Each click requests a paid AI analysis. This preview is intended for development testing only.
              </p>
            </div>
          )}

          {!analysisLoading && recommendations.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {recommendations.map((item) => (
                <article
                  key={item.ticker}
                  className="rounded-2xl border border-[#303030] bg-[#111] p-6"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#888]">NFL · Passing Yards</p>
                      <h3 className="mt-1 text-xl font-bold">{item.player}</h3>
                      <p className="mt-1 text-sm text-[#bbb]">
                        {item.line}+ passing yards
                      </p>
                    </div>
                    <span className="rounded-full border border-[#3a3a3a] bg-[#242424] px-3 py-1 text-xs text-[#ddd]">
                      {item.verdict === "worth_researching"
                        ? "Worth researching"
                        : "Limited evidence"}
                    </span>
                  </div>

                  <div className="mb-4 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-[#1e1e1e] p-3">
                      <p className="text-[11px] text-[#999]">Recent avg.</p>
                      <p className="mt-1 text-lg font-semibold">{item.averagePassingYards}</p>
                    </div>
                    <div className="rounded-lg bg-[#1e1e1e] p-3">
                      <p className="text-[11px] text-[#999]">Past hits</p>
                      <p className="mt-1 text-lg font-semibold">
                        {item.historicalHits}/{item.sampleSize}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#1e1e1e] p-3">
                      <p className="text-[11px] text-[#999]">Avg. vs line</p>
                      <p className="mt-1 text-lg font-semibold">
                        {item.differenceFromLine > 0 ? "+" : ""}
                        {item.differenceFromLine}
                      </p>
                    </div>
                  </div>

                  <p className="mb-2 text-xs text-[#888]">
                    Recent game yards: {item.recentPassingYards.join(" · ")}
                  </p>
                  <div className="border-t border-[#292929] pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#aaa]">
                      AI analysis
                    </p>
                    <p className="text-sm leading-6 text-[#ddd]">{item.reason}</p>
                    <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[#aaa]">
                      Risks and uncertainty
                    </p>
                    <p className="text-sm leading-6 text-[#aaa]">{item.risks}</p>
                    <p className="mt-4 text-xs text-[#777]">
                      Game: {displayDate(item.gameTime)} · Historical sample: {item.sampleSize} games
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}

          {analysisUpdatedAt && recommendations.length > 0 && (
            <p className="mt-3 text-xs text-[#888]">
              Generated {displayDate(analysisUpdatedAt)} · Research only, not a validated betting forecast.
            </p>
          )}
        </section>

        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#292929] bg-[#121212] p-5">
            <p className="mb-2 text-xs text-[#999]">
              Available Markets
            </p>
            <p className="text-3xl font-bold">
              {loading ? "..." : markets.length}
            </p>
          </div>

          <div className="rounded-xl border border-[#292929] bg-[#121212] p-5">
            <p className="mb-2 text-xs text-[#999]">
              Players Tracked
            </p>
            <p className="text-3xl font-bold">
              {loading ? "..." : playersTracked}
            </p>
          </div>

          <div className="rounded-xl border border-[#292929] bg-[#121212] p-5">
            <p className="mb-2 text-xs text-[#999]">
              Connected Source
            </p>
            <p className="flex items-center gap-2 text-xl font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Kalshi
            </p>
            <p className="mt-1 text-xs text-[#777]">
              PrizePicks & Polymarket planned
            </p>
          </div>
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                Market Explorer
              </h2>
              <p className="mt-2 text-sm text-[#999]">
                Browse verified player prop markets.
                These are not AI-ranked picks.
              </p>
            </div>

            <span className="flex items-center gap-2 text-xs text-[#888]">
              <Clock3 size={14} />
              {updatedAt
                ? `Updated ${displayDate(updatedAt)}`
                : "Awaiting update"}
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#303030] bg-[#111]">
            <div className="border-b border-[#292929] p-4">
              <div className="mb-4 flex flex-wrap gap-2">
                {positions.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setPosition(item);
                      setShowAll(false);
                    }}
                    className={`rounded-lg px-4 py-2 text-sm transition ${
                      position === item
                        ? "bg-white font-semibold text-black"
                        : "bg-[#222] text-[#bbb] hover:bg-[#333]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-[#303030] bg-[#191919] px-4 py-3">
                <Search size={17} className="text-[#888]" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setShowAll(false);
                  }}
                  placeholder="Search player or prop..."
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#777]"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 border-b border-red-900 p-4 text-sm text-red-400">
                <ShieldAlert size={18} />
                {error}
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center text-sm text-[#999]">
                <RefreshCw
                  size={22}
                  className="mx-auto mb-3 animate-spin"
                />
                Loading markets...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Activity
                  size={26}
                  className="mx-auto mb-3 text-[#777]"
                />
                <p className="font-semibold">
                  No matching markets
                </p>
                <p className="mt-2 text-sm text-[#888]">
                  {position !== "All" && position !== "QB"
                    ? "We haven't connected this position's prop markets yet."
                    : "Try another search or refresh."}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[750px] text-left">
                    <thead className="bg-[#191919] text-xs uppercase tracking-wide text-[#888]">
                      <tr>
                        <th className="px-5 py-4 font-medium">
                          Player
                        </th>
                        <th className="px-5 py-4 font-medium">
                          Prop
                        </th>
                        <th className="px-5 py-4 font-medium">
                          Platform
                        </th>
                        <th className="px-5 py-4 font-medium">
                          Yes Price
                        </th>
                        <th className="px-5 py-4 font-medium">
                          Volume
                        </th>
                        <th className="px-5 py-4 font-medium">
                          Game
                        </th>
                        <th className="px-5 py-4 font-medium">
                          Details
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {visible.map((market) => (
                        <tr
                          key={market.id}
                          className="border-t border-[#272727] text-sm hover:bg-[#191919]"
                        >
                          <td className="px-5 py-4 font-semibold">
                            {playerName(market)}
                          </td>
                          <td className="px-5 py-4 text-[#ddd]">
                            {propLabel(market)}
                          </td>
                          <td className="px-5 py-4 text-[#bbb]">
                            Kalshi
                          </td>
                          <td className="px-5 py-4">
                            {displayPrice(market.yesAsk)}
                          </td>
                          <td className="px-5 py-4 text-[#bbb]">
                            {displayVolume(market.volume)}
                          </td>
                          <td className="px-5 py-4 text-[#999]">
                            {displayDate(market.gameTime)}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              onClick={() =>
                                setExpanded(
                                  expanded === market.id
                                    ? null
                                    : market.id
                                )
                              }
                              className="flex items-center gap-1 text-[#ddd] hover:text-white"
                            >
                              {expanded === market.id ? (
                                <ChevronUp size={15} />
                              ) : (
                                <ChevronDown size={15} />
                              )}
                              View
                            </button>

                            {expanded === market.id && (
                              <div className="mt-3 w-64 rounded-lg border border-[#333] bg-[#202020] p-3 text-xs leading-6 text-[#bbb]">
                                <p className="font-semibold text-white">
                                  Market information
                                </p>
                                <p>
                                  Yes Bid:{" "}
                                  {displayPrice(market.yesBid)}
                                </p>
                                <p>
                                  Yes Ask:{" "}
                                  {displayPrice(market.yesAsk)}
                                </p>
                                <p>
                                  AI analysis: Not available yet
                                </p>
                                <a
                                  href="https://kalshi.com/markets"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 flex items-center gap-1 text-blue-400"
                                >
                                  Open Kalshi
                                  <ArrowUpRight size={13} />
                                </a>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filtered.length > 20 && (
                  <div className="border-t border-[#292929] p-5 text-center">
                    <button
                      onClick={() => setShowAll(!showAll)}
                      className="rounded-lg border border-[#333] bg-[#222] px-5 py-2 text-sm hover:bg-[#303030]"
                    >
                      {showAll
                        ? "Show Less"
                        : `Show All ${filtered.length} Markets`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <footer className="mt-12 border-t border-[#242424] py-6 text-center text-xs text-[#777]">
          PropEdge AI · Research and analytics only.
          Market prices do not guarantee outcomes.
        </footer>
      </div>
    </main>
  );
}
