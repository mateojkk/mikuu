import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, arbitrum } from '@reown/appkit/networks';
import "./index.css";
import App from "./App.tsx";

// 1. Get projectId from https://cloud.reown.com
const projectId = '13341d916db3579c966fe7d6852649be';

const tempoChain = {
  id: 42431,
  chainNamespace: 'eip155',
  name: "Tempo Testnet",
  nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.moderato.tempo.xyz"] },
  },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.tempo.xyz" },
  },
} as const;

const networks = [tempoChain, mainnet, arbitrum] as any;

// 3. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks
});

// 4. Create AppKit
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: 'payme',
    description: 'send money on tempo',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://payme-tempo.vercel.app',
    icons: [] // Removing non-existent icon to avoid loading issues
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#0052ff',
    '--w3m-border-radius-master': '1px'
  }
});

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
