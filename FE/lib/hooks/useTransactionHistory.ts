'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    getSwapHistory,
    addSwapRecord,
    type SwapRecord,
} from '@/lib/services/swapHistory';

export interface Transaction {
    id: string;
    type: 'deposit' | 'withdraw_request' | 'claim' | 'swap';
    amount: number;
    shares?: number;
    withdrawalId?: number;
    timestamp: Date;
    txHash: string;
    status: 'completed' | 'pending' | 'failed';
    description: string;
    blockNumber: number;
    asset: 'usdc' | 'shares' | 'swap';
    swapToSymbol?: string;
    swapToAmount?: number;
}

export interface TransactionFilters {
    type?: 'all' | 'deposit' | 'withdraw_request' | 'claim' | 'swap';
    startDate?: Date;
    endDate?: Date;
}

function buildDescription(tx: { type: string; amount: number; withdrawalId?: number }): string {
    switch (tx.type) {
        case 'deposit':
            return `Deposited $${tx.amount.toFixed(2)} USDC`;
        case 'withdraw_request':
            return `Requested withdraw of $${tx.amount.toFixed(2)} USDC`;
        case 'claim':
            return `Claimed $${tx.amount.toFixed(2)} USDC`;
        default:
            return `Transaction $${tx.amount.toFixed(2)}`;
    }
}

function swapRecordToTransaction(swap: SwapRecord): Transaction {
    return {
        id: `swap-${swap.txHash}`,
        type: 'swap',
        amount: swap.fromAmountHuman,
        timestamp: new Date(swap.timestamp),
        txHash: swap.txHash,
        status: swap.status,
        description: `Swapped ${swap.fromAmountHuman.toFixed(2)} ${swap.fromTokenSymbol} → ${swap.toAmountHuman.toFixed(6)} ${swap.toTokenSymbol}`,
        blockNumber: 0,
        asset: 'swap',
        swapToSymbol: swap.toTokenSymbol,
        swapToAmount: swap.toAmountHuman,
    };
}

export function useTransactionHistory(walletAddress: string | undefined) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTransactions = useCallback(async () => {
        if (!walletAddress) return;

        setIsLoading(true);
        setError(null);

        try {
            // Server-side API handles chunked RPC queries — no client-side loop
            const res = await fetch(`/api/transactions/${walletAddress}`);
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();

            const txList: Transaction[] = [];

            if (data.success && Array.isArray(data.transactions)) {
                for (const tx of data.transactions) {
                    txList.push({
                        id: tx.id,
                        type: tx.type,
                        amount: tx.amount,
                        shares: tx.shares,
                        withdrawalId: tx.withdrawalId,
                        timestamp: new Date(tx.timestamp),
                        txHash: tx.txHash,
                        status: 'completed',
                        description: buildDescription(tx),
                        blockNumber: tx.blockNumber,
                        asset: tx.type === 'deposit' || tx.type === 'claim' ? 'usdc' : 'shares',
                    });
                }
            }

            // Merge local LiFi swap history (stored in localStorage, not on-chain)
            const swapHistory = getSwapHistory();
            for (const swap of swapHistory) {
                txList.push(swapRecordToTransaction(swap));
            }

            txList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            setTransactions(txList);
        } catch (err) {
            console.error('Error fetching transactions:', err);
            setError('Failed to fetch transaction history');
        } finally {
            setIsLoading(false);
        }
    }, [walletAddress]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const filterTransactions = useCallback((filters: TransactionFilters): Transaction[] => {
        return transactions.filter(tx => {
            if (filters.type && filters.type !== 'all') {
                if (tx.type !== filters.type) return false;
            }
            if (filters.startDate && tx.timestamp < filters.startDate) return false;
            if (filters.endDate && tx.timestamp > filters.endDate) return false;
            return true;
        });
    }, [transactions]);

    return {
        transactions,
        isLoading,
        error,
        refetch: fetchTransactions,
        filterTransactions,
        addSwapRecord,
    };
}

export function formatTransactionDate(date: Date): { date: string; time: string } {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    let dateStr: string;
    if (diffDays === 0) dateStr = 'Today';
    else if (diffDays === 1) dateStr = 'Yesterday';
    else if (diffDays < 7) dateStr = `${diffDays} days ago`;
    else dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return { date: dateStr, time: timeStr };
}
