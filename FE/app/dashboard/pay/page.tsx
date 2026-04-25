'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { MobileLayout } from '@/components/mobile-layout';
import { DetailPageSkeleton } from '@/components/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGoldaVault } from '@/lib/hooks/useAureoContract';
import { EXPLORER_URL } from '@/lib/services/contractService';
import {
    ArrowLeft,
    Sparkles,
    Brain,
    Calendar,
    Clock,
    DollarSign,
    Zap,
    Power,
    AlertCircle,
    Loader2,
    CheckCircle2,
    ExternalLink,
    TrendingUp,
} from 'lucide-react';

// ============================================================================
// Stack Agent — auto-deposit (DCA) USDC into the Golda Vault on a schedule.
// ============================================================================

type StackFrequency = 'daily' | 'weekly' | 'idle';

interface StackSettings {
    enabled: boolean;
    frequency: StackFrequency;
    amountPerStack: number;
    /** For 'idle' mode: trigger when liquid USDC balance >= this. */
    idleThreshold: number;
    lastStackAt: number | null;
}

interface StackEntry {
    id: string;
    amount: number;
    sharesEarned: number;
    timestamp: number;
    txHash: string;
    trigger: 'manual' | 'scheduled';
}

const SETTINGS_KEY = 'golda_stack_agent_v1';
const HISTORY_KEY = 'golda_stack_history_v1';

const DEFAULT_SETTINGS: StackSettings = {
    enabled: false,
    frequency: 'weekly',
    amountPerStack: 25,
    idleThreshold: 100,
    lastStackAt: null,
};

const FREQ_MS: Record<StackFrequency, number> = {
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    idle: 0,
};

function formatUSD(n: number) {
    return n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatCountdown(ms: number) {
    if (ms <= 0) return 'Ready';
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return 'Now';
}

export default function StackAgentPage() {
    const router = useRouter();
    const { ready, authenticated } = usePrivy();
    const { balances, deposit, walletAddress, fetchBalances } = useGoldaVault();

    const [settings, setSettings] = useState<StackSettings>(DEFAULT_SETTINGS);
    const [draft, setDraft] = useState<StackSettings>(DEFAULT_SETTINGS);
    const [history, setHistory] = useState<StackEntry[]>([]);
    const [now, setNow] = useState<number>(() => Date.now());
    const [stacking, setStacking] = useState(false);
    const [error, setError] = useState('');
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const stackingRef = useRef(false);

    // ---- Persist hydration ---------------------------------------------------
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const s = window.localStorage.getItem(SETTINGS_KEY);
            if (s) {
                const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(s) } as StackSettings;
                setSettings(parsed);
                setDraft(parsed);
            }
            const h = window.localStorage.getItem(HISTORY_KEY);
            if (h) setHistory(JSON.parse(h));
        } catch {
            /* ignore parse errors */
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }, [history]);

    // ---- Auth gate -----------------------------------------------------------
    useEffect(() => {
        if (ready && !authenticated) router.push('/');
    }, [ready, authenticated, router]);

    // ---- Tick the clock every 30s for countdowns -----------------------------
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);

    // ---- Auto-feedback timeout -----------------------------------------------
    useEffect(() => {
        if (!feedback) return;
        const id = setTimeout(() => setFeedback(null), 4000);
        return () => clearTimeout(id);
    }, [feedback]);

    // ---- Derived stats -------------------------------------------------------
    const totalStacked = useMemo(
        () => history.reduce((sum, h) => sum + h.amount, 0),
        [history],
    );
    const totalShares = useMemo(
        () => history.reduce((sum, h) => sum + h.sharesEarned, 0),
        [history],
    );
    const stacksThisWeek = useMemo(() => {
        const cutoff = now - 7 * 86_400_000;
        return history.filter(h => h.timestamp >= cutoff).length;
    }, [history, now]);

    const nextStackAt = useMemo<number | null>(() => {
        if (!settings.enabled) return null;
        if (settings.frequency === 'idle') {
            return balances.usdc >= settings.idleThreshold ? now : null;
        }
        const interval = FREQ_MS[settings.frequency];
        return (settings.lastStackAt ?? now) + interval;
    }, [settings, now, balances.usdc]);

    const countdown = useMemo(() => {
        if (!settings.enabled) return 'Paused';
        if (settings.frequency === 'idle') {
            return balances.usdc >= settings.idleThreshold
                ? 'Ready'
                : `Waiting ($${formatUSD(settings.idleThreshold - balances.usdc)} to go)`;
        }
        return nextStackAt ? formatCountdown(nextStackAt - now) : '—';
    }, [settings, balances.usdc, nextStackAt, now]);

    const status: 'active' | 'paused' | 'setup' = useMemo(() => {
        if (!settings.enabled) return 'paused';
        if (settings.amountPerStack <= 0) return 'setup';
        return 'active';
    }, [settings.enabled, settings.amountPerStack]);

    // ---- Core stack runner ---------------------------------------------------
    const runStack = useCallback(
        async (amount: number, trigger: 'manual' | 'scheduled') => {
            if (stackingRef.current) return;
            if (amount <= 0) {
                setError('Amount must be greater than zero.');
                return;
            }
            if (amount > balances.usdc) {
                setError(`Insufficient USDC — wallet has $${formatUSD(balances.usdc)}.`);
                return;
            }
            stackingRef.current = true;
            setStacking(true);
            setError('');
            try {
                const sharePriceBefore = balances.sharePrice || 1;
                const result = await deposit(amount);
                if (!result.success) {
                    throw new Error(result.error ?? 'Deposit failed');
                }
                const sharesEarned = sharePriceBefore > 0 ? amount / sharePriceBefore : 0;
                const entry: StackEntry = {
                    id: result.txHash ?? `${Date.now()}`,
                    amount,
                    sharesEarned,
                    timestamp: Date.now(),
                    txHash: result.txHash ?? '',
                    trigger,
                };
                setHistory(prev => [entry, ...prev].slice(0, 50));
                setSettings(prev => ({ ...prev, lastStackAt: Date.now() }));
                setFeedback({
                    message:
                        trigger === 'manual'
                            ? `Stacked $${formatUSD(amount)} into the vault.`
                            : `Auto-stack ran: $${formatUSD(amount)} deposited.`,
                    tone: 'success',
                });
                await fetchBalances();
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Stack failed';
                setError(msg);
                setFeedback({ message: msg, tone: 'error' });
            } finally {
                stackingRef.current = false;
                setStacking(false);
            }
        },
        [balances.usdc, balances.sharePrice, deposit, fetchBalances],
    );

    // ---- Auto-stack scheduler (runs while page is open) ----------------------
    useEffect(() => {
        if (!settings.enabled || !ready || !authenticated) return;
        if (settings.amountPerStack <= 0) return;
        if (stackingRef.current) return;

        const due =
            settings.frequency === 'idle'
                ? balances.usdc >= settings.idleThreshold
                : nextStackAt !== null && nextStackAt <= now;

        if (!due) return;
        if (balances.usdc < settings.amountPerStack) return;

        runStack(settings.amountPerStack, 'scheduled');
    }, [
        settings.enabled,
        settings.frequency,
        settings.amountPerStack,
        settings.idleThreshold,
        nextStackAt,
        now,
        balances.usdc,
        ready,
        authenticated,
        runStack,
    ]);

    // ---- Handlers ------------------------------------------------------------
    const settingsDirty = useMemo(
        () =>
            draft.frequency !== settings.frequency ||
            draft.amountPerStack !== settings.amountPerStack ||
            draft.idleThreshold !== settings.idleThreshold,
        [draft, settings],
    );

    const saveSettings = () => {
        setSettings(prev => ({ ...prev, ...draft }));
        setFeedback({ message: 'Schedule saved.', tone: 'success' });
    };

    const toggleEnabled = () => {
        setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
    };

    // ---- Loading state -------------------------------------------------------
    if (!ready || !authenticated) {
        return (
            <MobileLayout activeTab="pay">
                <DetailPageSkeleton cards={4} />
            </MobileLayout>
        );
    }

    const quickAmounts = [10, 25, 50, 100];

    return (
        <MobileLayout activeTab="pay">
            {/* ============================================================
                HERO HEADER — branded identity strip (back + title + status)
                ============================================================ */}
            <div className="vault-card ink !rounded-none !rounded-b-2xl px-4 pt-safe md:pt-0 pb-6 !min-h-0">
                <div className="relative z-10 flex items-center gap-3">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="btn-haptic p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                        aria-label="Back"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-white/12 backdrop-blur flex items-center justify-center">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-title-2 truncate">Stack Agent</h1>
                        <p className="text-footnote text-white/65 truncate">
                            Auto-deposit USDC to Golda Vault
                        </p>
                    </div>
                    <StatusPill status={status} />
                </div>
            </div>

            {/* ============================================================
                BODY
                ============================================================ */}
            <div className="px-4 py-5 space-y-4 animate-fade-in">
                {/* HEADLINE STATS — proper raised cards (not inside the hero) */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="ios-card-elev p-4">
                        <p className="section-label mb-1">Total Stacked</p>
                        <p className="text-title-1 font-num leading-tight">
                            ${formatUSD(totalStacked)}
                        </p>
                        <p className="text-footnote text-muted-foreground mt-1 truncate">
                            {history.length} stack{history.length === 1 ? '' : 's'}
                            {totalShares > 0 && ` · ${totalShares.toFixed(4)} sh`}
                        </p>
                    </div>
                    <div className="ios-card-elev p-4">
                        <p className="section-label mb-1">Next Stack</p>
                        <p className="text-title-1 font-num leading-tight">
                            {countdown}
                        </p>
                        <p className="text-footnote text-muted-foreground mt-1 truncate">
                            {settings.enabled
                                ? `${labelFor(settings.frequency)} · $${formatUSD(settings.amountPerStack)}`
                                : 'Auto-stacking is paused'}
                        </p>
                    </div>
                </div>

                {/* Feedback toast (inline) */}
                {feedback && (
                    <div
                        className={`flex items-center gap-2 text-sm p-3 rounded-xl border ${
                            feedback.tone === 'success'
                                ? 'bg-success-soft border-[var(--success)]/30 text-[var(--success)]'
                                : 'bg-destructive-soft border-[var(--destructive)]/30 text-[var(--destructive)]'
                        }`}
                    >
                        {feedback.tone === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                            <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        <span className="flex-1">{feedback.message}</span>
                    </div>
                )}

                {/* AUTO-STACK TOGGLE */}
                <div className="ios-card-elev p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            settings.enabled
                                ? 'bg-[var(--success)] text-white'
                                : 'bg-surface text-muted-foreground'
                        }`}>
                            <Power className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-headline truncate">Auto-Stacking</h3>
                            <p className="text-footnote text-muted-foreground truncate">
                                {settings.enabled
                                    ? 'Agent will deposit on schedule'
                                    : 'Tap to enable autonomous stacking'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={toggleEnabled}
                        className={`ios-switch ${settings.enabled ? 'on' : ''}`}
                        aria-pressed={settings.enabled}
                        aria-label="Toggle auto-stacking"
                    >
                        <span className="ios-switch-thumb" />
                    </button>
                </div>

                {/* STACK SCHEDULE */}
                <div className="ios-card-elev p-4 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center shrink-0">
                            <Calendar className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-headline">Stack Schedule</h3>
                            <p className="text-footnote text-muted-foreground">
                                How often the agent runs
                            </p>
                        </div>
                    </div>

                    {/* Frequency picker */}
                    <div className="grid grid-cols-3 gap-2">
                        {(['daily', 'weekly', 'idle'] as const).map(freq => {
                            const active = draft.frequency === freq;
                            return (
                                <button
                                    key={freq}
                                    onClick={() =>
                                        setDraft(prev => ({ ...prev, frequency: freq }))
                                    }
                                    className={`btn-haptic rounded-xl border py-3 text-sm font-semibold transition-colors ${
                                        active
                                            ? 'border-foreground bg-foreground text-background'
                                            : 'border-border hover:bg-surface text-foreground'
                                    }`}
                                >
                                    {labelFor(freq)}
                                </button>
                            );
                        })}
                    </div>

                    {/* Amount per stack */}
                    <div className="space-y-2">
                        <label className="text-footnote text-muted-foreground">
                            Amount per stack (USDC)
                        </label>
                        <div className="relative">
                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input
                                type="number"
                                inputMode="decimal"
                                value={draft.amountPerStack || ''}
                                onChange={e =>
                                    setDraft(prev => ({
                                        ...prev,
                                        amountPerStack: parseFloat(e.target.value) || 0,
                                    }))
                                }
                                placeholder="25"
                                className="pl-12 py-6 text-2xl font-semibold rounded-xl"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            {quickAmounts.map(amt => (
                                <button
                                    key={amt}
                                    onClick={() =>
                                        setDraft(prev => ({ ...prev, amountPerStack: amt }))
                                    }
                                    className={`btn-haptic flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        draft.amountPerStack === amt
                                            ? 'bg-foreground text-background'
                                            : 'bg-surface hover:bg-surface-2 text-foreground'
                                    }`}
                                >
                                    ${amt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Idle threshold (only visible in idle mode) */}
                    {draft.frequency === 'idle' && (
                        <div className="space-y-2">
                            <label className="text-footnote text-muted-foreground">
                                Trigger when wallet USDC ≥
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    value={draft.idleThreshold || ''}
                                    onChange={e =>
                                        setDraft(prev => ({
                                            ...prev,
                                            idleThreshold: parseFloat(e.target.value) || 0,
                                        }))
                                    }
                                    placeholder="100"
                                    className="pl-12 py-5 text-lg font-semibold rounded-xl"
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Agent stacks ${formatUSD(draft.amountPerStack || 0)} whenever your
                                liquid USDC crosses this threshold.
                            </p>
                        </div>
                    )}

                    {/* Save button (only when dirty) */}
                    {settingsDirty && (
                        <Button
                            onClick={saveSettings}
                            className="w-full rounded-xl"
                        >
                            Save schedule
                        </Button>
                    )}
                </div>

                {/* MANUAL STACK NOW */}
                <div className="ios-card-elev p-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center shrink-0">
                            <Zap className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-headline">Stack Now</h3>
                            <p className="text-footnote text-muted-foreground">
                                Manual one-shot deposit · ${formatUSD(balances.usdc)} USDC available
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => runStack(settings.amountPerStack, 'manual')}
                        disabled={
                            stacking ||
                            settings.amountPerStack <= 0 ||
                            balances.usdc < settings.amountPerStack
                        }
                        className="w-full rounded-xl !h-12 disabled:opacity-50"
                    >
                        {stacking ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Stacking…
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4 mr-2" />
                                Stack ${formatUSD(settings.amountPerStack)} now
                            </>
                        )}
                    </Button>
                    {balances.usdc < settings.amountPerStack && (
                        <p className="text-[11px] text-[var(--warning)] flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Wallet balance below the configured stack amount.
                        </p>
                    )}
                    {error && (
                        <p className="text-[11px] text-[var(--destructive)] flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {error}
                        </p>
                    )}
                </div>

                {/* STATS GRID */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="ios-card p-4">
                        <p className="section-label mb-1">This Week</p>
                        <p className="text-title-2 font-num">{stacksThisWeek}</p>
                        <p className="text-footnote text-muted-foreground">
                            stack{stacksThisWeek === 1 ? '' : 's'}
                        </p>
                    </div>
                    <div className="ios-card p-4">
                        <p className="section-label mb-1">Vault Shares Earned</p>
                        <p className="text-title-2 font-num">{totalShares.toFixed(4)}</p>
                        <p className="text-footnote text-muted-foreground">gUSDC</p>
                    </div>
                </div>

                {/* RECENT ACTIVITY */}
                <div className="ios-card overflow-hidden">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center">
                                <Clock className="w-4 h-4 text-foreground" />
                            </div>
                            <h3 className="text-headline">Recent Stacks</h3>
                        </div>
                        {history.length > 0 && (
                            <span className="chip chip-mono text-[10px]">
                                {history.length} total
                            </span>
                        )}
                    </div>
                    {history.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-surface flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <p className="text-footnote text-muted-foreground">
                                No stacks yet — enable the agent or stack manually.
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {history.slice(0, 8).map(entry => (
                                <li key={entry.id} className="p-4 flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                            entry.trigger === 'scheduled'
                                                ? 'bg-[color-mix(in_srgb,var(--electric-purple)_18%,transparent)] text-[var(--electric-purple)]'
                                                : 'bg-surface text-foreground'
                                        }`}
                                    >
                                        {entry.trigger === 'scheduled' ? (
                                            <Brain className="w-5 h-5" />
                                        ) : (
                                            <TrendingUp className="w-5 h-5" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-headline truncate">
                                            ${formatUSD(entry.amount)}
                                            <span className="text-footnote text-muted-foreground font-normal ml-1.5">
                                                · {entry.trigger}
                                            </span>
                                        </p>
                                        <p className="text-footnote text-muted-foreground">
                                            {new Date(entry.timestamp).toLocaleString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                            {' · '}
                                            {entry.sharesEarned.toFixed(4)} gUSDC
                                        </p>
                                    </div>
                                    {entry.txHash && (
                                        <a
                                            href={`${EXPLORER_URL}/tx/${entry.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn-haptic shrink-0 p-2 rounded-full hover:bg-surface text-muted-foreground"
                                            aria-label="View transaction"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* HOW IT WORKS */}
                <div className="ios-card p-4">
                    <h4 className="text-headline mb-2 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-[var(--electric-purple)]" />
                        How Stack Agent works
                    </h4>
                    <ul className="space-y-1.5 text-footnote text-muted-foreground list-disc list-inside">
                        <li>Pick a frequency — daily, weekly, or idle-balance trigger.</li>
                        <li>Set how much USDC to stack each run.</li>
                        <li>
                            Enable the toggle and the agent deposits into your{' '}
                            <span className="text-foreground font-medium">Golda Vault</span> on
                            schedule.
                        </li>
                        <li>You earn vault shares (gUSDC) backed by gold and BTC.</li>
                    </ul>
                    {walletAddress && (
                        <p className="text-[10px] text-muted-foreground mt-3 font-mono">
                            agent runs while this page is open · {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                        </p>
                    )}
                </div>
            </div>
        </MobileLayout>
    );
}

// ============================================================================
// Helpers
// ============================================================================

function labelFor(freq: StackFrequency) {
    switch (freq) {
        case 'daily':
            return 'Daily';
        case 'weekly':
            return 'Weekly';
        case 'idle':
            return 'Idle balance';
    }
}

function StatusPill({ status }: { status: 'active' | 'paused' | 'setup' }) {
    const cfg = {
        active: { bg: 'bg-success-soft', text: 'text-[var(--success)]', label: 'Active', dot: 'bg-[var(--success)]' },
        paused: { bg: 'bg-white/10', text: 'text-white/80', label: 'Paused', dot: 'bg-white/60' },
        setup: { bg: 'bg-warning-soft', text: 'text-[var(--warning)]', label: 'Setup', dot: 'bg-[var(--warning)]' },
    }[status];
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] shrink-0 ${cfg.bg} ${cfg.text}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}
