"use client"

import { createConfig, http } from "wagmi"
import { createWeb3Modal } from "@web3modal/wagmi/react"
import { monadTestnet } from "./config"

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || ""

if (!projectId) {
  console.warn("NEXT_PUBLIC_WC_PROJECT_ID is not set")
}

export const config = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(),
  },
})

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: false,
  enableOnramp: false,
})
