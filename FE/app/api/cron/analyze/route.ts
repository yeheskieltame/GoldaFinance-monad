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
import { ethers } from 'ethers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRIVATE_KEY = process.env.AI_AGENT_PRIVATE_KEY || process.env.CONTRACT_PRIVATE_KEY;

async function executeDepositForUser(
  userAddress: string,
  usdcAmount: number
): Promise<{ txHash: string; sharesReceived: number }> {
  if (!PRIVATE_KEY) {
    throw new Error('AI_AGENT_PRIVATE_KEY not configured for server-side execution');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const vault = new ethers.Contract(
    CONTRACT_ADDRESSES.GOLDA_VAULT,
    CONTRACT_ABIS.GOLDA_VAULT,
    wallet
  );
  const usdc = new ethers.Contract(
    CONTRACT_ADDRESSES.USDC,
    CONTRACT_ABIS.USDC,
    wallet
  );

  const amountWei = ethers.parseUnits(usdcAmount.toString(), 6);

  const approveTx = await usdc.approve(CONTRACT_ADDRESSES.GOLDA_VAULT, amountWei);
  await approveTx.wait();

  const tx = await vault.deposit(amountWei);
  const receipt = await tx.wait();

  let sharesReceived = 0;
  for (const log of receipt.logs) {
    try {
      const parsed = vault.interface.parseLog(log);
      if (parsed?.name === 'Deposit') {
        sharesReceived = Number(ethers.formatUnits(parsed.args.sharesOut, 6));
        break;
      }
    } catch {
      // skip
    }
  }

  console.log(`✅ Auto-deposit executed for ${userAddress.slice(0, 10)}...`, {
    usdcSpent: usdcAmount,
    sharesReceived: sharesReceived.toFixed(6),
    txHash: receipt.hash,
  });

  return { txHash: receipt.hash, sharesReceived };
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

    const result = await executeDepositForUser(settings.walletAddress, tradeAmount);

    const log: ExecutionLog = {
      id: executionId,
      walletAddress: settings.walletAddress,
      action: 'BUY',
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      amount: tradeAmount,
      txHash: result.txHash,
      status: 'executed',
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
