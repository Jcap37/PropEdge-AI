// Reuse the same Kalshi market discovery and parsing logic as /api/kalshi.
// This keeps the market explorer, research API, and AI analysis in sync.
import { GET as getExpandedKalshiResponse } from "../app/api/kalshi/route";

export type KalshiResearchMarket = {
  id: string;
  ticker: string;
  eventTicker: string | null;
  title: string;
  question: string;
  player: string;
  sport: string;
  propType: string;
  line: number | null;
  yesBid: string | null;
  yesAsk: string | null;
  lastPrice: string | null;
  volume: number;
  gameTime: string | null;
  closeTime: string | null;
};

type ExpandedKalshiResponse = {
  success: boolean;
  source?: string;
  sport?: string;
  count?: number;
  markets?: KalshiResearchMarket[];
  byPropType?: Record<string, number>;
  seriesTickers?: string[];
  warnings?: string[];
  updatedAt?: string;
  error?: string;
};

export async function getKalshiMarkets() {
  const response = await getExpandedKalshiResponse();
  const data = (await response.json()) as ExpandedKalshiResponse;

  if (!response.ok || !data.success || !Array.isArray(data.markets)) {
    throw new Error(data.error ?? "Unable to load expanded Kalshi markets.");
  }

  return {
    success: true as const,
    source: "Kalshi",
    sport: "NFL",
    propType: "Multiple",
    count: data.markets.length,
    markets: data.markets,
    byPropType: data.byPropType ?? {},
    seriesTickers: data.seriesTickers ?? [],
    warnings: data.warnings ?? [],
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}
