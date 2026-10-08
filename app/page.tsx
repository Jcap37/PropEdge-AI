"use client";

import { useState } from "react";

export default function Home() {
  const [sport, setSport] = useState("NFL");

  const sports = ["NFL", "NBA", "College Football"];

  const cardStyle = {
    background: "#161b2e",
    padding: "24px",
    borderRadius: "12px",
    border: "1px solid #293047",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "white",
        fontFamily: "Arial, sans-serif",
        padding: "32px",
      }}
    >
      <header style={{ marginBottom: "40px" }}>
        <h1 style={{ fontSize: "36px", marginBottom: "8px" }}>
          PropEdge AI
        </h1>

        <p style={{ color: "#9ca3af" }}>
          AI-Powered Sports Prediction Market Analytics
        </p>
      </header>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "32px",
          flexWrap: "wrap",
        }}
      >
        {sports.map((item) => (
          <button
            key={item}
            onClick={() => setSport(item)}
            style={{
              padding: "12px 24px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              background:
                sport === item ? "#2563eb" : "#1e293b",
              color: "white",
              fontWeight: "bold",
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "32px",
        }}
      >
        <div style={cardStyle}>
          <h3>Markets Tracked</h3>
          <h2>Not Connected</h2>
          <p style={{ color: "#9ca3af" }}>
            Awaiting live market integration
          </p>
        </div>

        <div style={cardStyle}>
          <h3>Positive EV Props</h3>
          <h2>Not Available</h2>
          <p style={{ color: "#9ca3af" }}>
            Prediction model not connected
          </p>
        </div>

        <div style={cardStyle}>
          <h3>Sportsbook Sources</h3>
          <h2>Kalshi + Polymarket</h2>
          <p style={{ color: "#9ca3af" }}>
            Public API integration planned
          </p>
        </div>
      </section>

      <section style={cardStyle}>
        <h2>Top {sport} Player Props</h2>

        <p style={{ color: "#9ca3af" }}>
          Live player prop recommendations will appear here
          once market data and statistical models are connected.
        </p>

        <div
          style={{
            overflowX: "auto",
            marginTop: "24px",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              minWidth: "650px",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #374151" }}>
                {[
                  "Player",
                  "Prop",
                  "Market",
                  "Price",
                  "Model Probability",
                  "Expected Value",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{ padding: "14px" }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    padding: "32px",
                    color: "#9ca3af",
                  }}
                >
                  No live market data connected yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        style={{
          ...cardStyle,
          marginTop: "24px",
        }}
      >
        <h2>AI Prop Analyst</h2>

        <p style={{ color: "#9ca3af" }}>
          Coming next: player performance analysis,
          matchup intelligence, injury reports,
          and probability-based recommendations.
        </p>
      </section>

      <footer
        style={{
          marginTop: "40px",
          textAlign: "center",
          color: "#64748b",
        }}
      >
        PropEdge AI | Sports Analytics Dashboard
        <p>Analysis only. No automated wagering.</p>
      </footer>
    </main>
  );
}
