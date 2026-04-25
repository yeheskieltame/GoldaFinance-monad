'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Shield,
  Zap,
  ChevronRight,
  Wallet,
  ArrowRight,
  Bitcoin,
} from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard');
    }
  }, [ready, authenticated, router]);

  const features = [
    {
      icon: Shield,
      title: 'Inflation-proof Savings',
      description: 'Gold and BTC-backed positions hedge against USD inflation',
      color: 'text-amber-500',
      bgColor: 'bg-amber-100 dark:bg-amber-500/20',
    },
    {
      icon: Sparkles,
      title: 'LiFi + Yield Routing',
      description: 'USDC auto-swapped into XAUt0 or BTC and supplied to Euler',
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-500/20',
    },
    {
      icon: Zap,
      title: 'One Vault, One Click',
      description: 'Deposit USDC, get gUSDC shares, claim anytime',
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-500/20',
    },
  ];

  return (
    <div className="mobile-container bg-background min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-white font-bold">G</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
              GoldaFinance
            </span>
          </div>
          <Button
            onClick={login}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20"
          >
            Login
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 px-4 pb-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-500/20 border border-amber-200/50 dark:border-amber-800/30 mb-6">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Inflation-proof USDC Savings
          </span>
        </div>

        <h1 className="text-4xl font-bold leading-tight mb-4">
          Save in{' '}
          <span className="bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
            Gold
          </span>{' '}
          or{' '}
          <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            BTC
          </span>
          <br />
          Deposit in{' '}
          <span className="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">
            USDC
          </span>
        </h1>

        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          GoldaFinance routes your USDC into XAUt0 or BTC on Monad and earns DeFi yield on top.
        </p>

        {/* CTA Buttons */}
        <div className="flex gap-3 mb-8">
          <Button
            onClick={login}
            size="lg"
            className="flex-1 bg-primary hover:bg-primary/90 text-white py-6 rounded-2xl shadow-lg shadow-primary/20 text-base"
          >
            Get Started
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="py-6 px-6 rounded-2xl text-base"
          >
            Learn More
          </Button>
        </div>

        {/* Mock Phone Preview */}
        <div className="relative bg-gradient-to-br from-primary/10 via-amber-100/50 to-primary/5 dark:from-primary/20 dark:via-amber-500/10 dark:to-primary/10 rounded-3xl p-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/30 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-br from-primary/30 to-transparent rounded-full blur-2xl" />

          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-2xl">
            {/* Mini Vault Card */}
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium opacity-90">Golda Vault</span>
              </div>
              <div>
                <p className="text-xs opacity-70">Savings Value</p>
                <p className="text-2xl font-bold">$160.42</p>
                <p className="text-xs opacity-70 mt-1">backed by XAUt0</p>
              </div>
            </div>

            {/* Mini Quick Actions */}
            <div className="grid grid-cols-4 gap-2">
              {['Deposit', 'Withdraw', 'Claim', 'More'].map((action, i) => (
                <div key={i} className="text-center">
                  <div className="w-10 h-10 mx-auto bg-muted rounded-xl mb-1" />
                  <span className="text-[10px] text-muted-foreground">{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-8">
        <h2 className="text-xl font-bold mb-6">Why GoldaFinance?</h2>

        <div className="space-y-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-4 p-4 bg-card rounded-2xl border border-border hover:shadow-md transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${feature.bgColor}`}>
                  <Icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Supported Assets */}
      <section className="px-4 py-8">
        <h2 className="text-xl font-bold mb-6">Pick your savings asset</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'XAUT', label: 'XAUt0', desc: 'Tether Gold', icon: '🥇' },
            { id: 'BTC', label: 'BTC', desc: 'Wrapped BTC', icon: <Bitcoin className="w-6 h-6" /> },
          ].map((a) => (
            <div key={a.id} className="bg-card rounded-2xl border border-border p-4 text-center">
              <div className="text-3xl mb-1">{typeof a.icon === 'string' ? a.icon : <span className="inline-flex items-center justify-center">{a.icon}</span>}</div>
              <p className="font-semibold">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 py-8">
        <h2 className="text-xl font-bold mb-6">How It Works</h2>

        <div className="space-y-4">
          {[
            { step: 1, title: 'Deposit USDC', desc: 'Mint gUSDC vault shares at the current NAV' },
            { step: 2, title: 'Vault routes into XAUt0 / BTC', desc: 'Operator executes LiFi swaps + supplies to Euler for yield' },
            { step: 3, title: 'Request Withdraw → Claim', desc: 'Burn shares, claim USDC once the vault is liquid' },
          ].map((item) => (
            <div key={item.step} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-primary text-white font-bold flex items-center justify-center shrink-0">
                {item.step}
              </div>
              <div className="pt-1">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-8 pb-12">
        <div className="bg-gradient-to-br from-primary/10 to-amber-100/50 dark:from-primary/20 dark:to-amber-500/10 rounded-3xl p-6 text-center">
          <Wallet className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Ready to Save Smarter?</h2>
          <p className="text-muted-foreground mb-6">
            Join GoldaFinance and keep up with inflation
          </p>
          <Button
            onClick={login}
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-white py-6 rounded-2xl shadow-lg shadow-primary/20 text-base"
          >
            Create Account
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-6 border-t border-border text-center">
        <p className="text-sm text-muted-foreground">
          © 2026 GoldaFinance. Built on Monad.
        </p>
      </footer>
    </div>
  );
}
