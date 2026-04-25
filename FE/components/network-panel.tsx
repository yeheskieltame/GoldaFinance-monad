'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface NetworkPanelProps {
    vaultAddress?: string;
    usdcAddress?: string;
    walletAddress?: string | null;
    /** Optional explorer base URL — when provided, an external-link icon is shown next to each row. */
    explorerBaseUrl?: string;
    className?: string;
}

const shortAddr = (addr?: string | null) => {
    if (!addr) return '—';
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

/**
 * Network info card in a banking-row layout: label on the left, monospaced
 * truncated address on the right, with a copy button. Long values do not
 * wrap to a second line — they truncate cleanly with mid-ellipsis.
 */
export function NetworkPanel({
    vaultAddress,
    usdcAddress,
    walletAddress,
    explorerBaseUrl,
    className = '',
}: NetworkPanelProps) {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = async (key: string, value?: string | null) => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopied(key);
        setTimeout(() => setCopied(null), 1800);
    };

    const rows: Array<{
        key: string;
        label: string;
        value?: string | null;
    }> = [
        { key: 'vault', label: 'Vault', value: vaultAddress },
        { key: 'usdc', label: 'USDC', value: usdcAddress },
        { key: 'wallet', label: 'Your wallet', value: walletAddress },
    ];

    return (
        <div className={`ios-card p-5 ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-4">
                <p className="section-label">Network</p>
                <span className="bank-network !text-foreground/85">
                    <span className="bank-network-dot !bg-[var(--success)] !shadow-[0_0_6px_rgba(22,163,74,0.7)]" />
                    Monad · Mainnet
                </span>
            </div>

            {/* Rows */}
            <ul className="divide-y divide-border/60">
                {rows.map(({ key, label, value }) => (
                    <li
                        key={key}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                        <span className="text-footnote text-muted-foreground shrink-0">
                            {label}
                        </span>
                        <div className="flex items-center gap-1 min-w-0">
                            <span
                                className="text-footnote font-mono text-foreground/90 truncate"
                                title={value ?? undefined}
                            >
                                {shortAddr(value)}
                            </span>
                            <button
                                type="button"
                                disabled={!value}
                                onClick={() => copy(key, value)}
                                className="btn-haptic shrink-0 p-1.5 rounded-full hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                aria-label={`Copy ${label} address`}
                            >
                                {copied === key ? (
                                    <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                            </button>
                            {explorerBaseUrl && value && (
                                <a
                                    href={`${explorerBaseUrl}/address/${value}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-haptic shrink-0 p-1.5 rounded-full hover:bg-surface transition-colors"
                                    aria-label={`Open ${label} in explorer`}
                                >
                                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                                </a>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
