/**
 * Cron Job: AI Agent Auto-Analysis & Execution
 *
 * Runs AI analysis and triggers vault deposits for users who have the
 * auto-agent enabled. Designed to be called by Vercel Cron.
 *
 * Setup:
 * 1. Set CRON_SECRET in environment variables
 * 2. Set AI_AGENT_PRIVATE_KEY for server-side execution
 * 3. Configure cron job to GET /api/cron/analyze with Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeGoldMarket } from '@/lib/services/aiService';
import {
  getUserBalances,
  CONTRACT_ADDRESSES,
  CONTRACT_ABIS,
  RPC_URL,
} from '@/lib/services/contractService';
import {
  agentStore,
  AgentSettings,
  ExecutionLog,
  getAllActiveAgents,
  addExecutionLog,
} from '@/lib/stores/agentStore';
import { getMonadSwapQuote, LIFI_ASSET_MAP } from '@/lib/services/lifiService';
import type { SavingsAssetId } from '@/lib/types';
import { ethers } from 'ethers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRIVATE_KEY = process.env.AI_AGENT_PRIVATE_KEY || process.env.CONTRACT_PRIVATE_KEY;

async function executeSwapForUser(
  userAddress: string,
  usdcAmount: number,
  targetAsset: SavingsAssetId
): Promise<{ txHash: string; estimatedOutput: number; toSymbol: string }> {
  if (!PRIVATE_KEY) {
    throw new Error('AI_AGENT_PRIVATE_KEY not configured for server-side execution');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Check if user has approved USDC to LiFi Diamond
  const usdc = new ethers.Contract(
    CONTRACT_ADDRESSES.USDC,
    CONTRACT_ABIS.USDC,
    provider
  );
  const allowance: bigint = await usdc.allowance(userAddress, CONTRACT_ADDRESSES.LIFI_DIAMOND);
  if (allowance < ethers.MaxUint256 / BigInt(2)) {
    throw new Error('User has not granted LiFi approval — cannot auto-swap');
  }

  // Get a fresh LiFi quote for USDC -> target asset
  const target = LIFI_ASSET_MAP[targetAsset];
  if (!target) throw new Error(`Unknown target asset: ${targetAsset}`);

  const fromAmount = ethers.parseUnits(usdcAmount.toString(), 6).toString();
  const quote = await getMonadSwapQuote({
    fromToken: CONTRACT_ADDRESSES.USDC,
    toToken: target.address,
    fromAmount,
    fromAddress: userAddress,
  });

  if (!quote) {
    throw new Error('LiFi quote failed — no route available');
  }

  // Execute the swap using the operator wallet (which forwards the user's approved USDC)
  // In a real system, the vault operator calls execute() with the LiFi calldata.
  // For the hackathon demo, we send the swap tx directly from the operator wallet.
  const step = quote._step;
  const txRequest = step.transactionRequest;
  if (!txRequest) {
    throw new Error('No transaction request in quote');
  }

  const tx = await wallet.sendTransaction({
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value ? BigInt(txRequest.value) : undefined,
    gasLimit: txRequest.gasLimit ? BigInt(txRequest.gasLimit) : undefined,
    gasPrice: txRequest.gasPrice ? BigInt(txRequest.gasPrice) : undefined,
  });

  const receipt = await tx.wait(1);
  const txHash = receipt?.hash ?? tx.hash;

  const estimatedOutput = Number(
    ethers.formatUnits(step.estimate.toAmount, target.decimals)
  );

  console.log(`✅ Auto-swap executed for ${userAddress.slice(0, 10)}...`, {
    usdcSpent: usdcAmount,
    targetAsset: target.symbol,
    estimatedOutput: estimatedOutput.toFixed(6),
    txHash,
  });

  return { txHash, estimatedOutput, toSymbol: target.symbol };
}

async function processAgent(settings: AgentSettings): Promise<ExecutionLog> {
  const executionId = `EXEC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  console.log(`🤖 Processing agent for ${settings.walletAddress.slice(0, 10)}...`);

  try {
    const balances = await getUserBalances(settings.walletAddress);

    if (balances.usdc <= 0) {
      const log: ExecutionLog = {
        id: executionId,
        walletAddress: settings.walletAddress,
        action: 'WAIT',
        confidence: 0,
        reasoning: 'No USDC balance available',
        status: 'skipped',
        timestamp: new Date(),
      };
      addExecutionLog(log);
      return log;
    }

    const tradeAmount = Math.min(balances.usdc, settings.maxAmountPerTrade);
    const analysis = await analyzeGoldMarket(tradeAmount, settings.riskLevel);

    const shouldExecute =
      analysis.action === 'BUY' &&
      analysis.confidence >= settings.minConfidence &&
      settings.autoExecute;

    if (!shouldExecute) {
      const reason =
        analysis.action !== 'BUY'
          ? `AI recommends ${analysis.action}`
          : `Confidence ${analysis.confidence}% below threshold ${settings.minConfidence}%`;

      const log: ExecutionLog = {
        id: executionId,
        walletAddress: settings.walletAddress,
        action: analysis.action === 'BUY' ? 'BUY' : 'WAIT',
        confidence: analysis.confidence,
        reasoning: reason,
        status: 'skipped',
        timestamp: new Date(),
      };
      addExecutionLog(log);
      return log;
    }

    const result = await executeSwapForUser(settings.walletAddress, tradeAmount, settings.targetAsset);

    const log: ExecutionLog = {
      id: executionId,
      walletAddress: settings.walletAddress,
      action: 'BUY',
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      amount: tradeAmount,
      txHash: result.txHash,
      status: 'executed',
      targetAsset: settings.targetAsset,
      lifiToAmount: result.estimatedOutput,
      timestamp: new Date(),
    };
    addExecutionLog(log);
    return log;
  } catch (error) {
    console.error(`❌ Agent execution failed for ${settings.walletAddress}:`, error);
    const log: ExecutionLog = {
      id: executionId,
      walletAddress: settings.walletAddress,
      action: 'WAIT',
      confidence: 0,
      reasoning: `Execution failed: ${(error as Error).message}`,
      status: 'failed',
      timestamp: new Date(),
    };
    addExecutionLog(log);
    return log;
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'hackathon-demo-secret';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const activeAgentsList = getAllActiveAgents();

    console.log(`\n🔄 Cron job started at ${new Date().toISOString()}`);
    console.log(`📋 Active agents: ${activeAgentsList.length}`);

    if (activeAgentsList.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active agents to process',
        processed: 0,
        timestamp: new Date().toISOString(),
      });
    }

    const results: ExecutionLog[] = [];
    for (const agent of activeAgentsList) {
      results.push(await processAgent(agent));
    }

    agentStore.setLastCronRun(new Date());

    const summary = {
      totalProcessed: results.length,
      executed: results.filter((r) => r.status === 'executed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      durationMs: Date.now() - startTime,
    };

    console.log(`\n✨ Cron job completed:`, summary);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      results: results.map((r) => ({
        wallet: r.walletAddress.slice(0, 10) + '...',
        action: r.action,
        confidence: r.confidence,
        status: r.status,
        txHash: r.txHash?.slice(0, 20),
      })),
    });
  } catch (error) {
    console.error('❌ Cron Job Error:', error);
    return NextResponse.json(
      { error: 'Cron job failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'hackathon-demo-secret';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'trigger') {
      return GET(req);
    }

    const activeAgents = getAllActiveAgents();
    const recentLogs = agentStore.getExecutionLogs(undefined, 20);

    return NextResponse.json({
      success: true,
      state: {
        activeAgentsCount: activeAgents.length,
        activeAgents: activeAgents.map((a) => ({
          wallet: a.walletAddress.slice(0, 10) + '...',
          minConfidence: a.minConfidence,
          riskLevel: a.riskLevel,
          maxAmount: a.maxAmountPerTrade,
        })),
        recentExecutions: recentLogs.slice(0, 10),
        lastCronRun: agentStore.getLastCronRun()?.toISOString() || null,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
