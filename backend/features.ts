export const globalFeatureConfig = {
  balanceAdjustment: {
    enabled: false,
    label: 'Account Balance Adjustment',
    description: 'Reconcile account balances against the actual cash, wallet, or bank balance.',
  },
} as const;

export type GlobalFeatureId = keyof typeof globalFeatureConfig;
