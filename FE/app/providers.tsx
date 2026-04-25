'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { MONAD_TESTNET } from '@/lib/types';
import React from 'react';

const monadTestnet = {
  id: MONAD_TESTNET.chainId,
  name: MONAD_TESTNET.name,
  network: 'monad-testnet',
  nativeCurrency: MONAD_TESTNET.nativeCurrency,
  rpcUrls: {
    default: { http: [MONAD_TESTNET.rpcUrl] },
    public: { http: [MONAD_TESTNET.rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: 'MonadScan Testnet',
      url: MONAD_TESTNET.explorerUrl,
    },
  },
  testnet: true,
};

export function Providers({ children }: { children: React.ReactNode }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!privyAppId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8 max-w-md">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-2xl font-bold mx-auto">
            G
          </div>
          <h2 className="text-2xl font-bold">Configuration Required</h2>
          <p className="text-muted-foreground leading-relaxed">
            Please add your Privy App ID to <code className="px-2 py-1 bg-secondary rounded text-sm">.env.local</code>
          </p>
          <div className="bg-secondary/50 rounded-xl p-4 text-left">
            <code className="text-sm">
              NEXT_PUBLIC_PRIVY_APP_ID=your-app-id
            </code>
          </div>
          <p className="text-sm text-muted-foreground">
            Get your App ID from{' '}
            <a
              href="https://dashboard.privy.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 dark:text-amber-400 hover:underline"
            >
              dashboard.privy.io
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet', 'google'],

        appearance: {
          theme: 'light',
          accentColor: '#F59E0B',
          logo: '/golda-logo.png',
          showWalletLoginFirst: false,
        },

        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],

        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },

        legal: {
          termsAndConditionsUrl: '/terms',
          privacyPolicyUrl: '/privacy',
        },
      }}
    >
      <React.Fragment key="privy-children">
        {children}
      </React.Fragment>
    </PrivyProvider>
  );
}
