import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPythGoldPrice } from './pythService';

// Initialize Gemini AI with Flash model (fast and cheap)
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '');

async function getCurrentGoldPrice(): Promise<number> {
  try {
    const px = await getPythGoldPrice();
    return px.currentPrice;
  } catch {
    return 2650;
  }
}

export interface GoldMarketAnalysis {
  action: 'BUY' | 'WAIT' | 'SELL';
  confidence: number;
  reasoning: string;
  currentPrice: number;
  priceTarget: number;
  riskLevel: 'low' | 'medium' | 'high';
  marketSentiment: string;
}

export interface AIAgentStats {
  totalAnalyses: number;
  buyRecommendations: number;
  waitRecommendations: number;
  avgConfidence: number;
  lastAnalysis: Date | null;
}

/**
 * Analyze gold market using Gemini Flash API
 * Uses current on-chain price from Pyth Oracle
 */
export async function analyzeGoldMarket(
  usdcAmount: number,
  riskPreference: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
): Promise<GoldMarketAnalysis> {
  try {
    // Get current gold price from Pyth Hermes API
    const currentPrice = await getCurrentGoldPrice();

    // Simulate some market data (in production, fetch from oracle or API)
    const mockHigh24h = currentPrice * 1.015;
    const mockLow24h = currentPrice * 0.985;
    const mockChange24h = ((currentPrice - mockLow24h) / mockLow24h) * 100;
    const mockVolatility = Math.random() * 2 + 0.5; // 0.5% to 2.5%

    const prompt = `You are GOLDA AI, an expert savings advisor for an inflation-resistant USDC vault that routes deposits into PAXG, XAUt0, and WBTC.
    
CURRENT MARKET DATA:
- Current Gold Price: $${currentPrice.toFixed(2)}
- 24h High: $${mockHigh24h.toFixed(2)}
- 24h Low: $${mockLow24h.toFixed(2)}
- 24h Change: ${mockChange24h.toFixed(2)}%
- Volatility: ${mockVolatility.toFixed(2)}%
- User Deposit: $${usdcAmount} USDC
- Risk Preference: ${riskPreference}

DECISION FRAMEWORK:
For ${riskPreference} risk:
${riskPreference === 'conservative' ? '- Only buy when very confident (>85%), wait otherwise' : ''}
${riskPreference === 'moderate' ? '- Buy on good opportunities (>70% confidence)' : ''}
${riskPreference === 'aggressive' ? '- Take more chances (>60% confidence is acceptable)' : ''}

ANALYZE and respond in this exact JSON format only (no markdown, just JSON):
{
  "action": "BUY" or "WAIT" or "SELL",
  "confidence": 0-100,
  "reasoning": "2-3 sentence explanation of the decision",
  "currentPrice": ${currentPrice},
  "priceTarget": target_price_number,
  "riskLevel": "low" or "medium" or "high",
  "marketSentiment": "bullish" or "bearish" or "neutral"
}`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192, // Increased to accommodate thinking tokens
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    // Check if response was truncated
    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.warn('AI response was truncated due to MAX_TOKENS');
    }
    
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid AI response format - no JSON found');
    }
    
    let analysis: GoldMarketAnalysis;
    try {
      analysis = JSON.parse(jsonMatch[0]) as GoldMarketAnalysis;
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError, 'Raw text:', text);
      throw new Error('Failed to parse AI response JSON');
    }

    // Validate and sanitize response
    return {
      action: ['BUY', 'WAIT', 'SELL'].includes(analysis.action) ? analysis.action : 'WAIT',
      confidence: Math.min(100, Math.max(0, analysis.confidence || 50)),
      reasoning: analysis.reasoning || 'Analysis completed',
      currentPrice: analysis.currentPrice || currentPrice,
      priceTarget: analysis.priceTarget || currentPrice,
      riskLevel: ['low', 'medium', 'high'].includes(analysis.riskLevel) ? analysis.riskLevel : 'medium',
      marketSentiment: analysis.marketSentiment || 'neutral',
    };
  } catch (error) {
    console.error('AI Analysis Error:', error);

    // Fallback when AI is unavailable
    const fallbackPrice = 2650.00;
    return {
      action: 'WAIT',
      confidence: 50,
      reasoning: 'AI service temporarily unavailable. Recommending to wait for analysis.',
      currentPrice: fallbackPrice,
      priceTarget: fallbackPrice * 0.99,
      riskLevel: 'medium',
      marketSentiment: 'neutral',
    };
  }
}

/**
 * Get AI chat response for user questions about gold market
 */
export async function chatWithAI(
  userMessage: string,
  goldPrice: number,
  goldBalance: number,
  usdcBalance: number
): Promise<string> {
  try {
    const prompt = `You are GOLDA AI, a friendly and knowledgeable savings & investment assistant for the GoldaFinance vault on Monad.

USER PORTFOLIO:
- gUSDC Shares: ${goldBalance.toFixed(4)}
- USDC Balance: $${usdcBalance.toFixed(2)}
- Current Gold Price: $${goldPrice.toFixed(2)}

USER QUESTION: "${userMessage}"

Provide a helpful, concise response (2-4 sentences). Be friendly but professional.
If asked about predictions, be cautious and mention that past performance doesn't guarantee future results.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048, // Increased to accommodate thinking tokens
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('AI Chat Error:', error);
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}

/**
 * Generate market insight summary
 */
export async function getMarketInsight(goldPrice: number): Promise<string> {
  try {
    const prompt = `As GOLDA AI, provide a brief 1-2 sentence market insight for gold at $${goldPrice.toFixed(2)}.
Focus on actionable information for investors. Be concise and professional.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1024, // Increased to accommodate thinking tokens
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch {
    return `Gold trading at $${goldPrice.toFixed(2)}. Monitor for entry opportunities.`;
  }
}
