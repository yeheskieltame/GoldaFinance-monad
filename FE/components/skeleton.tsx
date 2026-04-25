'use client';

import { ReactNode } from 'react';

/** Base shimmer block. Apply width/height via className (Tailwind sizing). */
export function Skeleton({
    className = '',
    rounded = 'md',
}: {
    className?: string;
    rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'none';
}) {
    const radius =
        rounded === 'full'
            ? 'rounded-full'
            : rounded === 'none'
              ? 'rounded-none'
              : `rounded-${rounded}`;
    return <div className={`skel ${radius} ${className}`} aria-hidden />;
}

// ============================================================================
// PAGE-SHAPED SKELETONS — match the live layouts so the swap is invisible.
// ============================================================================

/** Top header strip used by most detail pages (back button + title chunk). */
function HeaderRow({ withActions = false }: { withActions?: boolean }) {
    return (
        <div className="flex items-center gap-3 mb-6">
            <Skeleton className="w-10 h-10" rounded="full" />
            <div className="flex-1 space-y-1.5">
                <Skeleton className="h-5 w-40" rounded="md" />
                <Skeleton className="h-3.5 w-24" rounded="md" />
            </div>
            {withActions && (
                <div className="flex gap-2">
                    <Skeleton className="w-10 h-10" rounded="full" />
                    <Skeleton className="w-10 h-10" rounded="full" />
                </div>
            )}
        </div>
    );
}

/** Skeleton mimicking the dashboard hero (welcome + WalletCard + cards). */
export function DashboardSkeleton() {
    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="px-4 md:px-0 pt-safe md:pt-0 pb-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="space-y-2">
                        <Skeleton className="h-3 w-24" rounded="md" />
                        <Skeleton className="h-8 w-40" rounded="md" />
                    </div>
                    <div className="flex gap-2">
                        <Skeleton className="w-10 h-10" rounded="full" />
                        <Skeleton className="w-10 h-10" rounded="full" />
                        <Skeleton className="w-10 h-10" rounded="full" />
                    </div>
                </div>

                {/* Wallet card placeholder — matches .bank-card aspect */}
                <div className="vault-card bank-card !bg-transparent !border-transparent !shadow-none">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <Skeleton className="w-[38px] h-[28px]" rounded="md" />
                            <Skeleton className="h-5 w-24" rounded="full" />
                        </div>
                        <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-16 ml-auto" rounded="md" />
                            <Skeleton className="h-3 w-20 ml-auto" rounded="md" />
                        </div>
                    </div>
                    <div className="space-y-2.5">
                        <Skeleton className="h-3 w-24" rounded="md" />
                        <Skeleton className="h-9 md:h-12 w-44" rounded="md" />
                        <Skeleton className="h-3.5 w-56" rounded="md" />
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <Skeleton className="h-5 w-44" rounded="md" />
                            <div className="flex gap-1.5">
                                <Skeleton className="w-8 h-8" rounded="full" />
                                <Skeleton className="w-8 h-8" rounded="full" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-5 w-32" rounded="full" />
                            <Skeleton className="h-3 w-20" rounded="md" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 md:px-0 space-y-6">
                <CardBlockSkeleton lines={2} />
                <CardBlockSkeleton lines={3} />
                <div className="grid grid-cols-2 gap-3 lg:hidden">
                    <CardStatSkeleton />
                    <CardStatSkeleton />
                </div>
                <CardBlockSkeleton lines={4} />
            </div>
        </div>
    );
}

/** Generic detail-page skeleton: top header + a few content cards. */
export function DetailPageSkeleton({
    title = true,
    cards = 3,
    headerActions = false,
}: {
    title?: boolean;
    cards?: number;
    headerActions?: boolean;
}) {
    return (
        <div className="px-4 pt-safe md:pt-0 pb-6 animate-fade-in">
            {title && <HeaderRow withActions={headerActions} />}
            <div className="space-y-4">
                {Array.from({ length: cards }).map((_, i) => (
                    <CardBlockSkeleton key={i} lines={i === 0 ? 4 : 2} />
                ))}
            </div>
        </div>
    );
}

/** Skeleton for the profile screen — header + list of action rows. */
export function ProfilePageSkeleton() {
    return (
        <div className="px-4 md:px-0 pt-safe md:pt-0 pb-8 animate-fade-in">
            <HeaderRow />
            {/* Profile summary card */}
            <div className="ios-card-elev p-5 mb-5">
                <div className="flex items-center gap-4">
                    <Skeleton className="w-16 h-16" rounded="full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" rounded="md" />
                        <Skeleton className="h-3 w-28" rounded="md" />
                    </div>
                </div>
            </div>
            {/* Action list */}
            <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <ListRowSkeleton key={i} />
                ))}
            </div>
        </div>
    );
}

/** Skeleton for the history page chrome (sticky header + list). */
export function HistoryPageSkeleton() {
    return (
        <div className="animate-fade-in">
            <div className="bg-background sticky top-0 z-40 px-4 pt-safe md:pt-0 pb-4 border-b border-border">
                <HeaderRow withActions />
                <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-14" rounded="lg" />
                    <Skeleton className="h-14" rounded="lg" />
                    <Skeleton className="h-14" rounded="lg" />
                </div>
            </div>
            <div className="px-4 py-4">
                <TransactionListSkeleton />
            </div>
        </div>
    );
}

/** Skeleton list of transaction rows (used inside history during refetch). */
export function TransactionListSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <ul className="space-y-2.5">
            {Array.from({ length: rows }).map((_, i) => (
                <li key={i} className="ios-card p-3.5 flex items-center gap-3">
                    <Skeleton className="w-10 h-10 shrink-0" rounded="full" />
                    <div className="flex-1 space-y-1.5 min-w-0">
                        <Skeleton className="h-4 w-32" rounded="md" />
                        <Skeleton className="h-3 w-20" rounded="md" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Skeleton className="h-4 w-20" rounded="md" />
                        <Skeleton className="h-3 w-12" rounded="md" />
                    </div>
                </li>
            ))}
        </ul>
    );
}

// ============================================================================
// Building blocks
// ============================================================================

function CardBlockSkeleton({ lines = 3 }: { lines?: number }) {
    return (
        <div className="ios-card-elev p-4 space-y-3">
            <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" rounded="md" />
                <Skeleton className="h-4 w-12" rounded="full" />
            </div>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className={`h-3.5 ${i % 2 === 0 ? 'w-full' : 'w-4/5'}`}
                    rounded="md"
                />
            ))}
        </div>
    );
}

function CardStatSkeleton() {
    return (
        <div className="ios-card p-4 space-y-2">
            <Skeleton className="h-3 w-20" rounded="md" />
            <Skeleton className="h-7 w-24" rounded="md" />
            <Skeleton className="h-3 w-16" rounded="md" />
        </div>
    );
}

function ListRowSkeleton() {
    return (
        <div className="ios-card p-4 flex items-center gap-3">
            <Skeleton className="w-10 h-10 shrink-0" rounded="full" />
            <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/5" rounded="md" />
                <Skeleton className="h-3 w-3/5" rounded="md" />
            </div>
            <Skeleton className="w-5 h-5 shrink-0" rounded="full" />
        </div>
    );
}

/**
 * Convenience wrapper that renders an h-screen vertical-centered skeleton
 * for cases where you need a simple "page is mounting" placeholder.
 */
export function CenteredSkeleton({ children }: { children?: ReactNode }) {
    return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
            <div className="w-full max-w-md space-y-3">
                {children ?? (
                    <>
                        <Skeleton className="h-6 w-3/4" rounded="md" />
                        <Skeleton className="h-32 w-full" rounded="xl" />
                        <Skeleton className="h-4 w-1/2" rounded="md" />
                    </>
                )}
            </div>
        </div>
    );
}
