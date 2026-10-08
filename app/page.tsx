
"use client";

import { useCallback, useEffect, useState } from "react";

type Market = {
  id: string;
  ticker: string;
  title: string;
  question: string;
  subtitle?: string;
  yesBid?: string | null;
  yesAsk?: string | null;
  lastPrice?: string | null;
  volume?: number;
  closeTime?: string | null;
};

type ApiResponse = {
  success: boolean;
  source?: string;
  count?: number;
  markets?: Market[];
  updatedAt?: string;
  error?: string;
};

function formatPrice(value?: string | null) {
  if (value == null || value === "") return "—";

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return `${(number * 100).toFixed(1)}¢`;
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/kalshi", {
        cache: "no-store",
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load Kalshi markets");
      }

      setMarkets(data.markets ?? []);
      setUpdatedAt(data.updatedAt ?? "");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  const cardStyle = {
    background: "#172033",
    border: "1px solid #29354d",
    borderRadius: "12px",
    padding: "22px",
    flex: "1 1 200px",
  };

  const cellStyle = {
    padding: "14px",
    borderBottom: "1px solid #29354d",
    textAlign: "left" as const,
    fontSize: "14px",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090e1b",
        color: "#f8fafc",
        fontFamily: "Arial, sans-serif",
        padding: "30px",
      }}
    >
      <header style={{ marginBottom: "30px" }}>
        <h1 style={{ fontSize: "36px", marginBottom: "8px" }}>
          PropEdge AI
        </h1>
        <p style={{ color: "#94a3b8" }}>
          Live sports prediction market analytics
        </p>
      </header>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "28px",
        }}
      >
        {["NFL", "NBA — Coming Soon", "College Football — Coming Soon"].map(
          (sport) => (
            <span
              key={sport}
              style={{
                background: "#172033",
                padding: "12px 18px",
                borderRadius: "8px",
              }}
            >
              {sport}
            </span>
          )
        )}
      </div>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "30px",
        }}
      >
        <div style={cardStyle}>
          <p style={{ color: "#94a3b8" }}>Markets Loaded</p>
          <h2>{loading ? "Loading..." : markets.length}</h2>
        </div>

        <div style={cardStyle}>
          <p style={{ color: "#94a3b8" }}>Market Source</p>
          <h2>Kalshi</h2>
        </div>

        <div style={cardStyle}>
          <p style={{ color: "#94a3b8" }}>Model-Verified Props</p>
          <h2>Not Available Yet</h2>
        </div>
      </section>

      <section
        style={{
          background: "#111827",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ margin: 0 }}>Kalshi Live Markets</h2>

          <button
            onClick={() => void loadMarkets()}
            disabled={loading}
            style={{
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "11px 18px",
              borderRadius: "8px",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Loading..." : "Refresh Markets"}
          </button>
        </div>

        {error && (
          <p style={{ color: "#f87171" }}>
            Error: {error}
          </p>
        )}

        {!loading && !error && markets.length === 0 && (
          <p style={{ color: "#94a3b8" }}>
            No markets were returned by Kalshi.
          </p>
        )}

        {markets.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: "800px",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  {[
                    "Market",
                    "Yes Bid",
                    "Yes Ask",
                    "Last Price",
                    "Volume",
                    "Closes",
                  ].map((heading) => (
                    <th key={heading} style={cellStyle}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {markets.map((market) => (
                  <tr key={market.id}>
                    <td style={cellStyle}>
                      <strong>{market.title}</strong>
                      {market.subtitle && (
                        <p style={{ color: "#94a3b8" }}>
                          {market.subtitle}
                        </p>
                      )}
                    </td>

                    <td style={cellStyle}>
                      {formatPrice(market.yesBid)}
                    </td>

                    <td style={cellStyle}>
                      {formatPrice(market.yesAsk)}
                    </td>

                    <td style={cellStyle}>
                      {formatPrice(market.lastPrice)}
                    </td>

                    <td style={cellStyle}>
                      {(market.volume ?? 0).toLocaleString()}
                    </td>

                    <td style={cellStyle}>
                      {market.closeTime
                        ? new Date(market.closeTime).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {updatedAt && (
          <p
            style={{
              marginTop: "20px",
              fontSize: "12px",
              color: "#64748b",
            }}
          >
            Last fetched: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </section>

      <section
        style={{
          background: "#111827",
          borderRadius: "12px",
          padding: "24px",
          marginTop: "24px",
        }}
      >
        <h2>AI Player Prop Analyst</h2>
        <p style={{ color: "#94a3b8", lineHeight: "1.7" }}>
          Coming next: NFL player prop filtering, historical
          performance, matchup analysis, injuries, estimated
          probabilities, and expected value rankings.
        </p>
      </section>

      <footer
        style={{
          textAlign: "center",
          marginTop: "35px",
          color: "#64748b",
          fontSize: "13px",
        }}
      >
        PropEdge AI — Analytics only. No automated wagering.
      </footer>
    </main>
  );
}
