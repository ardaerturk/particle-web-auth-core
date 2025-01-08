// index.ts
import type { Wallet, WalletDetailsParams } from '@rainbow-me/rainbowkit';
import { createConnector } from 'wagmi';
import { intersendWagmiWallet } from './intersendWagmiWallet';

/**
 * Example icons for demonstration only.
 * Replace with your real Intersend wallet icons or placeholders.
 */
const intersendIcon = 'https://storage.cloud.google.com/external-assets-intersend/Emblem%20(1).png';
/**
 * The default Intersend wallet.
 */
export const intersendWallet = (): Wallet => ({
  id: 'intersend',
  name: 'Intersend Wallet',
  iconUrl: async () => intersendIcon,
  iconBackground: '#fff',
  installed: true,
  createConnector: (walletDetails: WalletDetailsParams) =>
    createConnector((config) => ({
      ...intersendWagmiWallet()(config),
      ...walletDetails,
    })),
});