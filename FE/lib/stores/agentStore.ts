/**
 * Shared Agent Store
 * 
 * A centralized store for agent settings and execution logs.
 * This is shared between the settings API and the cron job.
 * 
 * Note: In production, this should be backed by a database (e.g., Redis, PostgreSQL)
 * For hackathon demo, we use in-memory storage with module-level state.
 */

export type SavingsAssetId = 'PAXG' | 'XAUT' | 'WBTC';

export interface AgentSettings {
  walletAddress: string;
  autoExecute: boolean;
  minConfidence: number; // legacy field — repurposed as min route health % (LiFi)
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  maxAmountPerTrade: number;
  enabled: boolean;
  // Routing automation
  targetAsset: SavingsAssetId;       // which asset operator routes USDC into
  minIdleUSDC: number;               // leave at least this much USDC liquid in wallet
  cooldownMinutes: number;           // cooldown between auto-runs (per agent)
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionLog {
  id: string;
  walletAddress: string;
  action: 'BUY' | 'WAIT';
  confidence: number;
  reasoning: string;
  amount?: number;
  txHash?: string;
  status: 'pending' | 'executed' | 'skipped' | 'failed';
  // LiFi route metadata
  targetAsset?: SavingsAssetId;
  lifiTool?: string;       // route bridge/dex name
  lifiToAmount?: number;   // estimated asset amount received
  lifiFeeUSD?: number;
  timestamp: Date;
}

// Singleton stores
class AgentStore {
  private static instance: AgentStore;
  private settingsStore: Map<string, AgentSettings> = new Map();
  private executionLogs: ExecutionLog[] = [];
  private lastCronRun: Date | null = null;

  private constructor() {}

  static getInstance(): AgentStore {
    if (!AgentStore.instance) {
      AgentStore.instance = new AgentStore();
    }
    return AgentStore.instance;
  }

  // Settings management
  getSettings(walletAddress: string): AgentSettings | undefined {
    return this.settingsStore.get(walletAddress.toLowerCase());
  }

  setSettings(walletAddress: string, settings: AgentSettings): void {
    this.settingsStore.set(walletAddress.toLowerCase(), settings);
  }

  getAllActiveAgents(): AgentSettings[] {
    return Array.from(this.settingsStore.values()).filter(
      s => s.enabled && s.autoExecute
    );
  }

  getAllSettings(): AgentSettings[] {
    return Array.from(this.settingsStore.values());
  }

  // Execution log management
  addExecutionLog(log: ExecutionLog): void {
    this.executionLogs.unshift(log);
    // Keep only last 1000 logs
    if (this.executionLogs.length > 1000) {
      this.executionLogs.pop();
    }
  }

  getExecutionLogs(walletAddress?: string, limit: number = 20): ExecutionLog[] {
    let logs = this.executionLogs;
    if (walletAddress) {
      logs = logs.filter(l => l.walletAddress === walletAddress.toLowerCase());
    }
    return logs.slice(0, limit);
  }

  // Cron tracking
  setLastCronRun(date: Date): void {
    this.lastCronRun = date;
  }

  getLastCronRun(): Date | null {
    return this.lastCronRun;
  }

  // Stats
  getStats(walletAddress?: string) {
    const logs = this.getExecutionLogs(walletAddress, 1000);
    return {
      totalExecutions: logs.length,
      successfulBuys: logs.filter(l => l.status === 'executed').length,
      skippedAnalyses: logs.filter(l => l.status === 'skipped').length,
      failedExecutions: logs.filter(l => l.status === 'failed').length,
    };
  }
}

// Export singleton instance
export const agentStore = AgentStore.getInstance();

// Convenience functions for backwards compatibility
export function getAgentSettings(walletAddress: string): AgentSettings | undefined {
  return agentStore.getSettings(walletAddress);
}

export function setAgentSettings(walletAddress: string, settings: AgentSettings): void {
  agentStore.setSettings(walletAddress, settings);
}

export function getAllActiveAgents(): AgentSettings[] {
  return agentStore.getAllActiveAgents();
}

export function addExecutionLog(log: ExecutionLog): void {
  agentStore.addExecutionLog(log);
}

export function getExecutionLogs(walletAddress?: string, limit?: number): ExecutionLog[] {
  return agentStore.getExecutionLogs(walletAddress, limit);
}
