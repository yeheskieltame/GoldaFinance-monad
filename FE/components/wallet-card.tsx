'use client';

import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface WalletCardProps {
    usdcBalance: number;
    shares: number;
    sharePrice: number;
    assetLabel?: string;
    walletAddress?: string;
    /**
     * Visual variant.
     * - `ink`  (default): editorial near-black gradient with electric-purple highlight.
     * - `red`: brand-accent purple gradient — use for hero/CTA contexts.
     * - `gold`: legacy lilac gradient — kept for asset-detail screens.
     */
    variant?: 'ink' | 'red' | 'gold';
}

export function WalletCard({
    usdcBalance: _usdcBalance,
    shares,
    sharePrice,
    assetLabel = 'XAUt0',
    walletAddress,
    variant = 'ink',
}: WalletCardProps) {
    const [showBalance, setShowBalance] = useState(true);
    const [copied, setCopied] = useState(false);

    void _usdcBalance; // shown in dashboard portfolio grid, not on the card chrome
    const shareValue = shares * sharePrice;

    const copyAddress = async () => {
        if (!walletAddress) return;
        await navigator.clipboard.writeText(walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    /** Format a wallet address as a credit-card-style PAN: `0x12 •••• •••• 3a4b`. */
    const formatPan = (address?: string) => {
        if (!address) return '0x•• •••• •••• ••••';
        const head = address.slice(0, 4); // "0x12"
        const tail = address.slice(-4);   // last 4
        return `${head} •••• •••• ${tail}`;
    };

    const formatMoney = (n: number) =>
        n.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    return (
        <div className={`vault-card bank-card ${variant} text-white`}>
            <span className="bank-shine" aria-hidden />

            {/* Top row — chip + brand wordmark */}
            <div className="relative z-10 flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="bank-chip" aria-hidden />
                    <span className="bank-asset">
                        <span className="opacity-70">backed by</span>
                        <span>{assetLabel}</span>
                    </span>
                </div>
                <div className="text-right">
                    <p className="bank-brand">Golda</p>
                    <p className="bank-brand-sub">savings vault</p>
                </div>
            </div>

            {/* Middle — hero balance */}
            <div className="relative z-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 mb-1">
                    Savings Value
                </p>
                <div className="flex items-baseline gap-3">
                    <p className="text-large-title md:text-display font-num leading-none">
                        {showBalance ? `$${formatMoney(shareValue)}` : '•• ••• ••'}
                    </p>
                </div>
                <p className="text-footnote text-white/65 mt-2">
                    {showBalance ? `${shares.toFixed(4)} gUSDC` : '••••'}
                    <span className="mx-1.5 opacity-50">·</span>
                    <span className="opacity-80">backed by {assetLabel}</span>
                </p>
            </div>

            {/* Bottom — PAN + actions + network */}
            <div className="relative z-10 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="bank-pan truncate">
                        {showBalance ? formatPan(walletAddress) : '•••• •••• •••• ••••'}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={() => setShowBalance(!showBalance)}
                            className="btn-haptic p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                            aria-label={showBalance ? 'Hide balance' : 'Show balance'}
                        >
                            {showBalance ? (
                                <Eye className="w-4 h-4" />
                            ) : (
                                <EyeOff className="w-4 h-4" />
                            )}
                        </button>
                        {walletAddress && (
                            <button
                                onClick={copyAddress}
                                className="btn-haptic p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                aria-label="Copy wallet address"
                            >
                                {copied ? (
                                    <Check className="w-4 h-4" />
                                ) : (
                                    <Copy className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <span className="bank-network">
                        <span className="bank-network-dot" />
                        Monad · Mainnet
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/50">
                        gUSDC ▸ {assetLabel}
                    </span>
                </div>
            </div>
        </div>
    );
}
