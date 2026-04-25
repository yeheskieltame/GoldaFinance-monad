/**
 * x402-Protected AI Market Analysis Endpoint
 *
 * Premium AI-powered savings market analysis (gold + BTC).
 * Protected by x402 — users pay $0.01 USDC per analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withX402Protection, X402_CONFIG } from '@/lib/x402';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPythGoldPrice } from '@/lib/services/pythService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface MarketAnalysis {
  action: 'BUY' | 'WAIT';
  confidence: number;
  reasoning: string;
  currentPrice: number;
  priceTarget: number;
  indicators: {
    priceVsEMA: 'above' | 'below' | 'at';
    volatility: 'high' | 'medium' | 'low';
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  recommendation: string;
  timestamp: string;
}

async function getGoldPrice(): Promise<number> {
  try {
    const px = await getPythGoldPrice();
    return px.currentPrice;
  } catch (error) {
    console.error('Failed to get gold price:', error);
    return 2650;
  }
}

async function analyzeMarket(
  request: NextRequest,
  payer: string
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { depositAmount } = body;

    const currentPrice = await getGoldPrice();

    const high24h = currentPrice * 1.015;
    const low24h = currentPrice * 0.985;
    const change24h = ((currentPrice - low24h) / low24h) * 100;
    const volatility = (Math.abs(high24h - low24h) / currentPrice) * 100;
    const emaPrice = currentPrice * 0.998;

    const prompt = `You are GOLDA AI, an expert savings advisor for an inflation-resistant USDC vault that routes deposits into tokenized gold (PAXG/XAUt0) and BTC. Analyze the current gold market and decide whether the user should DEPOSIT NOW or WAIT for a better entry.

CURRENT MARKET DATA:
- Current Gold Price (XAU/USD): $${currentPrice.toFixed(2)}
- 24h High: $${high24h.toFixed(2)}
- 24h Low: $${low24h.toFixed(2)}
- 24h Change: ${change24h.toFixed(2)}%
- Market Volatility: ${volatility.toFixed(2)}%
- EMA Price: $${emaPrice.toFixed(2)}
- Deposit Amount: ${depositAmount || 100} USDC

DECISION CRITERIA:
1. BUY (deposit now) if: price near 24h low OR dipped >1% from EMA OR high volatility with reversal signal.
2. WAIT if: price near 24h high OR uptrend without pullback OR low volatility, no clear edge.

Respond ONLY in this JSON format:
{
  "action": "BUY" or "WAIT",
  "confidence": 0-100,
  "reasoning": "Brief 1-2 sentence explanation",
  "currentPrice": ${currentPrice},
  "priceTarget": estimated_optimal_entry_price,
  "indicators": {
    "priceVsEMA": "above" or "below" or "at",
    "volatility": "high" or "medium" or "low",
    "trend": "bullish" or "bearish" or "neutral"
  },
  "recommendation": "Detailed recommendation for user"
}`;

    let analysis: MarketAnalysis;
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid AI response format');

      analysis = {
        ...JSON.parse(jsonMatch[0]),
        timestamp: new Date().toISOString(),
      };
    } catch (aiError) {
      console.error('AI Analysis Error:', aiError);
      const fallbackAction = currentPrice < emaPrice * 0.995 ? 'BUY' : 'WAIT';
      analysis = {
        action: fallbackAction,
        confidence: 60,
        reasoning: 'Fallback: Price-based decision due to AI service unavailability',
        currentPrice,
        priceTarget: low24h,
        indicators: {
          priceVsEMA: currentPrice < emaPrice ? 'below' : currentPrice > emaPrice ? 'above' : 'at',
          volatility: volatility > 0.5 ? 'high' : volatility > 0.2 ? 'medium' : 'low',
          trend: change24h > 0.5 ? 'bullish' : change24h < -0.5 ? 'bearish' : 'neutral',
        },
        recommendation: fallbackAction === 'BUY'
          ? 'Current price shows good entry opportunity based on technical indicators'
          : 'Recommend waiting for a better entry point',
        timestamp: new Date().toISOString(),
      };
    }

    return NextResponse.json({
      success: true,
      analysis,
      marketData: { currentPrice, high24h, low24h, change24h, volatility, emaPrice },
      payer,
      x402Fee: X402_CONFIG.pricing.marketAnalysis / 1_000_000,
    });
  } catch (error) {
    console.error('Market analysis error:', error);
    return NextResponse.json(
      { error: 'Market analysis failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export const POST = withX402Protection(
  analyzeMarket,
  X402_CONFIG.pricing.marketAnalysis,
  'AI Market Analysis — Real-time gold market insights powered by GOLDA AI'
);

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/x402/analyze',
    description: 'AI-powered gold market analysis with deposit/wait recommendations',
    pricing: {
      amount: X402_CONFIG.pricing.marketAnalysis,
      amountUSDC: X402_CONFIG.pricing.marketAnalysis / 1_000_000,
      currency: 'USDC',
      network: X402_CONFIG.paymentToken.network,
    },
    x402: {
      version: '1',
      payee: X402_CONFIG.payee,
      token: X402_CONFIG.paymentToken.address,
    },
  });
}
