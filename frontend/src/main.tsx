import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import App from "./App.tsx";

// Define the Tempo chain
const tempoChain = {
  id: 42431,
  name: "Tempo Testnet",
  nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.moderato.tempo.xyz"] },
  },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.tempo.xyz" },
  },
} as const;

const config = getDefaultConfig({
  appName: "payme",
  projectId: "13341d916db3579c966fe7d6852649be",
  chains: [tempoChain],
  ssr: true, // If using Next.js/SSR, but good to have for consistency
  transports: {
    [tempoChain.id]: http("https://rpc.moderato.tempo.xyz"),
  },
});

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#0052ff",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
