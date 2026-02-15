import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';
import { WagmiProvider } from 'wagmi';
import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Simple mock config for testing
const config = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http() },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('App Smoke Test', () => {
  it('renders the main application brand name', () => {
    render(
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    );
    
    // Be specific to avoid "multiple elements found" error
    expect(screen.getByRole('heading', { name: /payme/i, level: 1 })).toBeDefined();
  });
});
