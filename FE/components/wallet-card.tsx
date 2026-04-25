'use client';

import { Eye, EyeOff, Copy, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface WalletCardProps {
    usdcBalance: number;
    shares: number;
    sharePrice: number;
    assetLabel?: string;
    walletAddress?: string;
    variant?: 'gold' | 'blue' | 'dark';
}

export function WalletCard({
    usdcBalance,
    shares,
    sharePrice,
    assetLabel = 'XAUt0',
    walletAddress,
    variant = 'gold',
}: WalletCardProps) {
    const [showBalance, setShowBalance] = useState(true);
    const [copied, setCopied] = useState(false);

    const shareValue = shares * sharePrice;

    const variantClass = {
        gold: 'wallet-card-gold',
        blue: 'wallet-card-blue',
        dark: '',
    }[variant];

    const copyAddress = async () => {
        if (walletAddress) {
            await navigator.clipboard.writeText(walletAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const formatAddress = (address: string) =>
        `${address.slice(0, 6)}...${address.slice(-4)}`;

    return (
        <div className={`wallet-card ${variantClass}`}>
            <div className="absolute top-0 right-0 w-40 h-40 opacity-10">
                <svg viewBox="0 0 200 200" fill="currentColor">
                    <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1" />
                    <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
                    <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm opacity-90">Golda Vault</span>
                </div>
                <button
                    onClick={() => setShowBalance(!showBalance)}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                    {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
            </div>

            {/* Shares Value */}
            <div className="mb-6 relative z-10">
                <p className="text-xs opacity-70 mb-1">Savings Value</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold tracking-tight">
                        {showBalance ? `$${shareValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '••••'}
                    </span>
                </div>
                <p className="text-sm opacity-70 mt-1">
                    {showBalance ? `${shares.toFixed(4)} gUSDC` : '••••'}{' · '}backed by {assetLabel}
                </p>
            </div>

            {/* USDC Balance */}
            <div className="mb-4 relative z-10">
                <p className="text-xs opacity-70 mb-1">USDC Balance</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold">
                        {showBalance ? usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '••••'}
                    </span>
                    <span className="text-sm font-medium opacity-80">USDC</span>
                </div>
            </div>

            {walletAddress && (
                <div className="flex items-center justify-between pt-4 border-t border-white/20 relative z-10">
                    <div>
                        <p className="text-xs opacity-70">Wallet Address</p>
                        <p className="font-mono text-sm">{formatAddress(walletAddress)}</p>
                    </div>
                    <button
                        onClick={copyAddress}
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>
            )}

            <div className="absolute bottom-6 right-6 w-12 h-9 rounded bg-gradient-to-br from-white/30 to-white/10 opacity-50" />
        </div>
    );
}
