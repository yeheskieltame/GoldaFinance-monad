/**
 * Agent Status API
 * 
 * Real-time status of the AI agent for a user.
 * Shows recent analyses, pending executions, and agent health.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  agentStore, 
  getAgentSettings, 
  getAllActiveAgents,
  getExecutionLogs 
} from '@/lib/stores/agentStore';

// GET - Get agent status for a user
export async function GET(req: NextRequest) {
  try {
    const walletAddress = req.nextUrl.searchParams.get('wallet');
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      );
    }

    const settings = getAgentSettings(walletAddress);
    const executions = getExecutionLogs(walletAddress, 10);
    const allActiveAgents = getAllActiveAgents();
    const stats = agentStore.getStats(walletAddress);

    return NextResponse.json({
      success: true,
      status: {
        isActive: settings?.enabled && settings?.autoExecute,
        settings: settings || null,
        recentExecutions: executions.map(e => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        })),
        stats,
        systemStats: {
          totalActiveAgents: allActiveAgents.length,
          lastCronRun: agentStore.getLastCronRun()?.toISOString() || null,
        }
      }
    });
  } catch (error) {
    console.error('Get Agent Status Error:', error);
    return NextResponse.json(
      { error: 'Failed to get agent status' },
      { status: 500 }
    );
  }
}
