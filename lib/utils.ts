import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert ipfs://... to a public HTTP gateway URL
export function toGatewayUrl(url?: string | null, gatewayBase = "https://ipfs.io/ipfs/") {
  if (!url) return ""
  if (url.startsWith("ipfs://")) {
    // normalize ipfs://ipfs/<cid> and ipfs://<cid>
    const path = url.replace(/^ipfs:\/\//, "").replace(/^ipfs\//, "")
    return gatewayBase.replace(/\/$/, "/") + "/" + path.replace(/^\//, "")
  }
  return url
}
