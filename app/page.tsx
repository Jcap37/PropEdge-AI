
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type MarketResponse = {
  success: boolean;
  markets?: Market[];
  updatedAt?: string;
  error?: string;
  warnings?: string[];
};

type SportsbookLine = {
  bookmaker: string;
  line: number;
  overOdds: number | null;
  underOdds: number | null;
};

type Recommendation = {
  ticker: string;
  player: string;
  propType: string;
  line: number;
  side?: "Over" | "Under";
  odds?: number | null;
  bookmaker?: string;
  bookmakerKey?: string;
  source?: string;
  homeTeam?: string;
  awayTeam?: string;
  gameTime?: string | null;
  lastOddsUpdate?: string | null;
  sportsbookLines?: SportsbookLine[];
  alternateLines?: SportsbookLine[];
  recentValues?: number[];
  recentPassingYards?: number[];
  sampleSize: number;
  average?: number;
  averagePassingYards?: number;
  historicalHits: number;
  historicalHitRate: number;
  differenceFromLine: number;
  verdict: "worth_researching" | "insufficient_evidence";
  reason: string;
  risks: string;
};

type AnalysisResponse = {
  success: boolean;
  source?: {
    markets?: string;
    statistics?: string;
    analysis?: string;
  };
  recommendations?: Recommendation[];
  updatedAt?: string;
  error?: string;
  published?: boolean;
  publishError?: string;
};

type GitHubFileResponse = {
  content?: string;
  encoding?: string;
  message?: string;
};

type Position = "All" | "QB" | "RB" | "WR/TE" | "Kicker";

const POSITIONS: Position[] = [
  "All",
  "QB",
  "RB",
  "WR/TE",
  "Kicker",
];

const GITHUB_FILE_API =
  "https://api.github.com/repos/Jcap37/PropEdge-AI/contents/data/published-research.json?ref=main";

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

function displayOdds(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : `${value}`;
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

function playerName(market: Market) {
  return market.player || market.title.split(":")[0] || "Unknown";
}

function propLabel(market: Market) {
  if (market.line != null && market.propType) {
    return `${market.line}+ ${market.propType}`;
  }
  return market.title;
}

function marketPosition(market: Market): Position {
  const type = (market.propType || "").toLowerCase();

  if (
    type.includes("field goal") ||
    type.includes("kicking") ||
    type.includes("extra point")
  ) {
    return "Kicker";
  }

  if (type.includes("passing")) return "QB";
  if (type.includes("rushing + receiving")) return "RB";

  if (type.includes("reception") || type.includes("receiving")) {
    return "WR/TE";
  }

  if (type.includes("rushing") || type.includes("touchdown")) {
    return "RB";
  }

  return "All";
}

function statUnit(propType: string) {
  return propType.toLowerCase().includes("reception") &&
    !propType.toLowerCase().includes("yards")
    ? "receptions"
    : "yards";
}

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSportsbookReport(data: AnalysisResponse) {
  return (
    data.source?.markets?.includes("DraftKings") === true ||
    data.recommendations?.some(
      (item) =>
        item.source === "Sportsbook" ||
        Boolean(item.bookmaker)
    ) === true
  );
}

function decodeGitHubContent(encoded: string) {
  const binary = atob(encoded.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function fetchPublishedReport(): Promise<AnalysisResponse> {
  const url = `${GITHUB_FILE_API}&t=${Date.now()}`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub returned HTTP ${response.status}. The published report could not be refreshed.`
    );
  }

  const file = (await response.json()) as GitHubFileResponse;

  if (!file.content || file.encoding !== "base64") {
    throw new Error(
      "GitHub did not return the expected published JSON file."
    );
  }

  const report = JSON.parse(
    decodeGitHubContent(file.content)
  ) as AnalysisResponse;

  if (
    !report.success ||
    !Array.isArray(report.recommendations)
  ) {
    throw new Error("The published report has an invalid format.");
  }

  return report;
}

function SportsbookComparison({
  item,
}: {
  item: Recommendation;
}) {
  const lines = item.sportsbookLines ?? [];

  if (lines.length === 0) return null;

  return (
    <div className="mt-5 border-t border-[#292929] pt-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#aaa]">
        DraftKings vs FanDuel
      </h4>

      <div className="overflow-x-auto rounded-lg border border-[#303030]">
        <table className="w-full min-w-[350px] text-left text-xs">
          <thead className="bg-[#202020] text-[#aaa]">
            <tr>
              <th className="px-3 py-3">Sportsbook</th>
              <th className="px-3 py-3">Line</th>
              <th className="px-3 py-3">Over</th>
              <th className="px-3 py-3">Under</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const selected =
                line.bookmaker === item.bookmaker &&
                line.line === item.line;

              return (
                <tr
                  key={`${line.bookmaker}-${line.line}-${index}`}
                  className={`border-t border-[#303030] ${
                    selected ? "bg-[#1b2922]" : "bg-[#151515]"
                  }`}
                >
                  <td className="px-3 py-3 font-medium">
                    {line.bookmaker}
                    {selected && (
                      <span className="ml-2 text-emerald-400">
                        Selected
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{line.line}</td>
                  <td className="px-3 py-3">
                    {displayOdds(line.overOdds)}
                  </td>
                  <td className="px-3 py-3">
                    {displayOdds(line.underOdds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlternateLines({
  item,
}: {
  item: Recommendation;
}) {
  const [showAll, setShowAll] = useState(false);

  const lines = useMemo(() => {
    const available = item.alternateLines ?? [];

    return [...available].sort((a, b) => {
      const distanceA = Math.abs(a.line - item.line);
      const distanceB = Math.abs(b.line - item.line);

      return distanceA - distanceB;
    });
  }, [item.alternateLines, item.line]);

  if (lines.length === 0) return null;

  const displayed = showAll ? lines : lines.slice(0, 6);

  return (
    <div className="mt-5 border-t border-[#292929] pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#aaa]">
          Available alternate lines
        </h4>

        <span className="text-xs text-[#777]">
          {lines.length} quotes
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#303030]">
        <table className="w-full min-w-[350px] text-left text-xs">
          <thead className="bg-[#202020] text-[#aaa]">
            <tr>
              <th className="px-3 py-3">Sportsbook</th>
              <th className="px-3 py-3">Line</th>
              <th className="px-3 py-3">Over</th>
              <th className="px-3 py-3">Under</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((line, index) => (
              <tr
                key={`${line.bookmaker}-${line.line}-${index}`}
                className="border-t border-[#303030] bg-[#151515]"
              >
                <td className="px-3 py-3">{line.bookmaker}</td>
                <td className="px-3 py-3">{line.line}</td>
                <td className="px-3 py-3">
                  {displayOdds(line.overOdds)}
                </td>
                <td className="px-3 py-3">
                  {displayOdds(line.underOdds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lines.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mt-3 flex items-center gap-1 text-xs text-[#ccc] hover:text-white"
        >
          {showAll ? (
            <>
              <ChevronUp size={14} />
              Show fewer alternate lines
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Show all {lines.length} alternate quotes
            </>
          )}
        </button>
      )}

      <p className="mt-3 text-xs leading-5 text-[#777]">
        Only prices returned by the sportsbook data provider are
        shown. A dash means that side was not quoted. Prices may
        change or become unavailable.
      </p>
    </div>
  );
}

function RecommendationCard({
  item,
}: {
  item: Recommendation;
}) {
  const sportsbook = Boolean(item.bookmaker);
  const side = item.side;
  const values =
    item.recentValues ?? item.recentPassingYards ?? [];

  return (
    <article className="rounded-2xl border border-[#303030] bg-[#111] p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#888]">
            NFL · {item.propType}
          </p>

          <h3 className="mt-1 text-xl font-bold">
            {item.player}
          </h3>

          <p className="mt-2 text-base font-semibold text-white">
            {side ? `${side} ` : ""}
            {item.line} {item.propType.toLowerCase()}
          </p>

          {sportsbook && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-[#365244] bg-[#19271e] px-3 py-1.5 text-sm font-semibold text-emerald-300">
                {item.bookmaker}
              </span>

              <span className="rounded-lg border border-[#444] bg-[#222] px-3 py-1.5 text-sm font-semibold">
                {displayOdds(item.odds)}
              </span>
            </div>
          )}
        </div>

        <span className="rounded-full border border-[#3a3a3a] bg-[#242424] px-3 py-1 text-xs text-[#ddd]">
          {item.verdict === "worth_researching"
            ? "Worth researching"
            : "Limited evidence"}
        </span>
      </div>

      {(item.homeTeam || item.awayTeam) && (
        <p className="mb-4 text-xs text-[#aaa]">
          {item.awayTeam} at {item.homeTeam}
        </p>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#1e1e1e] p-3">
          <p className="text-[11px] text-[#999]">
            Recent avg.
          </p>
          <p className="mt-1 text-lg font-semibold">
            {item.average ?? item.averagePassingYards ?? "—"}
          </p>
        </div>

        <div className="rounded-lg bg-[#1e1e1e] p-3">
          <p className="text-[11px] text-[#999]">
            Past hits
          </p>
          <p className="mt-1 text-lg font-semibold">
            {item.historicalHits}/{item.sampleSize}
          </p>
        </div>

        <div className="rounded-lg bg-[#1e1e1e] p-3">
          <p className="text-[11px] text-[#999]">
            Avg. vs line
          </p>
          <p className="mt-1 text-lg font-semibold">
            {item.differenceFromLine > 0 ? "+" : ""}
            {item.differenceFromLine}
          </p>
        </div>
      </div>

      <p className="mb-3 text-xs leading-5 text-[#888]">
        Recent game {statUnit(item.propType)}:{" "}
        {values.length > 0 ? values.join(" · ") : "Unavailable"}
      </p>

      {values.length > 0 &&
        values.every((value) => value === 0) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-900 bg-[#251d10] p-3 text-xs leading-5 text-amber-200">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            All recorded recent values are zero. Playing time
            and opportunities have not been verified.
          </div>
        )}

      <div className="border-t border-[#292929] pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#aaa]">
          AI analysis
        </p>

        <p className="text-sm leading-6 text-[#ddd]">
          {item.reason}
        </p>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[#aaa]">
          Risks and uncertainty
        </p>

        <p className="text-sm leading-6 text-[#aaa]">
          {item.risks}
        </p>
      </div>

      <SportsbookComparison item={item} />
      <AlternateLines item={item} />

      <div className="mt-5 border-t border-[#292929] pt-4 text-xs leading-5 text-[#777]">
        <p>
          Game: {displayDate(item.gameTime)} · Historical
          sample: {item.sampleSize} games
        </p>

        {item.lastOddsUpdate && (
          <p className="mt-1">
            Odds last quoted: {displayDate(item.lastOddsUpdate)}
          </p>
        )}
      </div>
    </article>
  );
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [marketWarnings, setMarketWarnings] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position>("All");
  const [propType, setPropType] = useState("All props");
  const [visibleCount, setVisibleCount] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<
    Recommendation[]
  >([]);

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState("");
  const [analysisAttempted, setAnalysisAttempted] = useState(false);

  const [showAdminInput, setShowAdminInput] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  const [publishedLoading, setPublishedLoading] = useState(true);
  const [publishedError, setPublishedError] = useState("");
  const [publicationWarning, setPublicationWarning] = useState("");
  const [reportSource, setReportSource] = useState("");

  const latestReportRef = useRef<AnalysisResponse | null>(null);

  const applyReport = useCallback(
    (data: AnalysisResponse) => {
      const previous = latestReportRef.current;

      if (previous) {
        const previousTime = timestamp(previous.updatedAt);
        const incomingTime = timestamp(data.updatedAt);

        if (previousTime > incomingTime) {
          return false;
        }

        if (
          previousTime === incomingTime &&
          isSportsbookReport(previous) &&
          !isSportsbookReport(data)
        ) {
          return false;
        }
      }

      latestReportRef.current = data;
      setRecommendations(data.recommendations ?? []);
      setAnalysisUpdatedAt(data.updatedAt ?? "");
      setAnalysisAttempted(true);
      setReportSource(
        isSportsbookReport(data) ? "Sportsbook" : "Kalshi"
      );

      return true;
    },
    []
  );

  const loadPublishedResearch = useCallback(async () => {
    setPublishedLoading(true);
    setPublishedError("");

    try {
      const data = await fetchPublishedReport();
      const applied = applyReport(data);

      if (!applied) {
        setPublishedError(
          "GitHub returned an older report. Your newer research has been kept on screen."
        );
      }
    } catch (err) {
      setPublishedError(
        err instanceof Error
          ? err.message
          : "Unable to load published research."
      );
    } finally {
      setPublishedLoading(false);
    }
  }, [applyReport]);

  const generateResearch = useCallback(async () => {
    if (analysisLoading || !adminPassword.trim()) return;

    setAnalysisLoading(true);
    setAnalysisError("");
    setPublicationWarning("");
    setAnalysisAttempted(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminPassword,
        },
        cache: "no-store",
        body: JSON.stringify({
          action: "analyze",
        }),
      });

      const data = (await response.json()) as AnalysisResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Unable to generate research."
        );
      }

      applyReport(data);
      setShowAdminInput(false);

      if (data.published === false) {
        setPublicationWarning(
          "AI research was generated, but publishing failed. " +
            (data.publishError || "Check the GitHub connection.")
        );
      } else if (data.published !== true) {
        setPublicationWarning(
          "AI research was generated, but GitHub publishing was not confirmed."
        );
      }
    } catch (err) {
      setAnalysisError(
        err instanceof Error
          ? err.message
          : "Unable to generate research."
      );
    } finally {
      setAdminPassword("");
      setAnalysisLoading(false);
    }
  }, [analysisLoading, adminPassword, applyReport]);

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/kalshi", {
        cache: "no-store",
      });

      const data = (await response.json()) as MarketResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load markets.");
      }

      setMarkets(data.markets ?? []);
      setMarketWarnings(data.warnings ?? []);
      setUpdatedAt(data.updatedAt ?? "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load markets."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
    void loadPublishedResearch();
  }, [loadMarkets, loadPublishedResearch]);

  const propTypes = useMemo(
    () => [
      "All props",
      ...Array.from(
        new Set(
          markets
            .map((market) => market.propType)
            .filter((value): value is string => Boolean(value))
        )
      ).sort(),
    ],
    [markets]
  );

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

      const matchesProp =
        propType === "All props" ||
        market.propType === propType;

      return matchesSearch && matchesPosition && matchesProp;
    });
  }, [markets, search, position, propType]);

  const visible = filtered.slice(0, visibleCount);

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
            type="button"
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
                {reportSource === "Sportsbook"
                  ? "DraftKings + FanDuel research"
                  : "Published research"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadPublishedResearch()}
                disabled={publishedLoading || analysisLoading}
                className="flex items-center gap-2 rounded-lg border border-[#444] bg-[#171717] px-4 py-2 text-sm text-white hover:bg-[#252525] disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={
                    publishedLoading ? "animate-spin" : ""
                  }
                />
                Refresh Research
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAdminInput((current) => !current);
                  setAnalysisError("");
                  setAdminPassword("");
                }}
                disabled={analysisLoading}
                className="flex items-center gap-2 rounded-lg border border-[#444] bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-[#ddd] disabled:opacity-50"
              >
                <BrainCircuit size={16} />
                {analysisLoading
                  ? "Analyzing..."
                  : showAdminInput
                    ? "Cancel"
                    : "Generate AI Research"}
              </button>
            </div>
          </div>

          {showAdminInput && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void generateResearch();
              }}
              className="mb-5 rounded-2xl border border-[#353535] bg-[#151515] p-5"
            >
              <label
                htmlFor="admin-password"
                className="mb-2 block text-sm font-semibold"
              >
                Admin password
              </label>

              <p className="mb-3 text-xs leading-5 text-[#aaa]">
                Only the administrator can generate and publish
                new AI research. Your password is not saved in
                browser storage.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="off"
                  value={adminPassword}
                  onChange={(event) =>
                    setAdminPassword(event.target.value)
                  }
                  placeholder="Enter admin password"
                  disabled={analysisLoading}
                  required
                  className="min-w-0 flex-1 rounded-lg border border-[#444] bg-[#0c0c0c] px-4 py-3 text-sm text-white outline-none focus:border-[#aaa]"
                />

                <button
                  type="submit"
                  disabled={
                    analysisLoading || !adminPassword.trim()
                  }
                  className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-[#ddd] disabled:opacity-50"
                >
                  {analysisLoading
                    ? "Generating..."
                    : "Run AI Analysis"}
                </button>
              </div>
            </form>
          )}

          <p className="mb-4 text-sm leading-6 text-[#999]">
            AI-assisted research using historical NFL player
            statistics and published sportsbook lines from
            DraftKings and FanDuel. Historical hit rates are not
            predicted probabilities. Player roles, injuries,
            matchups, and expected value have not been
            independently verified.
          </p>

          {analysisError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-900 bg-[#1b1010] p-4 text-sm text-red-300">
              <ShieldAlert size={18} />
              {analysisError}
            </div>
          )}

          {publicationWarning && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-yellow-900 bg-[#211b10] p-4 text-sm text-yellow-200">
              <ShieldAlert size={18} />
              {publicationWarning}
            </div>
          )}

          {publishedError && (
            <div className="mb-4 rounded-xl border border-[#403323] bg-[#1a1610] p-4 text-sm text-[#e6c69c]">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} />
                <span>Research refresh notice</span>
              </div>
              <p className="mt-2 text-xs leading-5">
                {publishedError}
              </p>
            </div>
          )}

          {(analysisLoading ||
            (publishedLoading &&
              recommendations.length === 0)) && (
            <div className="rounded-2xl border border-[#303030] bg-[#111] p-8 text-center text-sm text-[#aaa]">
              <RefreshCw
                size={22}
                className="mx-auto mb-3 animate-spin"
              />
              {analysisLoading
                ? "Generating AI research..."
                : "Loading published AI research..."}
            </div>
          )}

          {!analysisLoading &&
            !publishedLoading &&
            recommendations.length === 0 && (
              <div className="rounded-2xl border border-[#303030] bg-[#111] p-8">
                <h3 className="text-xl font-semibold">
                  AI Recommendations
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#aaa]">
                  {analysisAttempted
                    ? "No research recommendations are currently available."
                    : "Published NFL player-prop research will appear here automatically."}
                </p>
              </div>
            )}

          {!analysisLoading &&
            recommendations.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                {recommendations.map((item) => (
                  <RecommendationCard
                    key={item.ticker}
                    item={item}
                  />
                ))}
              </div>
            )}

          {analysisUpdatedAt &&
            recommendations.length > 0 && (
              <p className="mt-4 text-xs leading-5 text-[#888]">
                Report generated {displayDate(analysisUpdatedAt)}.
                Displayed sportsbook prices are historical quotes
                from that report, not live odds. Research only,
                not a validated betting forecast.
              </p>
            )}
        </section>

        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#292929] bg-[#121212] p-5">
            <p className="mb-2 text-xs text-[#999]">
              Available Kalshi Markets
            </p>
            <p className="text-3xl font-bold">
              {loading ? "..." : markets.length}
            </p>
          </div>

          <div className="rounded-xl border border-[#292929] bg-[#121212] p-5">
            <p className="mb-2 text-xs text-[#999]">
              Kalshi Players Tracked
            </p>
            <p className="text-3xl font-bold">
              {loading ? "..." : playersTracked}
            </p>
          </div>

          <div className="rounded-xl border border-[#292929] bg-[#121212] p-5">
            <p className="mb-2 text-xs text-[#999]">
              Connected Sources
            </p>
            <p className="flex items-center gap-2 text-lg font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              DraftKings + FanDuel
            </p>
            <p className="mt-1 text-xs text-[#888]">
              NFL research · Kalshi market explorer
            </p>
          </div>
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                Kalshi Market Explorer
              </h2>
              <p className="mt-2 text-sm text-[#999]">
                Browse Kalshi player prop markets. These are
                separate from the DraftKings and FanDuel
                recommendations above.
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
                {POSITIONS.map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => {
                      setPosition(item);
                      setVisibleCount(25);
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

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label
                  htmlFor="prop-type"
                  className="text-sm text-[#aaa]"
                >
                  Prop category
                </label>

                <select
                  id="prop-type"
                  value={propType}
                  onChange={(event) => {
                    setPropType(event.target.value);
                    setVisibleCount(25);
                  }}
                  className="min-w-[230px] rounded-lg border border-[#383838] bg-[#191919] px-4 py-3 text-sm text-white"
                >
                  {propTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                <span className="text-xs text-[#888]">
                  {filtered.length.toLocaleString()} matching
                  markets
                </span>
              </div>

              <p className="mb-3 text-xs leading-5 text-[#888]">
                Position tabs group markets by stat type, not
                verified roster position. For example, an RB
                receiving prop may appear under WR/TE.
              </p>

              <div className="flex items-center gap-3 rounded-lg border border-[#303030] bg-[#191919] px-4 py-3">
                <Search
                  size={17}
                  className="text-[#888]"
                />

                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisibleCount(25);
                  }}
                  placeholder="Search player or prop..."
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#777]"
                />
              </div>
            </div>

            {marketWarnings.length > 0 && (
              <div className="border-b border-[#393124] bg-[#1b1710] px-4 py-3 text-xs text-[#dfc89e]">
                Some series may be incomplete (
                {marketWarnings.length} API warnings).
              </div>
            )}

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
                  Try another search or refresh.
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
                              type="button"
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
                                  Volume:{" "}
                                  {displayVolume(market.volume)}
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

                {filtered.length > visibleCount && (
                  <div className="border-t border-[#292929] p-5 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCount((count) => count + 25)
                      }
                      className="rounded-lg border border-[#333] bg-[#222] px-5 py-2 text-sm hover:bg-[#303030]"
                    >
                      Load 25 more (
                      {Math.min(visibleCount, filtered.length)} of{" "}
                      {filtered.length})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <footer className="mt-12 border-t border-[#242424] py-6 text-center text-xs leading-5 text-[#777]">
          PropEdge AI · Research and analytics only.
          Historical performance does not guarantee future
          outcomes. Sportsbook prices may change.
        </footer>
      </div>
    </main>
  );
}
