// intersendWagmiWallet.ts

import {
    type ConnectParam,
    type EIP1193Provider,
  } from '@particle-network/auth-core';
  import type { EVMProvider } from '@particle-network/auth-core-modal/dist/context/evmProvider';
  import {
    ChainNotConfiguredError,
    createConnector,
    normalizeChainId,
  } from '@wagmi/core';
  import {
    SwitchChainError,
    UserRejectedRequestError,
    getAddress,
    numberToHex,
    type ProviderRpcError,
  } from 'viem';
  
  import { IntersendSdkClient } from './IntersendSdkClient';
  
  /**
   * Example Intersend-based WAGMI Connector for Particle.
   *
   * We mimic the structure and method signatures from particleWagmiWallet.ts,
   * but use postMessage communication via IntersendSdkClient.
   */
  export function intersendWagmiWallet(param?: ConnectParam) {
    type Provider = EIP1193Provider;
    type Properties = any; // Adjust as needed for your environment
  
    return createConnector<Provider, Properties>((config) => ({
      id: 'intersendWalletSDK',
      name: 'Intersend Wallet',
      type: 'intersendWallet' as const,
  
      /**
       * Called when the user or app attempts to connect the wallet.
       */
      async connect({ chainId }: { chainId?: number } = {}) {
        try {
          // 1. Initialize Intersend if not already done
          await IntersendSdkClient.init();
          const provider = await this.getProvider();
  
          // 2. Request accounts
          const accounts = await provider.request({
            method: 'eth_requestAccounts',
          });
          const normalizedAccounts = accounts.map((addr: string) => getAddress(addr));
  
          // 3. Subscribe to events
          provider.on?.('accountsChanged', this.onAccountsChanged);
          provider.on?.('chainChanged', this.onChainChanged);
          provider.on?.('disconnect', this.onDisconnect.bind(this));
  
          // 4. Attempt chain switch if chainId provided
          let currentChainId = await this.getChainId();
          if (chainId && currentChainId !== chainId) {
            const chain = await this.switchChain!({ chainId }).catch((error) => {
              if (error.code === UserRejectedRequestError.code) throw error;
              return { id: currentChainId };
            });
            currentChainId = chain?.id ?? currentChainId;
          }
  
          return {
            accounts: normalizedAccounts,
            chainId: currentChainId,
          };
        } catch (error: any) {
          if (error.code === 4011) {
            // Example code for user rejection
            throw new UserRejectedRequestError(error as Error);
          }
          throw error;
        }
      },
  
      /**
       * Called to terminate the session.
       */
      async disconnect() {
        const provider = await this.getProvider();
  
        provider.removeListener?.('accountsChanged', this.onAccountsChanged);
        provider.removeListener?.('chainChanged', this.onChainChanged);
        provider.removeListener?.('disconnect', this.onDisconnect.bind(this));
  
        // If your Intersend logic supports a "disconnect" call, do it here
        if (typeof provider?.disconnect === 'function') {
          await provider.disconnect();
        }
      },
  
      /**
       * Return the current accounts.
       */
      async getAccounts() {
        const provider = await this.getProvider();
        const accounts = await provider.request({
          method: 'eth_accounts',
        });
        return accounts.map((x: string) => getAddress(x));
      },
  
      /**
       * Get the current chainId (normalized).
       */
      async getChainId() {
        const provider = await this.getProvider();
        const chainId = await provider.request({ method: 'eth_chainId' });
        return normalizeChainId(chainId);
      },
  
      /**
       * Wait for the Intersend provider to be available and return it.
       */
      async getProvider() {
        // Ensure Intersend has time to load (similar to the wait in particle code).
        while (!IntersendSdkClient.getProvider()) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return IntersendSdkClient.getProvider();
      },
  
      /**
       * If the wallet is already connected.
       */
      async isAuthorized() {
        try {
          // Check via Intersend if we have an address
          const address = IntersendSdkClient.getAddress();
          return Boolean(address);
        } catch {
          return false;
        }
      },
  
      /**
       * Switch chain if supported by your Intersend logic.
       * Otherwise, you can throw or implement adding new chains, etc.
       */
      async switchChain({ chainId }: { chainId: number }) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());
  
        const provider = await this.getProvider();
        const chainIdHex = numberToHex(chain.id);
  
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
          return chain;
        } catch (error: any) {
          // 4902 indicates chain is not added
          if ((error as ProviderRpcError).code === 4902) {
            try {
              await provider.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: chainIdHex,
                    chainName: chain.name,
                    nativeCurrency: chain.nativeCurrency,
                    rpcUrls: [chain.rpcUrls.default?.http[0] ?? ''],
                    blockExplorerUrls: [chain.blockExplorers?.default.url],
                  },
                ],
              });
              return chain;
            } catch (addError) {
              throw new UserRejectedRequestError(addError as Error);
            }
          }
          throw new SwitchChainError(error as Error);
        }
      },
  
      /**
       * Handles `accountsChanged` events from Intersend.
       */
      onAccountsChanged(accounts: string[]) {
        if (accounts.length === 0) {
          config.emitter.emit('disconnect');
        } else {
          config.emitter.emit('change', {
            accounts: accounts.map((x) => getAddress(x)),
          });
        }
      },
  
      /**
       * Handles `chainChanged` events from Intersend.
       */
      onChainChanged(chain: string | number) {
        const chainId = normalizeChainId(chain);
        config.emitter.emit('change', { chainId });
      },
  
      /**
       * Called when the wallet signals a disconnect event.
       */
      async onDisconnect(_error: any) {
        config.emitter.emit('disconnect');
  
        const provider = await this.getProvider();
        provider.removeListener?.('accountsChanged', this.onAccountsChanged);
        provider.removeListener?.('chainChanged', this.onChainChanged);
        provider.removeListener?.('disconnect', this.onDisconnect.bind(this));
      },
    }));
  }
  