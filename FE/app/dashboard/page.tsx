'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { MobileLayout } from '@/components/mobile-layout';
import { WalletCard } from '@/components/wallet-card';
import { QuickActions } from '@/components/quick-actions';
import { DepositDialog } from '@/components/deposit-dialog';
import { WithdrawDialog } from '@/components/withdraw-dialog';
import { useGoldaVault } from '@/lib/hooks/useAureoContract';
import { useTransactionHistory, formatTransactionDate } from '@/lib/hooks/useTransactionHistory';
import type { SavingsAssetId } from '@/lib/types';
import {
    Bell,
    Settings,
    TrendingUp,
    Sparkles,
    ArrowUpRight,
    ArrowDownLeft,
    ChevronRight,
    Loader2,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    ExternalLink,
    Coins,
    Hourglass,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
    const { ready, authenticated, user } = usePrivy();
    const router = useRouter();

    const {
        balances,
        withdrawals,
        isLoading: contractLoading,
        error: contractError,
        isConnected,
        walletAddress,
        fetchBalances,
        deposit,
        requestWithdraw,
        claim,
        contractAddresses,
        explorerUrl,
    } = useGoldaVault();

    const {
        transactions,
        isLoading: txLoading,
        refetch: refetchTx,
    } = useTransactionHistory(walletAddress);

    const [isProcessing, setIsProcessing] = useState(false);
    const [notification, setNotification] = useState<{
        type: 'success' | 'error' | 'info';
        message: string;
    } | null>(null);
    const [selectedAsset, setSelectedAsset] = useState<SavingsAssetId>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('golda_asset') as SavingsAssetId) || 'XAUT';
        }
        return 'XAUT';
    });
    const [claimingId, setClaimingId] = useState<number | null>(null);

    useEffect(() => {
        if (ready && !authenticated) router.push('/');
    }, [ready, authenticated, router]);

    useEffect(() => {
        if (notification) {
            const t = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(t);
        }
    }, [notification]);

    const persistAsset = (asset: SavingsAssetId) => {
        setSelectedAsset(asset);
        if (typeof window !== 'undefined') localStorage.setItem('golda_asset', asset);
    };

    const handleDeposit = async (amount: number, asset: SavingsAssetId) => {
        setIsProcessing(true);
        persistAsset(asset);
        try {
            // Asset preference is persisted locally; the operator reads it off-chain
            // to route USDC via LiFi. The on-chain deposit is asset-agnostic.
            await fetch('/api/deposits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress,
                    amount,
                    asset,
                }),
            }).catch(() => null); // non-blocking

            const result = await deposit(amount);
            if (result.success) {
                setNotification({
                    type: 'success',
                    message: `Deposited $${amount.toFixed(2)} USDC. Routing into ${asset}.`,
                });
                await refetchTx();
            } else {
                setNotification({ type: 'error', message: result.error || 'Deposit failed' });
            }
        } catch (err) {
            console.error('Deposit error:', err);
            setNotification({ type: 'error', message: 'Deposit failed' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRequestWithdraw = async (shareAmount: number) => {
        setIsProcessing(true);
        try {
            const result = await requestWithdraw(shareAmount);
            if (result.success) {
                setNotification({
                    type: 'success',
                    message: `Requested withdraw of ${shareAmount.toFixed(4)} gUSDC`,
                });
                await refetchTx();
            } else {
                setNotification({ type: 'error', message: result.error || 'Withdraw failed' });
            }
        } catch (err) {
            console.error('Withdraw error:', err);
            setNotification({ type: 'error', message: 'Withdraw failed' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClaim = async (id: number) => {
        setClaimingId(id);
        try {
            const result = await claim(id);
            if (result.success) {
                setNotification({ type: 'success', message: `Claimed withdrawal #${id}` });
                await refetchTx();
            } else {
                setNotification({ type: 'error', message: result.error || 'Claim failed' });
            }
        } finally {
            setClaimingId(null);
        }
    };

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    const getTxIcon = (type: string) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return <ArrowDownLeft className="w-5 h-5 text-green-500" />;
            case 'withdraw_request':
                return <ArrowUpRight className="w-5 h-5 text-orange-500" />;
            case 'swap':
                return <Sparkles className="w-5 h-5 text-blue-500" />;
            default:
                return <Sparkles className="w-5 h-5 text-amber-500" />;
        }
    };

    const getTxBg = (type: string) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return 'bg-green-100 dark:bg-green-500/20';
            case 'withdraw_request':
                return 'bg-orange-100 dark:bg-orange-500/20';
            case 'swap':
                return 'bg-blue-100 dark:bg-blue-500/20';
            default:
                return 'bg-amber-100 dark:bg-amber-500/20';
        }
    };

    const pendingWithdrawals = withdrawals.filter(w => !w.settled);

    return (
        <MobileLayout activeTab="home">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in ${
                    notification.type === 'success'
                        ? 'bg-green-500 text-white'
                        : notification.type === 'error'
                          ? 'bg-red-500 text-white'
                          : 'bg-blue-500 text-white'
                }`}>
                    {notification.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
                    {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
                    <p className="text-sm font-medium flex-1">{notification.message}</p>
                </div>
            )}

            {/* Header */}
            <div className="bg-gradient-to-b from-primary/5 to-background px-4 pt-12 pb-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="text-muted-foreground text-sm">Welcome back 👋</p>
                        <h1 className="text-xl font-bold text-foreground">
                            {user?.email?.address?.split('@')[0] || 'User'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                fetchBalances();
                                refetchTx();
                            }}
                            disabled={contractLoading}
                            className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors"
                        >
                            <RefreshCw className={`w-5 h-5 text-foreground ${contractLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors relative">
                            <Bell className="w-5 h-5 text-foreground" />
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/profile')}
                            className="p-2.5 rounded-xl bg-muted hover:bg-secondary transition-colors"
                        >
                            <Settings className="w-5 h-5 text-foreground" />
                        </button>
                    </div>
                </div>

                <WalletCard
                    usdcBalance={balances.usdc}
                    shares={balances.shares}
                    sharePrice={balances.sharePrice}
                    assetLabel={selectedAsset}
                    walletAddress={walletAddress}
                    variant="gold"
                />
            </div>

            <div className="px-4 space-y-6 animate-fade-in">
                {contractError && (
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 flex items-center gap-3 text-red-600 dark:text-red-400">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{contractError}</p>
                    </div>
                )}

                {/* Asset selector */}
                <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="font-semibold">Savings Asset</h3>
                            <p className="text-xs text-muted-foreground">
                                Operator routes your USDC into this asset
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {(
                            [
                                { id: 'PAXG', label: 'PAXG', desc: 'Paxos Gold' },
                                { id: 'XAUT', label: 'XAUt0', desc: 'Tether Gold' },
                                { id: 'WBTC', label: 'BTC', desc: 'Wrapped BTC' },
                            ] as const
                        ).map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => persistAsset(opt.id)}
                                className={`rounded-xl border p-3 text-left transition-colors ${
                                    selectedAsset === opt.id
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border hover:bg-muted'
                                }`}
                            >
                                <p className="font-semibold text-sm">{opt.label}</p>
                                <p className="text-xs text-muted-foreground">{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
                    <QuickActions />
                </div>

                {/* Portfolio Summary */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-card rounded-2xl p-4 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Vault Shares</p>
                        <p className="text-xl font-bold text-foreground">{balances.shares.toFixed(4)}</p>
                        <p className="text-sm text-green-500">≈ ${balances.shareValueUSDC.toFixed(2)}</p>
                    </div>
                    <div className="bg-card rounded-2xl p-4 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">USDC Balance</p>
                        <p className="text-xl font-bold text-foreground">${balances.usdc.toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">Liquid cash</p>
                    </div>
                </div>

                {/* Vault NAV & share price */}
                <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">Vault NAV</h3>
                        <div className="flex items-center gap-1 text-green-500 bg-green-100 dark:bg-green-500/20 px-2 py-1 rounded-lg">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-medium">Live</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-xs text-muted-foreground">Total NAV</p>
                            <p className="text-xl font-bold">${balances.navUSDC.toFixed(2)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Share price</p>
                            <p className="text-xl font-bold">${balances.sharePrice.toFixed(4)}</p>
                        </div>
                    </div>
                </div>

                {/* Deposit / Withdraw buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <DepositDialog
                        onDeposit={handleDeposit}
                        usdcBalance={balances.usdc}
                        sharePrice={balances.sharePrice}
                        selectedAsset={selectedAsset}
                        onAssetChange={persistAsset}
                        isLoading={isProcessing}
                    >
                        <Button
                            disabled={isProcessing || !isConnected}
                            className="w-full py-6 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20"
                        >
                            <Coins className="w-5 h-5 mr-2" />
                            Deposit
                        </Button>
                    </DepositDialog>

                    <WithdrawDialog
                        shares={balances.shares}
                        sharePrice={balances.sharePrice}
                        onRequest={handleRequestWithdraw}
                        isLoading={isProcessing}
                    >
                        <Button
                            disabled={isProcessing || !isConnected || balances.shares <= 0}
                            variant="outline"
                            className="w-full py-6 rounded-2xl border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        >
                            <TrendingUp className="w-5 h-5 mr-2" />
                            Withdraw
                        </Button>
                    </WithdrawDialog>
                </div>

                {/* Pending withdrawals / claims */}
                {withdrawals.length > 0 && (
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div>
                                <h3 className="font-semibold">Withdrawal Queue</h3>
                                <p className="text-xs text-muted-foreground">
                                    {pendingWithdrawals.length} pending, {withdrawals.length - pendingWithdrawals.length} settled
                                </p>
                            </div>
                            <Hourglass className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="divide-y divide-border max-h-64 overflow-y-auto">
                            {withdrawals.map((w) => (
                                <div key={w.id} className="p-4 flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        w.settled
                                            ? 'bg-gray-100 dark:bg-gray-800'
                                            : w.claimable
                                                ? 'bg-green-100 dark:bg-green-500/20'
                                                : 'bg-amber-100 dark:bg-amber-500/20'
                                    }`}>
                                        {w.settled
                                            ? <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                                            : w.claimable
                                                ? <ArrowDownLeft className="w-5 h-5 text-green-500" />
                                                : <Hourglass className="w-5 h-5 text-amber-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium">#{w.id} · ${w.usdcOwed.toFixed(2)} USDC</p>
                                        <p className="text-xs text-muted-foreground">
                                            {w.settled ? 'Settled' : w.claimable ? 'Ready to claim' : 'Waiting for liquidity'}
                                        </p>
                                    </div>
                                    {!w.settled && (
                                        <Button
                                            onClick={() => handleClaim(w.id)}
                                            disabled={!w.claimable || claimingId === w.id}
                                            size="sm"
                                            className="rounded-xl"
                                        >
                                            {claimingId === w.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                'Claim'
                                            )}
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Transactions */}
                <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <h3 className="font-semibold text-foreground">Recent Activity</h3>
                        <button
                            onClick={() => router.push('/dashboard/history')}
                            className="text-sm text-primary font-medium flex items-center gap-1"
                        >
                            See All
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="divide-y divide-border">
                        {txLoading ? (
                            <div className="p-8 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                            </div>
                        ) : transactions.length > 0 ? (
                            transactions.slice(0, 4).map((tx) => {
                                const { time } = formatTransactionDate(tx.timestamp);
                                return (
                                    <div key={tx.id} className="p-4 flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getTxBg(tx.type)}`}>
                                            {getTxIcon(tx.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-foreground truncate">{tx.description}</p>
                                            <p className="text-sm text-muted-foreground">{time}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-semibold ${
                                                tx.type === 'deposit' || tx.type === 'claim'
                                                    ? 'text-green-500'
                                                    : 'text-foreground'
                                            }`}>
                                                ${tx.amount.toFixed(2)}
                                            </p>
                                            <a
                                                href={`${explorerUrl}/tx/${tx.txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 justify-end"
                                            >
                                                View <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center">
                                <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                <p className="text-muted-foreground text-sm">No activity yet</p>
                                <p className="text-xs text-muted-foreground mt-1">Deposit USDC to get started!</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Contract Info */}
                <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-medium">Network: Monad Testnet</p>
                    <p className="font-mono truncate">Vault: {contractAddresses.GOLDA_VAULT}</p>
                    <p className="font-mono truncate">USDC: {contractAddresses.USDC}</p>
                    <p className="font-mono truncate">Wallet: {walletAddress || 'Not connected'}</p>
                </div>
            </div>
        </MobileLayout>
    );
}
