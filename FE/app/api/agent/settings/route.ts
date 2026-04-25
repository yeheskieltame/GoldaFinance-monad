/**
 * Agent Settings API
 * 
 * Stores user agent settings server-side so the cron job can run
 * analyses and executions even when the user is offline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  agentStore, 
  AgentSettings, 
  getAgentSettings, 
  getAllActiveAgents 
} from '@/lib/stores/agentStore';

// Re-export for backwards compatibility
export { getAgentSettings, getAllActiveAgents };

// GET - Retrieve user's agent settings
export async function GET(req: NextRequest) {
  try {
    const walletAddress = req.nextUrl.searchParams.get('wallet');
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      );
    }

    const settings = agentStore.getSettings(walletAddress);
    
    if (!settings) {
      // Return default settings
      return NextResponse.json({
        success: true,
        settings: {
          walletAddress: walletAddress.toLowerCase(),
          autoExecute: false,
          minConfidence: 70,
          riskLevel: 'moderate',
          maxAmountPerTrade: 100,
          enabled: false,
          targetAsset: 'XAUT',
          minIdleUSDC: 5,
          cooldownMinutes: 60,
        }
      });
    }

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Get Agent Settings Error:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

// POST - Update user's agent settings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      walletAddress,
      autoExecute,
      minConfidence,
      riskLevel,
      maxAmountPerTrade,
      enabled,
      targetAsset,
      minIdleUSDC,
      cooldownMinutes,
    } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const existingSettings = agentStore.getSettings(normalizedAddress);

    const settings: AgentSettings = {
      walletAddress: normalizedAddress,
      autoExecute: autoExecute ?? existingSettings?.autoExecute ?? false,
      minConfidence: minConfidence ?? existingSettings?.minConfidence ?? 70,
      riskLevel: riskLevel ?? existingSettings?.riskLevel ?? 'moderate',
      maxAmountPerTrade: maxAmountPerTrade ?? existingSettings?.maxAmountPerTrade ?? 100,
      enabled: enabled ?? existingSettings?.enabled ?? false,
      targetAsset: targetAsset ?? existingSettings?.targetAsset ?? 'XAUT',
      minIdleUSDC: minIdleUSDC ?? existingSettings?.minIdleUSDC ?? 5,
      cooldownMinutes: cooldownMinutes ?? existingSettings?.cooldownMinutes ?? 60,
      createdAt: existingSettings?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    agentStore.setSettings(normalizedAddress, settings);

    // Log for debugging
    console.log('📝 Agent settings updated:', {
      wallet: normalizedAddress.slice(0, 10) + '...',
      enabled: settings.enabled,
      autoExecute: settings.autoExecute,
      minConfidence: settings.minConfidence,
      riskLevel: settings.riskLevel,
    });

    return NextResponse.json({
      success: true,
      message: autoExecute && enabled 
        ? '🤖 Auto-agent enabled! AI will monitor market and execute trades for you even when you\'re offline.'
        : 'Agent settings saved.',
      settings,
      activeAgentsCount: agentStore.getAllActiveAgents().length,
    });
  } catch (error) {
    console.error('Update Agent Settings Error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

// DELETE - Disable agent for user
export async function DELETE(req: NextRequest) {
  try {
    const walletAddress = req.nextUrl.searchParams.get('wallet');
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required' },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const settings = agentStore.getSettings(normalizedAddress);
    
    if (settings) {
      settings.enabled = false;
      settings.autoExecute = false;
      settings.updatedAt = new Date();
      agentStore.setSettings(normalizedAddress, settings);
    }

    return NextResponse.json({
      success: true,
      message: 'Agent disabled',
    });
  } catch (error) {
    console.error('Delete Agent Settings Error:', error);
    return NextResponse.json(
      { error: 'Failed to disable agent' },
      { status: 500 }
    );
  }
}
