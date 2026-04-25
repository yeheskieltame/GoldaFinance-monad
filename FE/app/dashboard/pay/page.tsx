'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { MobileLayout } from '@/components/mobile-layout';
import {
    ArrowLeft,
    Layers,
    TrendingUp,
    Shield,
    Power,
    Save,
    BarChart3,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Info,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeFiProtocol {
    id: string;
    name: string;
    icon: string;
    description: string;
    apy: string;
    apyNum: number;
    risk: 'low' | 'medium' | 'high';
    tvl: string;
    strategy: string;
    color: string;
}

type RebalanceFreq = 'daily' | 'weekly' | 'monthly';

// ─── Static data ──────────────────────────────────────────────────────────────

const PROTOCOLS: DeFiProtocol[] = [
    {
        id: 'apriori',
        name: 'Apriori',
        icon: '🔷',
        description: 'Liquid MON staking. Earn native staking rewards while keeping liquidity via aprMON tokens.',
        apy: '8.2%',
        apyNum: 8.2,
        risk: 'low',
        tvl: '$4.2M',
        strategy: 'MON → aprMON → staking yield',
        color: 'var(--info)',
    },
    {
        id: 'ambient',
        name: 'Ambient Finance',
        icon: '💧',
        description: 'Concentrated liquidity AMM. Provide USDC-MON liquidity in targeted price ranges for enhanced yield.',
        apy: '14.7%',
        apyNum: 14.7,
        risk: 'medium',
        tvl: '$8.6M',
        strategy: 'USDC + MON → LP → trading fees + incentives',
        color: 'var(--warning)',
    },
    {
        id: 'kuru',
        name: 'Kuru Exchange',
        icon: '⚡',
        description: 'High-performance order-book DEX native to Monad. Automated market-making on gold and BTC pairs.',
        apy: '22.5%',
        apyNum: 22.5,
        risk: 'high',
        tvl: '$12.1M',
        strategy: 'XAUt0/USDC & WBTC/USDC market-making',
        color: 'var(--success)',
    },
];

const RISK_LABEL: Record<string, { label: string; cls: string }> = {
    low:    { label: 'Low Risk',    cls: 'bg-info-soft text-[var(--info)]' },
    medium: { label: 'Medium Risk', cls: 'bg-warning-soft text-[var(--warning)]' },
    high:   { label: 'High Risk',   cls: 'bg-success-soft text-[var(--success)]' },
};

const REBALANCE_OPTIONS: { id: RebalanceFreq; label: string }[] = [
    { id: 'daily',   label: 'Daily' },
    { id: 'weekly',  label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeFiAgentPage() {
    const router = useRouter();
    const { ready, authenticated } = usePrivy();

    useEffect(() => {
        if (ready && !authenticated) router.push('/');
    }, [ready, authenticated, router]);

    const [allocations, setAllocations] = useState<Record<string, number>>({
        apriori: 40,
        ambient: 35,
        kuru:    25,
    });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [agentEnabled, setAgentEnabled] = useState(false);
    const [autoCompound, setAutoCompound] = useState(true);
    const [rebalanceFreq, setRebalanceFreq] = useState<RebalanceFreq>('weekly');
    const [minRebalance, setMinRebalance] = useState(5);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

    const totalAlloc = Object.values(allocations).reduce((s, v) => s + v, 0);
    const allocValid = totalAlloc === 100;

    // Keep allocations summing to 100 by scaling the other two when one slider moves
    function handleSlider(id: string, value: number) {
        setAllocations(prev => {
            const others = Object.entries(prev).filter(([k]) => k !== id);
            const othersTarget = 100 - value;
            const othersTotal = others.reduce((s, [, v]) => s + v, 0);

            const updated: Record<string, number> = { [id]: value };
            if (othersTotal === 0) {
                const even = Math.floor(othersTarget / others.length);
                others.forEach(([k], i) => {
                    updated[k] = i === others.length - 1 ? othersTarget - even * (others.length - 1) : even;
                });
            } else {
                const scale = othersTarget / othersTotal;
                let remaining = othersTarget;
                others.forEach(([k, v], i) => {
                    const newVal = i === others.length - 1 ? remaining : Math.round(v * scale);
                    updated[k] = Math.max(0, newVal);
                    remaining -= updated[k];
                });
            }
            return updated;
        });
    }

    async function handleSave() {
        if (!allocValid) return;
        setIsSaving(true);
        setSaveStatus('idle');
        try {
            const config = { allocations, autoCompound, rebalanceFreq, minRebalance, enabled: agentEnabled };
            localStorage.setItem('defi_agent_config', JSON.stringify(config));
            await new Promise(r => setTimeout(r, 700));
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch {
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    }

    useEffect(() => {
        try {
            const raw = localStorage.getItem('defi_agent_config');
            if (!raw) return;
            const cfg = JSON.parse(raw);
            if (cfg.allocations) setAllocations(cfg.allocations);
            if (typeof cfg.autoCompound === 'boolean') setAutoCompound(cfg.autoCompound);
            if (cfg.rebalanceFreq) setRebalanceFreq(cfg.rebalanceFreq);
            if (typeof cfg.minRebalance === 'number') setMinRebalance(cfg.minRebalance);
            if (typeof cfg.enabled === 'boolean') setAgentEnabled(cfg.enabled);
        } catch { /* ignore */ }
    }, []);

    const blendedApy = PROTOCOLS.reduce((sum, p) => sum + p.apyNum * (allocations[p.id] / 100), 0);

    if (!ready || !authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-foreground" />
            </div>
        );
    }

    return (
        <MobileLayout activeTab="pay">
            {/* Header */}
            <div className="bg-background sticky top-0 z-40 px-4 pt-12 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="p-2 rounded-full bg-muted hover:bg-secondary transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold flex items-center gap-2">
                            <Layers className="w-5 h-5 text-primary" />
                            DeFi Agent
                        </h1>
                        <p className="text-xs text-muted-foreground">Multi-protocol yield automation on Monad</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                        agentEnabled ? 'bg-success-soft text-[var(--success)]' : 'bg-muted text-muted-foreground'
                    }`}>
                        <span className={`w-2 h-2 rounded-full ${agentEnabled ? 'bg-[var(--success)] animate-pulse' : 'bg-muted-foreground'}`} />
                        {agentEnabled ? 'Active' : 'Inactive'}
                    </div>
                </div>
            </div>

            <div className="px-4 py-4 space-y-4 pb-28">

                {/* Blended yield banner */}
                <div className="ios-card p-4 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Blended Est. APY</p>
                            <p className="text-3xl font-bold text-primary">{blendedApy.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground mt-1">Weighted by your allocation</p>
                        </div>
                        <div className="text-right">
                            <BarChart3 className="w-10 h-10 text-primary/40 ml-auto mb-1" />
                            <p className="text-xs text-muted-foreground">3 protocols</p>
                            <p className="text-xs text-muted-foreground">Monad Mainnet</p>
                        </div>
                    </div>
                </div>

                {/* Protocol allocation cards */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold">Protocol Allocation</h2>
                        <span className={`text-sm font-medium ${allocValid ? 'text-[var(--success)]' : 'text-[var(--destructive)]'}`}>
                            {totalAlloc}% / 100%
                        </span>
                    </div>

                    <div className="space-y-3">
                        {PROTOCOLS.map((protocol) => {
                            const risk = RISK_LABEL[protocol.risk];
                            const alloc = allocations[protocol.id] ?? 0;

                            return (
                                <div key={protocol.id} className="ios-card p-4 space-y-3">
                                    <div className="flex items-start gap-3">
                                        <span className="text-2xl">{protocol.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold">{protocol.name}</h3>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risk.cls}`}>
                                                    {risk.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                                {protocol.description}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 text-center">
                                        <div className="flex-1 bg-muted rounded-lg p-2">
                                            <p className="text-xs text-muted-foreground">Est. APY</p>
                                            <p className="font-bold" style={{ color: protocol.color }}>{protocol.apy}</p>
                                        </div>
                                        <div className="flex-1 bg-muted rounded-lg p-2">
                                            <p className="text-xs text-muted-foreground">TVL</p>
                                            <p className="font-bold text-foreground">{protocol.tvl}</p>
                                        </div>
                                        <div className="flex-1 bg-muted rounded-lg p-2">
                                            <p className="text-xs text-muted-foreground">Target</p>
                                            <p className="font-bold text-primary">{alloc}%</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span>{protocol.strategy}</span>
                                    </div>

                                    {/* Allocation slider */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Drag to adjust</span>
                                            <span className="font-medium text-foreground">{alloc}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={alloc}
                                            onChange={e => handleSlider(protocol.id, Number(e.target.value))}
                                            className="w-full accent-primary h-2 rounded-full cursor-pointer"
                                        />
                                    </div>

                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-200"
                                            style={{ width: `${alloc}%`, backgroundColor: protocol.color }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!allocValid && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--destructive)]">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            Allocations must total exactly 100%
                        </div>
                    )}
                </div>

                {/* Agent toggle */}
                <div className="ios-card p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                agentEnabled ? 'bg-success-soft' : 'bg-muted'
                            }`}>
                                <Power className={`w-5 h-5 ${agentEnabled ? 'text-[var(--success)]' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                                <p className="font-semibold">DeFi Agent</p>
                                <p className="text-xs text-muted-foreground">
                                    {agentEnabled ? 'Autonomously managing positions' : 'Enable automated rebalancing'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setAgentEnabled(v => !v)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                                agentEnabled ? 'bg-[var(--success)]' : 'bg-muted-foreground/30'
                            }`}
                            aria-label="Toggle DeFi agent"
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                agentEnabled ? 'translate-x-6' : ''
                            }`} />
                        </button>
                    </div>
                </div>

                {/* Advanced settings */}
                <div className="ios-card overflow-hidden">
                    <button
                        onClick={() => setSettingsOpen(v => !v)}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">Agent Settings</span>
                        </div>
                        {settingsOpen
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>

                    {settingsOpen && (
                        <div className="px-4 pb-4 space-y-5 border-t border-border pt-4">
                            {/* Auto-compound */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium">Auto-compound Rewards</p>
                                    <p className="text-xs text-muted-foreground">Reinvest yield automatically</p>
                                </div>
                                <button
                                    onClick={() => setAutoCompound(v => !v)}
                                    className={`relative w-10 h-5 rounded-full transition-colors ${
                                        autoCompound ? 'bg-primary' : 'bg-muted-foreground/30'
                                    }`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                        autoCompound ? 'translate-x-5' : ''
                                    }`} />
                                </button>
                            </div>

                            {/* Rebalance frequency */}
                            <div>
                                <p className="text-sm font-medium mb-2">Rebalance Frequency</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {REBALANCE_OPTIONS.map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setRebalanceFreq(opt.id)}
                                            className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                                                rebalanceFreq === opt.id
                                                    ? 'bg-primary text-white'
                                                    : 'bg-muted text-foreground hover:bg-secondary'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Min drift */}
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="font-medium">Min. Drift to Rebalance</span>
                                    <span className="text-primary font-semibold">{minRebalance}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={20}
                                    value={minRebalance}
                                    onChange={e => setMinRebalance(Number(e.target.value))}
                                    className="w-full accent-primary h-2 rounded-full cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Rebalance only when drift ≥ {minRebalance}% from target
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Save button */}
                <button
                    onClick={handleSave}
                    disabled={isSaving || !allocValid}
                    className="w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 bg-primary text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                    {isSaving ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                    ) : saveStatus === 'saved' ? (
                        <><CheckCircle2 className="w-5 h-5" /> Configuration Saved</>
                    ) : saveStatus === 'error' ? (
                        <><AlertCircle className="w-5 h-5" /> Save Failed — Retry</>
                    ) : (
                        <><Save className="w-5 h-5" /> {agentEnabled ? 'Save & Activate Agent' : 'Save Configuration'}</>
                    )}
                </button>

                {/* About section */}
                <div className="ios-card p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm font-semibold">How DeFi Agent Works</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        The DeFi Agent monitors your target allocations and automatically rebalances your positions across Apriori, Ambient Finance, and Kuru Exchange on Monad.
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Set your desired split, enable the agent, and it routes your USDC to maximize yield while respecting your risk profile. All transactions settle on Monad with ~1s finality.
                    </p>
                </div>

            </div>
        </MobileLayout>
    );
}
