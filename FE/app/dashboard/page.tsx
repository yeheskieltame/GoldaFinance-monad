'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { MobileLayout } from '@/components/mobile-layout';
import { WalletCard } from '@/components/wallet-card';
import { NetworkPanel } from '@/components/network-panel';
import { DepositDialog } from '@/components/deposit-dialog';
import { WithdrawDialog } from '@/components/withdraw-dialog';
import { DashboardSkeleton, Skeleton } from '@/components/skeleton';
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
            <MobileLayout activeTab="home">
                <DashboardSkeleton />
            </MobileLayout>
        );
    }

    const getTxIcon = (type: string) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return <ArrowDownLeft className="w-5 h-5 text-[var(--success)]" />;
            case 'withdraw_request':
                return <ArrowUpRight className="w-5 h-5 text-[var(--warning)]" />;
            case 'swap':
                return <Sparkles className="w-5 h-5 text-[var(--info)]" />;
            default:
                return <Sparkles className="w-5 h-5 text-[var(--accent)]" />;
        }
    };

    const getTxBg = (type: string) => {
        switch (type) {
            case 'deposit':
            case 'claim':
                return 'bg-success-soft';
            case 'withdraw_request':
                return 'bg-warning-soft';
            case 'swap':
                return 'bg-info-soft';
            default:
                return 'bg-destructive-soft';
        }
    };

    const pendingWithdrawals = withdrawals.filter(w => !w.settled);

    // Recent Activity card — shared between mobile main column and desktop rail.
    // The loading skeleton mirrors the exact row layout (same container,
    // same `divide-y`, same `p-4` rows) so the card height is stable when
    // data arrives — no scroll jump.
    const recentActivityCard = (
        <div className="ios-list">
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <h3 className="text-headline">Recent Activity</h3>
                    {!txLoading && transactions.length > 0 && (
                        <span className="chip chip-info">
                            {transactions.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => router.push('/dashboard/history')}
                    className="btn-haptic text-subhead font-semibold flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                    See All
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="divide-y divide-border">
                {txLoading ? (
                    // 3 rows × ~72px ≈ 216px — keeps the rail card close in
                    // height to the empty state (~240px) so the desktop rail
                    // (which has its own max-height + overflow) doesn't gain
                    // an internal scrollbar that disappears once data loads.
                    Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="p-4 flex items-center gap-3"
                            aria-hidden
                        >
                            <Skeleton
                                className="w-10 h-10 shrink-0"
                                rounded="xl"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <Skeleton className="h-4 w-40" rounded="md" />
                                <Skeleton className="h-3 w-24" rounded="md" />
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <Skeleton className="h-4 w-16" rounded="md" />
                                <Skeleton className="h-3 w-10" rounded="md" />
                            </div>
                        </div>
                    ))
                ) : transactions.length > 0 ? (
                    transactions.slice(0, 3).map((tx) => {
                        const { time, date } = formatTransactionDate(tx.timestamp);
                        const isInflow = tx.type === 'deposit' || tx.type === 'claim';
                        return (
                            <a
                                key={tx.id}
                                href={`${explorerUrl}/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group p-4 flex items-center gap-3 transition-colors hover:bg-surface focus-visible:bg-surface outline-none"
                            >
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-border ${getTxBg(tx.type)}`}
                                >
                                    {getTxIcon(tx.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-headline truncate">
                                        {tx.description}
                                    </p>
                                    <p className="text-footnote text-muted-foreground">
                                        {date} · {time}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p
                                        className={`text-subhead font-semibold font-num ${
                                            isInflow
                                                ? 'text-[var(--success)]'
                                                : 'text-foreground'
                                        }`}
                                    >
                                        {isInflow ? '+' : ''}${tx.amount.toFixed(2)}
                                    </p>
                                    <p className="text-caption text-muted-foreground flex items-center gap-1 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                                        View <ExternalLink className="w-3 h-3" />
                                    </p>
                                </div>
                            </a>
                        );
                    })
                ) : (
                    // py-12 + w-14 icon ≈ 215px — sized to match the 3-row
                    // skeleton above so the card height stays stable when
                    // loading completes with no transactions.
                    <div className="px-6 py-12 text-center">
                        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-surface flex items-center justify-center ring-1 ring-border">
                            <Sparkles className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="text-subhead text-foreground font-semibold">
                            No activity yet
                        </p>
                        <p className="text-footnote text-muted-foreground mt-1.5">
                            Deposit USDC to get started
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    // Right rail (md+ — sidebar on desktop, stacked-below-main on tablet).
    const desktopRail = (
        <div className="space-y-4 stagger-in">
            <div className="ios-card-elev p-5">
                <p className="section-label mb-2">Vault NAV</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-large-title font-num">
                        ${balances.navUSDC.toFixed(2)}
                    </span>
                    <span className="chip chip-success">
                        <TrendingUp className="w-3 h-3" /> Live
                    </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                        <p className="section-label">Share Price</p>
                        <p className="text-title-3 font-num">
                            ${balances.sharePrice.toFixed(4)}
                        </p>
                    </div>
                    <div>
                        <p className="section-label">Your Shares</p>
                        <p className="text-title-3 font-num">
                            {balances.shares.toFixed(4)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Your Assets — backing breakdown */}
            <div className="ios-card-elev p-5">
                <p className="section-label mb-3">Your Assets</p>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-[var(--electric-purple)]/15 text-[var(--electric-purple)] flex items-center justify-center text-sm">
                                Au
                            </span>
                            <span className="text-subhead">XAUt0</span>
                        </div>
                        <span className="text-title-3 font-num">{balances.xaut.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-[var(--pale-lilac)]/12 text-foreground flex items-center justify-center text-sm font-semibold">
                                ₿
                            </span>
                            <span className="text-subhead">WBTC</span>
                        </div>
                        <span className="text-title-3 font-num">{balances.wbtc.toFixed(8)}</span>
                    </div>
                </div>
            </div>

            <NetworkPanel
                vaultAddress={contractAddresses.GOLDA_VAULT}
                usdcAddress={contractAddresses.USDC}
                walletAddress={walletAddress}
                explorerBaseUrl={explorerUrl}
            />

            {recentActivityCard}
        </div>
    );

    return (
        <MobileLayout activeTab="home" rail={desktopRail}>
            {/* Notification Toast */}
            {notification && (
                <div
                    className={`toast-ios ${
                        notification.type === 'success'
                            ? 'bg-[var(--success)] text-white'
                            : notification.type === 'error'
                              ? 'bg-[var(--destructive)] text-white'
                              : 'bg-foreground text-background'
                    }`}
                >
                    {notification.type === 'success' && (
                        <CheckCircle2 className="w-5 h-5" />
                    )}
                    {notification.type === 'error' && (
                        <AlertCircle className="w-5 h-5" />
                    )}
                    <p className="flex-1">{notification.message}</p>
                </div>
            )}

            {/* Header */}
            <div className="px-4 md:px-0 pt-safe md:pt-0 pb-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="section-label">Welcome back</p>
                        <h1 className="text-title-1">
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
                            className="btn-haptic p-2.5 rounded-full bg-surface hover:bg-surface-2 transition-colors"
                            aria-label="Refresh"
                        >
                            <RefreshCw
                                className={`w-5 h-5 text-foreground ${contractLoading ? 'animate-spin' : ''}`}
                            />
                        </button>
                        <button
                            className="btn-haptic p-2.5 rounded-full bg-surface hover:bg-surface-2 transition-colors"
                            aria-label="Notifications"
                        >
                            <Bell className="w-5 h-5 text-foreground" />
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/profile')}
                            className="btn-haptic p-2.5 rounded-full bg-surface hover:bg-surface-2 transition-colors"
                            aria-label="Settings"
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
                    variant="ink"
                />
            </div>

            <div className="px-4 md:px-0 space-y-6 animate-fade-in">
                {contractError && (
                    <div className="ios-card p-4 flex items-center gap-3 text-[var(--destructive)] bg-destructive-soft">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-subhead">{contractError}</p>
                    </div>
                )}

                {/* Asset selector */}
                <div className="ios-card-elev p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-headline">Savings Asset</h3>
                            <p className="text-footnote text-muted-foreground">
                                Operator routes your USDC into this asset
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {(
                            [
                                { id: 'XAUT', label: 'XAUt0', desc: 'Tether Gold' },
                                { id: 'WBTC', label: 'BTC', desc: 'Wrapped BTC' },
                            ] as const
                        ).map((opt) => {
                            const active = selectedAsset === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => persistAsset(opt.id)}
                                    className={`btn-haptic rounded-xl border p-3 text-left transition-colors ${
                                        active
                                            ? 'border-foreground bg-foreground text-background'
                                            : 'border-border hover:bg-surface'
                                    }`}
                                >
                                    <p className="text-subhead font-semibold">
                                        {opt.label}
                                    </p>
                                    <p
                                        className={`text-footnote ${
                                            active
                                                ? 'text-background/70'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {opt.desc}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Portfolio Summary — visible on mobile only (desktop uses rail) */}
                <div className="grid grid-cols-2 gap-3 lg:hidden">
                    <div className="ios-card p-4">
                        <p className="section-label mb-1">Vault Shares</p>
                        <p className="text-title-2 font-num">
                            {balances.shares.toFixed(4)}
                        </p>
                        <p className="text-footnote text-[var(--success)]">
                            ≈ ${balances.shareValueUSDC.toFixed(2)}
                        </p>
                    </div>
                    <div className="ios-card p-4">
                        <p className="section-label mb-1">USDC Balance</p>
                        <p className="text-title-2 font-num">
                            ${balances.usdc.toFixed(2)}
                        </p>
                        <p className="text-footnote text-muted-foreground">
                            Liquid cash
                        </p>
                    </div>
                </div>

                {/* Asset Balances — XAUT & WBTC.
                    Hidden on desktop (lg+) because the right rail already
                    shows the same breakdown — avoids duplicate "Your Assets"
                    cards visible side-by-side. */}
                <div className="ios-card-elev p-4 lg:hidden">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-headline">Your Assets</h3>
                            <p className="text-footnote text-muted-foreground">
                                Direct wallet balances on Monad
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="ios-card p-3 bg-gradient-to-br from-yellow-500/10 to-amber-500/5">
                            <p className="section-label mb-1 flex items-center gap-1">
                                <span className="text-yellow-500">🥇</span> XAUt0
                            </p>
                            <p className="text-title-2 font-num">
                                {balances.xaut.toFixed(6)}
                            </p>
                            <p className="text-footnote text-muted-foreground">
                                Tether Gold
                            </p>
                        </div>
                        <div className="ios-card p-3 bg-gradient-to-br from-orange-500/10 to-red-500/5">
                            <p className="section-label mb-1 flex items-center gap-1">
                                <span className="text-orange-500">₿</span> WBTC
                            </p>
                            <p className="text-title-2 font-num">
                                {balances.wbtc.toFixed(8)}
                            </p>
                            <p className="text-footnote text-muted-foreground">
                                Wrapped Bitcoin
                            </p>
                        </div>
                    </div>
                </div>

                {/* Vault NAV & share price — mobile only (desktop uses rail) */}
                <div className="ios-card-elev p-4 lg:hidden">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-headline">Vault NAV</h3>
                        <span className="chip chip-success">
                            <TrendingUp className="w-3 h-3" /> Live
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="section-label">Total NAV</p>
                            <p className="text-title-3 font-num">
                                ${balances.navUSDC.toFixed(2)}
                            </p>
                        </div>
                        <div>
                            <p className="section-label">Share price</p>
                            <p className="text-title-3 font-num">
                                ${balances.sharePrice.toFixed(4)}
                            </p>
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
                            className="action-pill primary w-full !h-14"
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
                            className="action-pill w-full !h-14"
                        >
                            <TrendingUp className="w-5 h-5 mr-2" />
                            Withdraw
                        </Button>
                    </WithdrawDialog>
                </div>

                {/* Pending withdrawals / claims */}
                {withdrawals.length > 0 && (
                    <div className="ios-list">
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div>
                                <h3 className="text-headline">Withdrawal Queue</h3>
                                <p className="text-footnote text-muted-foreground">
                                    {pendingWithdrawals.length} pending,{' '}
                                    {withdrawals.length - pendingWithdrawals.length} settled
                                </p>
                            </div>
                            <Hourglass className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="divide-y divide-border max-h-64 overflow-y-auto">
                            {withdrawals.map((w) => (
                                <div key={w.id} className="p-4 flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                            w.settled
                                                ? 'bg-surface-2'
                                                : w.claimable
                                                  ? 'bg-success-soft'
                                                  : 'bg-warning-soft'
                                        }`}
                                    >
                                        {w.settled ? (
                                            <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                                        ) : w.claimable ? (
                                            <ArrowDownLeft className="w-5 h-5 text-[var(--success)]" />
                                        ) : (
                                            <Hourglass className="w-5 h-5 text-[var(--warning)]" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-headline">
                                            #{w.id} · ${w.usdcOwed.toFixed(2)} USDC
                                        </p>
                                        <p className="text-footnote text-muted-foreground">
                                            {w.settled
                                                ? 'Settled'
                                                : w.claimable
                                                  ? 'Ready to claim'
                                                  : 'Waiting for liquidity'}
                                        </p>
                                    </div>
                                    {!w.settled && (
                                        <Button
                                            onClick={() => handleClaim(w.id)}
                                            disabled={!w.claimable || claimingId === w.id}
                                            size="sm"
                                            className="rounded-full"
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

                {/* Mobile-only: Network panel, then Recent Activity below it.
                    On md+ both live in the right rail to keep the columns balanced. */}
                <div className="md:hidden">
                    <NetworkPanel
                        vaultAddress={contractAddresses.GOLDA_VAULT}
                        usdcAddress={contractAddresses.USDC}
                        walletAddress={walletAddress}
                        explorerBaseUrl={explorerUrl}
                    />
                </div>

                <div className="md:hidden">
                    {recentActivityCard}
                </div>
            </div>
        </MobileLayout>
    );
}
