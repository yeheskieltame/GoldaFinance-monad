'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import {
    CONTRACT_ADDRESSES,
    CHAIN_ID,
    RPC_URL,
    EXPLORER_URL,
    SUPPORTED_ASSETS,
    getUserBalances,
    getUserWithdrawals,
    depositToVault,
    requestWithdrawFromVault,
    claimWithdrawal,
    approveUSDC,
    WithdrawalView,
} from '@/lib/services/contractService';
import { MONAD_MAINNET } from '@/lib/types';

// ============================================
// Types
// ============================================

export interface VaultBalances {
    usdc: number;
    shares: number;
    sharePrice: number;
    navUSDC: number;
    shareValueUSDC: number;
    usdcAllowance: number;
    xaut: number;
    wbtc: number;
}

export interface TransactionResult {
    success: boolean;
    txHash?: string;
    error?: string;
}

// ============================================
// Hook: useGoldaVault (default export alias: useAureoContract)
// ============================================

export function useGoldaVault() {
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();

    const [balances, setBalances] = useState<VaultBalances>({
        usdc: 0,
        shares: 0,
        sharePrice: 1,
        navUSDC: 0,
        shareValueUSDC: 0,
        usdcAllowance: 0,
        xaut: 0,
        wbtc: 0,
    });
    const [withdrawals, setWithdrawals] = useState<WithdrawalView[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const walletAddress = user?.wallet?.address;
    const activeWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];

    // ----------------------------------------
    // Fetch on-chain state
    // ----------------------------------------

    const fetchBalances = useCallback(async () => {
        if (!walletAddress) return;
        setIsLoading(true);
        setError(null);
        try {
            const [bal, wds] = await Promise.all([
                getUserBalances(walletAddress),
                getUserWithdrawals(walletAddress),
            ]);
            setBalances(bal);
            setWithdrawals(wds);
        } catch (err) {
            console.error('Error fetching vault state:', err);
            setError('Failed to fetch vault state');
        } finally {
            setIsLoading(false);
        }
    }, [walletAddress]);

    useEffect(() => {
        if (ready && authenticated && walletAddress) {
            fetchBalances();
        }
    }, [ready, authenticated, walletAddress, fetchBalances]);

    // ----------------------------------------
    // Signer (Privy -> ethers) with chain switch
    // ----------------------------------------

    const getSigner = useCallback(async (): Promise<ethers.Signer> => {
        if (!activeWallet) throw new Error('No wallet connected');

        const provider = await activeWallet.getEthereumProvider();
        const chainIdHex = `0x${CHAIN_ID.toString(16)}`;

        try {
            const currentChainId = await provider.request({ method: 'eth_chainId' });
            if (currentChainId !== chainIdHex) {
                try {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: chainIdHex }],
                    });
                } catch (switchError: unknown) {
                    const code = (switchError as { code?: number })?.code;
                    if (code === 4902) {
                        await provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: chainIdHex,
                                chainName: MONAD_MAINNET.name,
                                nativeCurrency: MONAD_MAINNET.nativeCurrency,
                                rpcUrls: [RPC_URL],
                                blockExplorerUrls: [EXPLORER_URL],
                            }],
                        });
                    } else {
                        throw switchError;
                    }
                }
            }
        } catch (err) {
            console.warn('Chain switch warning:', err);
        }

        return new ethers.BrowserProvider(provider).getSigner();
    }, [activeWallet]);

    // ----------------------------------------
    // Actions
    // ----------------------------------------

    const deposit = useCallback(async (usdcAmount: number): Promise<TransactionResult> => {
        try {
            setIsLoading(true);
            setError(null);
            const signer = await getSigner();
            const { txHash } = await depositToVault(signer, usdcAmount);
            await fetchBalances();
            return { success: true, txHash };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Deposit failed';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setIsLoading(false);
        }
    }, [getSigner, fetchBalances]);

    const requestWithdraw = useCallback(async (shareAmount: number): Promise<TransactionResult> => {
        try {
            setIsLoading(true);
            setError(null);
            const signer = await getSigner();
            const { txHash } = await requestWithdrawFromVault(signer, shareAmount);
            await fetchBalances();
            return { success: true, txHash };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Withdraw request failed';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setIsLoading(false);
        }
    }, [getSigner, fetchBalances]);

    const claim = useCallback(async (id: number): Promise<TransactionResult> => {
        try {
            setIsLoading(true);
            setError(null);
            const signer = await getSigner();
            const { txHash } = await claimWithdrawal(signer, id);
            await fetchBalances();
            return { success: true, txHash };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Claim failed';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setIsLoading(false);
        }
    }, [getSigner, fetchBalances]);

    const approve = useCallback(async (usdcAmount: number): Promise<TransactionResult> => {
        try {
            setIsLoading(true);
            setError(null);
            const signer = await getSigner();
            const { txHash } = await approveUSDC(signer, usdcAmount);
            await fetchBalances();
            return { success: true, txHash };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Approve failed';
            setError(msg);
            return { success: false, error: msg };
        } finally {
            setIsLoading(false);
        }
    }, [getSigner, fetchBalances]);

    return {
        // State
        balances,
        withdrawals,
        isLoading,
        error,
        walletAddress,
        isConnected: ready && authenticated && !!walletAddress,

        // Actions
        fetchBalances,
        deposit,
        requestWithdraw,
        claim,
        approve,
        getSigner,

        // Contract info
        contractAddresses: CONTRACT_ADDRESSES,
        supportedAssets: SUPPORTED_ASSETS,
        explorerUrl: EXPLORER_URL,
        chainId: CHAIN_ID,
    };
}

// Legacy name kept so existing imports don't break.
export const useAureoContract = useGoldaVault;
