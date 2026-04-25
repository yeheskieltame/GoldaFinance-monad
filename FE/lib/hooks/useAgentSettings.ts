/**
 * useAgentSettings Hook
 * 
 * Manages agent settings persistence to server.
 * This allows the AI agent to run even when user is offline.
 */

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export type SavingsAssetId = 'XAUT' | 'WBTC';

export interface AgentSettings {
  walletAddress: string;
  autoExecute: boolean;
  minConfidence: number; // route health threshold (0-100)
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  maxAmountPerTrade: number;
  enabled: boolean;
  targetAsset: SavingsAssetId;
  minIdleUSDC: number;
  cooldownMinutes: number;
}

export interface AgentExecution {
  id: string;
  action: 'BUY' | 'WAIT';
  confidence: number;
  reasoning: string;
  amount?: number;
  txHash?: string;
  status: 'pending' | 'executed' | 'skipped' | 'failed';
  targetAsset?: SavingsAssetId;
  lifiTool?: string;
  lifiToAmount?: number;
  lifiFeeUSD?: number;
  timestamp: string;
}

export interface AgentStatus {
  isActive: boolean;
  settings: AgentSettings | null;
  recentExecutions: AgentExecution[];
  stats: {
    totalExecutions: number;
    successfulBuys: number;
    skippedAnalyses: number;
    failedExecutions: number;
  };
  systemStats: {
    totalActiveAgents: number;
    lastCronRun: string | null;
  };
}

export function useAgentSettings() {
  const { user } = usePrivy();
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = user?.wallet?.address;

  // Fetch settings on mount
  useEffect(() => {
    if (!walletAddress) {
      setIsLoading(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        const [settingsRes, statusRes] = await Promise.all([
          fetch(`/api/agent/settings?wallet=${walletAddress}`),
          fetch(`/api/agent/status?wallet=${walletAddress}`),
        ]);

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data.settings);
        }

        if (statusRes.ok) {
          const data = await statusRes.json();
          setStatus(data.status);
        }
      } catch (err) {
        console.error('Failed to fetch agent settings:', err);
        setError('Failed to load agent settings');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [walletAddress]);

  // Update settings on server
  const updateSettings = useCallback(async (updates: Partial<AgentSettings>) => {
    if (!walletAddress) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          ...updates,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      const data = await response.json();
      setSettings(data.settings);

      // Refresh status after settings change
      const statusRes = await fetch(`/api/agent/status?wallet=${walletAddress}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData.status);
      }

      return data;
    } catch (err) {
      console.error('Failed to update agent settings:', err);
      setError('Failed to save settings');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [walletAddress]);

  // Enable/disable agent
  const toggleAgent = useCallback(async (enabled: boolean) => {
    return updateSettings({ enabled });
  }, [updateSettings]);

  // Toggle auto-execute
  const toggleAutoExecute = useCallback(async (autoExecute: boolean) => {
    // Auto-enabling when auto-execute is turned on
    return updateSettings({ autoExecute, enabled: autoExecute ? true : settings?.enabled });
  }, [updateSettings, settings?.enabled]);

  // Refresh status
  const refreshStatus = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const statusRes = await fetch(`/api/agent/status?wallet=${walletAddress}`);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data.status);
      }
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  }, [walletAddress]);

  return {
    settings,
    status,
    isLoading,
    isSaving,
    error,
    updateSettings,
    toggleAgent,
    toggleAutoExecute,
    refreshStatus,
  };
}
