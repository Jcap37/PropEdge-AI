
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Zap,
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
  eventTicker?: string | null;
};

type ApiResponse = {
  success: boolean;
  markets?: Market[];
  count?: number;
  updatedAt?: string;
  error?: string;
};

function formatPrice(price?: string | null) {
  if (price == null) return "—";

  const value = Number(price);

  return Number.isFinite(value)
    ? `${(value * 100).toFixed(0)}¢`
    : "—";
}

function formatVolume(volume?: number) {
  if (volume == null) return "—";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(volume);
}

function formatDate(value?: string | null) {
  if (!value) return "Time unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPlayer(market: Market) {
  return (
    market.player ||
    market.title.split(":")[0]?.trim() ||
    "Unknown player"
  );
}

function getLine(market: Market) {
  if (market.line != null) {
    return market.line;
  }

  const match = market.title.match(/(\d+)\+/);

  return match ? Number(match[1]) : null;
}

function getProbabilityRange(market: Market) {
  const bid = Number(market.yesBid);
  const ask = Number(market.yesAsk);

  if (
    market.yesBid == null ||
    market.yesAsk == null ||
    !Number.isFinite(bid) ||
    !Number.isFinite(ask)
  ) {
    return "Unavailable";
  }

  return `${(bid * 100).toFixed(0)}–${(
    ask * 100
  ).toFixed(0)}%`;
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("All");
  const [showAll, setShowAll] = useState(false);

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/kalshi", {
        cache: "no-store",
      });

      const data =
        (await response.json()) as ApiResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Unable to load markets"
        );
      }

      setMarkets(data.markets || []);
      setUpdatedAt(data.updatedAt || "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  const filteredMarkets = useMemo(() => {
    if (platform !== "All" && platform !== "Kalshi") {
      return [];
    }

    const query = search.trim().toLowerCase();

    return markets.filter((market) => {
      const title = market.title.toLowerCase();
      const player = getPlayer(market).toLowerCase();

      return (
        !query ||
        title.includes(query) ||
        player.includes(query)
      );
    });
  }, [markets, platform, search]);

  const visibleMarkets = showAll
    ? filteredMarkets
    : filteredMarkets.slice(0, 10);

  const uniquePlayers = new Set(
    markets.map((market) => getPlayer(market))
  ).size;

  const platformOptions = [
    "All",
    "Kalshi",
    "PrizePicks",
    "Polymarket",
  ];

  return (
    <main className="min-h-screen bg-[#080d18] text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-600 p-3">
              <BrainCircuit size={27} />
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight">
                PropEdge{" "}
                <span className="text-blue-400">
                  AI
                </span>
              </h1>

              <p className="text-xs text-slate-400">
                Intelligent player prop research
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-emerald-900 bg-emerald-950/40 px-4 py-2 text-xs text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Kalshi connected
            </span>

            <button
              onClick={() => void loadMarkets()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </header>

        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-400">
            <Sparkles size={16} />
            THE NEXT GENERATION OF PROP RESEARCH
          </div>

          <h2 className="max-w-4xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
            Smarter research.
            <br />
            <span className="text-blue-400">
              Better-informed picks.
            </span>
          </h2>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
            Explore real player prop markets from Kalshi.
            PropEdge AI is being built to combine market
            data with player statistics, matchup analysis,
            injuries, and model-driven recommendations.
          </p>
        </section>

        <section className="mb-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-[#101827] p-6">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
              <Activity size={17} className="text-blue-400" />
              Available Markets
            </div>

            <div className="text-4xl font-black">
              {loading ? "..." : markets.length}
            </div>

            <p className="mt-2 text-xs text-slate-500">
              NFL passing-yard contracts retrieved
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#101827] p-6">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
              <BarChart3 size={17} className="text-blue-400" />
              Players Tracked
            </div>

            <div className="text-4xl font-black">
              {loading ? "..." : uniquePlayers}
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Unique players in retrieved markets
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#101827] p-6">
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
              <Zap size={17} className="text-blue-400" />
              Research Engine
            </div>

            <div className="text-2xl font-black text-amber-400">
              In Development
            </div>

            <p className="mt-2 text-xs text-slate-500">
              AI rankings and statistical projections coming next
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-blue-900/60 bg-gradient-to-r from-blue-950/60 to-[#101827] p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-600/20 p-3 text-blue-400">
              <BrainCircuit size={25} />
            </div>

            <div>
              <h3 className="text-lg font-bold">
                AI Research Agent
              </h3>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Coming next: an agent that researches
                recent performance, expected workload,
                defensive matchups, injuries, and market
                prices before publishing detailed player
                prop recommendations.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "Recent Form",
                  "Matchup Analysis",
                  "Injury Reports",
                  "Probability Models",
                  "Expected Value",
                ].map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-blue-900 bg-blue-950/50 px-3 py-1 text-xs text-blue-300"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-400">
                <TrendingUp size={15} />
                Market Explorer
              </div>

              <h3 className="text-2xl font-black">
                NFL Player Props
              </h3>

              <p className="mt-2 text-sm text-slate-400">
                Real Kalshi markets, organized for research.
                Not yet AI-ranked recommendations.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock3 size={14} />
              {updatedAt
                ? `Updated ${formatDate(updatedAt)}`
                : "Waiting for market data"}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {platformOptions.map((option) => (
              <button
                key={option}
                onClick={() => {
                  setPlatform(option);
                  setShowAll(false);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  platform === option
                    ? "bg-blue-600 text-white"
                    : "border border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                }`}
              >
                {option}
                {(option === "PrizePicks" ||
                  option === "Polymarket") && (
                  <span className="ml-2 text-[10px] opacity-60">
                    SOON
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-800 bg-[#101827] px-4 py-3">
            <Search size={18} className="text-slate-500" />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search players or props..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </div>

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-900 bg-red-950/30 p-5 text-sm text-red-300">
              <ShieldAlert size={20} />
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-[#101827] p-12 text-center text-slate-400">
              <RefreshCw
                className="mx-auto mb-4 animate-spin"
                size={26}
              />
              Loading NFL player props...
            </div>
          ) : visibleMarkets.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-[#101827] p-12 text-center">
              <Search
                size={28}
                className="mx-auto mb-4 text-slate-500"
              />

              <h4 className="font-bold">
                No markets available
              </h4>

              <p className="mt-2 text-sm text-slate-400">
                {platform === "PrizePicks" ||
                platform === "Polymarket"
                  ? "This platform is not connected yet."
                  : "Try another search or refresh the data."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleMarkets.map((market) => (
                <article
                  key={market.id}
                  className="rounded-2xl border border-slate-800 bg-[#101827] p-6 transition hover:border-blue-800"
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-lg bg-blue-950 px-3 py-1 text-xs font-bold text-blue-300">
                      NFL · Passing Yards
                    </span>

                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 size={13} />
                      Kalshi Market
                    </span>
                  </div>

                  <h4 className="text-xl font-black">
                    {getPlayer(market)}
                  </h4>

                  <p className="mt-1 text-sm font-semibold text-blue-400">
                    {getLine(market) != null
                      ? `${getLine(market)}+ Passing Yards`
                      : market.title}
                  </p>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-[#192437] p-3">
                      <div className="text-xs text-slate-400">
                        Yes Bid
                      </div>

                      <div className="mt-1 text-lg font-bold">
                        {formatPrice(market.yesBid)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#192437] p-3">
                      <div className="text-xs text-slate-400">
                        Yes Ask
                      </div>

                      <div className="mt-1 text-lg font-bold">
                        {formatPrice(market.yesAsk)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#192437] p-3">
                      <div className="text-xs text-slate-400">
                        Volume
                      </div>

                      <div className="mt-1 text-lg font-bold">
                        {formatVolume(market.volume)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-800 bg-[#0c1422] p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <BrainCircuit
                        size={16}
                        className="text-blue-400"
                      />
                      Research Snapshot
                    </div>

                    <p className="text-sm leading-6 text-slate-400">
                      This contract asks whether{" "}
                      {getPlayer(market)} will reach{" "}
                      {getLine(market) != null
                        ? `${getLine(market)} passing yards`
                        : "the listed passing-yard threshold"}
                      . The current bid-ask range is{" "}
                      {getProbabilityRange(market)}.
                      This is a market-implied price
                      range, not an independent AI
                      probability estimate.
                    </p>

                    <p className="mt-3 text-xs text-amber-400">
                      Player stats and matchup analysis
                      pending integration.
                    </p>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      {formatDate(market.gameTime)}
                    </span>

                    <a
                      href={`https://kalshi.com/markets/${encodeURIComponent(
                        "kxnflpassyds"
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
                    >
                      Explore on Kalshi
                      <ArrowUpRight size={15} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading &&
            filteredMarkets.length > 10 && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold hover:bg-slate-800"
                >
                  {showAll
                    ? "Show Fewer"
                    : `View All ${filteredMarkets.length} Markets`}
                </button>
              </div>
            )}
        </section>

        <footer className="mt-16 border-t border-slate-800 py-8 text-center text-xs leading-6 text-slate-500">
          PropEdge AI · Sports research and market analysis
          <br />
          Market prices are not guaranteed probabilities.
          Research tools are informational and do not
          guarantee profitable outcomes.
        </footer>
      </div>
    </main>
  );
}
