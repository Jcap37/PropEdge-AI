"use client";

import { useEffect, useState } from "react";

type Market = {
  id: string;
  event?: string;
  question: string;
  outcomes: string | string[];
  outcomePrices: string | string[];
  volume?: string | number;
  liquidity?: string | number;
};

type ApiResponse = {
  success: boolean;
  count?: number;
  markets?: Market[];
  error?: string;
  updatedAt?: string;
};

function parseArray(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  async function loadMarkets() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/kalshi", {
        cache: "no-store",
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load markets");
      }

      setMarkets(data.markets || []);
      setUpdatedAt(data.updatedAt || "");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarkets();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090e1b",
        color: "#f8fafc",
        fontFamily: "Arial, sans-serif",
        padding: "32px",
      }}
    >
      <header style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "36px", marginBottom: "8px" }}>
          PropEdge AI
        </h1>

        <p style={{ color: "#94a3b8" }}>
          Sports prediction market analytics
        </p>
      </header>

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "28px",
        }}
      >
        {["NFL", "NBA — Coming Soon", "College Football — Coming Soon"].map(
          (sport) => (
            <span
              key={sport}
              style={{
                background: "#172033",
                padding: "12px 20px",
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
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "32px",
        }}
      >
        <div style={cardStyle}>
          <p style={labelStyle}>Markets Found</p>
          <h2>{loading ? "Loading..." : markets.length}</h2>
        </div>

        <div style={cardStyle}>
          <p style={labelStyle}>Data Source</p>
          <h2>Polymarket</h2>
        </div>

        <div style={cardStyle}>
          <p style={labelStyle}>Positive EV Props</p>
          <h2>Not Calculated</h2>
        </div>
      </section>

      <section
        style={{
          background: "#111827",
          borderRadius: "12px",
          padding: "24px",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          <h2>Live NFL Player Prop Markets</h2>

          <button
            onClick={loadMarkets}
            disabled={loading}
            style={{
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "10px 18px",
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
            No matching markets were found.
          </p>
        )}

        {markets.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              minWidth: "700px",
            }}
          >
            <thead>
              <tr>
                {[
                  "Market",
                  "Outcomes",
                  "Prices",
                  "Volume",
                  "Source",
                ].map((heading) => (
                  <th key={heading} style={cellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {markets.map((market) => {
                const outcomes = parseArray(market.outcomes);
                const prices = parseArray(market.outcomePrices);

                return (
                  <tr key={market.id}>
                    <td style={cellStyle}>
                      {market.question}
                    </td>

                    <td style={cellStyle}>
                      {outcomes.join(" / ")}
                    </td>

                    <td style={cellStyle}>
                      {prices
                        .map((price) => {
                          const value = Number(price);
                          return Number.isFinite(value)
                            ? `${(value * 100).toFixed(1)}%`
                            : price;
                        })
                        .join(" / ")}
                    </td>

                    <td style={cellStyle}>
                      {Number(market.volume || 0).toLocaleString()}
                    </td>

                    <td style={cellStyle}>
                      Polymarket
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {updatedAt && (
          <p
            style={{
              color: "#64748b",
              fontSize: "12px",
              marginTop: "20px",
            }}
          >
            Last fetched: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </section>

      <section
        style={{
          marginTop: "28px",
          padding: "24px",
          background: "#111827",
          borderRadius: "12px",
        }}
      >
        <h2>AI Prop Analyst</h2>

        <p style={{ color: "#94a3b8", lineHeight: "1.7" }}>
          Coming next: historical player statistics, matchup analysis,
          model probabilities, expected value calculations, and
          AI-generated explanations.
        </p>
      </section>
    </main>
  );
}

const cardStyle = {
  background: "#172033",
  padding: "24px",
  borderRadius: "12px",
  flex: "1 1 200px",
};

const labelStyle = {
  color: "#94a3b8",
  fontSize: "14px",
};

const cellStyle = {
  padding: "14px",
  borderBottom: "1px solid #263247",
  fontSize: "14px",
};
