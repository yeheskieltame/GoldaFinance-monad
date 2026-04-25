'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
    CONTRACT_ADDRESSES,
    CONTRACT_ABIS,
    RPC_URL,
} from '@/lib/services/contractService';
import {
    getSwapHistory,
    addSwapRecord,
    type SwapRecord,
} from '@/lib/services/swapHistory';

export interface Transaction {
    id: string;
    type: 'deposit' | 'withdraw_request' | 'claim' | 'swap';
    amount: number; // USDC equivalent
    shares?: number;
    withdrawalId?: number;
    timestamp: Date;
    txHash: string;
    status: 'completed' | 'pending' | 'failed';
    description: string;
    blockNumber: number;
    asset: 'usdc' | 'shares' | 'swap';
    // Swap-specific fields
    swapToSymbol?: string;
    swapToAmount?: number;
}

export interface TransactionFilters {
    type?: 'all' | 'deposit' | 'withdraw_request' | 'claim' | 'swap';
    startDate?: Date;
    endDate?: Date;
}

// Monad RPC limits eth_getLogs to 100-block ranges.
const LOG_CHUNK_SIZE = 99;

async function queryFilterChunked(
    contract: ethers.Contract,
    filter: ethers.DeferredTopicFilter,
    fromBlock: number,
    toBlock: number,
): Promise<ethers.Log[]> {
    const allLogs: ethers.Log[] = [];

    for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
        const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);
        try {
            const logs = await contract.queryFilter(filter, start, end);
            allLogs.push(...logs);
        } catch (err) {
            console.warn(`[TxHistory] log query chunk ${start}-${end} failed:`, err);
        }
        // Tiny delay to avoid rate-limiting
        await new Promise(r => setTimeout(r, 50));
    }

    return allLogs;
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
        blockNumber: 0, // not available for LiFi swaps
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
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const vault = new ethers.Contract(
                CONTRACT_ADDRESSES.GOLDA_VAULT,
                CONTRACT_ABIS.GOLDA_VAULT,
                provider
            );

            const txList: Transaction[] = [];
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 5_000);

            // Deposit(user, usdcIn, sharesOut)
            try {
                const filter = vault.filters.Deposit(walletAddress);
                const events = await queryFilterChunked(vault, filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const block = await ev.getBlock();
                    const usdcIn = Number(ethers.formatUnits(log.args.usdcIn ?? 0, 6));
                    const shares = Number(ethers.formatUnits(log.args.sharesOut ?? 0, 18));
                    txList.push({
                        id: `deposit-${ev.transactionHash}`,
                        type: 'deposit',
                        amount: usdcIn,
                        shares,
                        timestamp: new Date(block.timestamp * 1000),
                        txHash: ev.transactionHash,
                        status: 'completed',
                        description: `Deposited $${usdcIn.toFixed(2)} USDC`,
                        blockNumber: ev.blockNumber,
                        asset: 'usdc',
                    });
                }
            } catch (e) {
                console.error('Error fetching Deposit events:', e);
            }

            await new Promise(r => setTimeout(r, 100));

            // WithdrawRequested(user, id, shares, usdcOwed)
            try {
                const filter = vault.filters.WithdrawRequested(walletAddress);
                const events = await queryFilterChunked(vault, filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const block = await ev.getBlock();
                    const shares = Number(ethers.formatUnits(log.args.shares ?? 0, 18));
                    const owed = Number(ethers.formatUnits(log.args.usdcOwed ?? 0, 6));
                    const id = Number(log.args.id ?? 0);
                    txList.push({
                        id: `wreq-${ev.transactionHash}`,
                        type: 'withdraw_request',
                        amount: owed,
                        shares,
                        withdrawalId: id,
                        timestamp: new Date(block.timestamp * 1000),
                        txHash: ev.transactionHash,
                        status: 'completed',
                        description: `Requested withdraw of $${owed.toFixed(2)} USDC`,
                        blockNumber: ev.blockNumber,
                        asset: 'shares',
                    });
                }
            } catch (e) {
                console.error('Error fetching WithdrawRequested events:', e);
            }

            await new Promise(r => setTimeout(r, 100));

            // WithdrawClaimed(id, user, usdc)
            try {
                const filter = vault.filters.WithdrawClaimed(null, walletAddress);
                const events = await queryFilterChunked(vault, filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const block = await ev.getBlock();
                    const paid = Number(ethers.formatUnits(log.args.usdc ?? 0, 6));
                    const id = Number(log.args.id ?? 0);
                    txList.push({
                        id: `claim-${ev.transactionHash}`,
                        type: 'claim',
                        amount: paid,
                        withdrawalId: id,
                        timestamp: new Date(block.timestamp * 1000),
                        txHash: ev.transactionHash,
                        status: 'completed',
                        description: `Claimed $${paid.toFixed(2)} USDC`,
                        blockNumber: ev.blockNumber,
                        asset: 'usdc',
                    });
                }
            } catch (e) {
                console.error('Error fetching WithdrawClaimed events:', e);
            }

            // Add local swap history (LiFi swaps that bypass the vault)
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
