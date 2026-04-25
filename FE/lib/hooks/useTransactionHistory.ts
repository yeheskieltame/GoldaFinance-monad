'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
    CONTRACT_ADDRESSES,
    CONTRACT_ABIS,
    RPC_URL,
} from '@/lib/services/contractService';

export interface Transaction {
    id: string;
    type: 'deposit' | 'withdraw_request' | 'claim' | 'transfer_in' | 'transfer_out';
    amount: number; // USDC
    shares?: number;
    withdrawalId?: number;
    timestamp: Date;
    txHash: string;
    status: 'completed';
    description: string;
    blockNumber: number;
    asset: 'usdc' | 'shares';
}

export interface TransactionFilters {
    type?: 'all' | 'deposit' | 'withdraw_request' | 'claim' | 'transfer';
    startDate?: Date;
    endDate?: Date;
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
            const usdc = new ethers.Contract(
                CONTRACT_ADDRESSES.USDC,
                CONTRACT_ABIS.USDC,
                provider
            );

            const txList: Transaction[] = [];
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 100_000);

            const usdcDec = Number(await usdc.decimals().catch(() => 6));

            // Deposit(user, usdcIn, sharesOut)
            try {
                const filter = vault.filters.Deposit(walletAddress);
                const events = await vault.queryFilter(filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const block = await ev.getBlock();
                    const usdcIn = Number(ethers.formatUnits(log.args.usdcIn ?? 0, usdcDec));
                    const shares = Number(ethers.formatUnits(log.args.sharesOut ?? 0, 6));
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

            // WithdrawRequested(user, id, shares, usdcOwed)
            try {
                const filter = vault.filters.WithdrawRequested(walletAddress);
                const events = await vault.queryFilter(filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const block = await ev.getBlock();
                    const shares = Number(ethers.formatUnits(log.args.shares ?? 0, 6));
                    const owed = Number(ethers.formatUnits(log.args.usdcOwed ?? 0, usdcDec));
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

            // WithdrawClaimed(id, user, usdc)
            try {
                const filter = vault.filters.WithdrawClaimed(null, walletAddress);
                const events = await vault.queryFilter(filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const block = await ev.getBlock();
                    const paid = Number(ethers.formatUnits(log.args.usdc ?? 0, usdcDec));
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

            // USDC Transfers (external — filter out vault interactions already covered)
            const vaultAddr = CONTRACT_ADDRESSES.GOLDA_VAULT.toLowerCase();

            try {
                const filter = usdc.filters.Transfer(null, walletAddress);
                const events = await usdc.queryFilter(filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const from = (log.args.from as string).toLowerCase();
                    if (from === vaultAddr || from === ethers.ZeroAddress.toLowerCase()) continue;
                    const block = await ev.getBlock();
                    const value = Number(ethers.formatUnits(log.args.value ?? 0, usdcDec));
                    txList.push({
                        id: `usdc-in-${ev.transactionHash}`,
                        type: 'transfer_in',
                        amount: value,
                        timestamp: new Date(block.timestamp * 1000),
                        txHash: ev.transactionHash,
                        status: 'completed',
                        description: `Received $${value.toFixed(2)} USDC from ${(log.args.from as string).slice(0, 6)}...${(log.args.from as string).slice(-4)}`,
                        blockNumber: ev.blockNumber,
                        asset: 'usdc',
                    });
                }
            } catch (e) {
                console.error('Error fetching USDC Transfer In events:', e);
            }

            try {
                const filter = usdc.filters.Transfer(walletAddress, null);
                const events = await usdc.queryFilter(filter, fromBlock, currentBlock);
                for (const ev of events) {
                    const log = ev as ethers.EventLog;
                    if (!log.args) continue;
                    const to = (log.args.to as string).toLowerCase();
                    if (to === vaultAddr || to === ethers.ZeroAddress.toLowerCase()) continue;
                    const block = await ev.getBlock();
                    const value = Number(ethers.formatUnits(log.args.value ?? 0, usdcDec));
                    txList.push({
                        id: `usdc-out-${ev.transactionHash}`,
                        type: 'transfer_out',
                        amount: value,
                        timestamp: new Date(block.timestamp * 1000),
                        txHash: ev.transactionHash,
                        status: 'completed',
                        description: `Sent $${value.toFixed(2)} USDC to ${(log.args.to as string).slice(0, 6)}...${(log.args.to as string).slice(-4)}`,
                        blockNumber: ev.blockNumber,
                        asset: 'usdc',
                    });
                }
            } catch (e) {
                console.error('Error fetching USDC Transfer Out events:', e);
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
                if (filters.type === 'transfer') {
                    if (tx.type !== 'transfer_in' && tx.type !== 'transfer_out') return false;
                } else if (tx.type !== filters.type) return false;
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
