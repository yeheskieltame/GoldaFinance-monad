/**
 * GoldaAPI — thin REST client for Golda Finance backend endpoints.
 * All endpoints are served from the same Next.js app under /api.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export class GoldaAPI {
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  }

  static async getVaultBalances(walletAddress: string) {
    return this.request<{
      success: boolean;
      balances: {
        usdc: number;
        shares: number;
        sharePrice: number;
        navUSDC: number;
        shareValueUSDC: number;
        usdcAllowance: number;
      };
    }>(`/balances/${walletAddress}`);
  }

  static async getGoldPrice() {
    return this.request<{
      success: boolean;
      price: {
        currentPrice: number;
        emaPrice: number;
        high24h: number;
        low24h: number;
        change24h: number;
        volatility: number;
        timestamp: string;
      };
    }>('/price');
  }

  static async createDeposit(data: {
    walletAddress: string;
    amount: number;
    asset: 'PAXG' | 'XAUT' | 'WBTC';
    txHash?: string;
  }) {
    return this.request<{
      success: boolean;
      depositId: string;
      status: 'pending' | 'analyzing' | 'completed';
    }>('/deposits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async getDepositStatus(depositId: string) {
    return this.request<{
      depositId: string;
      status: 'pending' | 'analyzing' | 'completed' | 'failed';
      txHash?: string;
      sharesReceived?: number;
    }>(`/deposits/${depositId}`);
  }

  static async getTransactionHistory(walletAddress: string) {
    return this.request<
      Array<{
        id: string;
        type: 'deposit' | 'withdraw_request' | 'claim' | 'transfer_in' | 'transfer_out';
        amount: number;
        currency: string;
        status: string;
        timestamp: string;
        txHash?: string;
      }>
    >(`/transactions/${walletAddress}`);
  }
}

// Legacy alias so anything still importing AureoAPI keeps compiling.
export const AureoAPI = GoldaAPI;
