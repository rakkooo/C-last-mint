"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useAccount, useReadContracts, useReadContract, useDisconnect, useWalletClient, usePublicClient } from "wagmi"
import { useWeb3Modal } from "@web3modal/wagmi/react"
import { decodeEventLog, parseEther, keccak256, numberToHex, padHex, concatHex } from "viem"
import toast from "react-hot-toast"
import { useInterval } from "usehooks-ts"
import dynamic from "next/dynamic"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Terminal,
  CheckCircle,
  Loader,
  Wallet,
  Flame,
  PartyPopper,
  Clock,
  ExternalLink,
  Shield,
  LogOut,
} from "lucide-react"

import {
  MONAD_PHASED_NFT_ABI,
  ERC721_ABI,
  ERC721A_TOKENS_OF_OWNER_ABI,
  ERC721A_WALLET_OF_OWNER_ABI,
  NFT_CONTRACT_ADDRESS,
  BURN_COLLECTIONS,
  PHASES_CONFIG,
  ACTIVE_PHASE_KEY,
  ENABLE_BURN_TO_MINT,
  monadTestnet,
  CONTRACT_OWNER_ADDRESS,
} from "@/lib/config"
import { toGatewayUrl } from "@/lib/utils"

const MAX_TOKEN_ENUMERATION = 10

// Dynamic import for AdminPanel to avoid SSR issues
const AdminPanel = dynamic(() => import("./admin-panel").then((m) => m.AdminPanel), { ssr: false })

interface ProofData {
  [address: string]: {
    maxAllowed: string
    proof: string[]
  }
}

function getFriendlyErrorMessage(error: any): string {
  const defaultMessage = "An error occurred. Please try again."
  if (!error) return defaultMessage

  const message = error.shortMessage || error.message || ""

  if (message.includes("exceeds allowed")) return "Minting failed: Requested quantity exceeds your allowance."
  if (message.includes("phase not active")) return "Minting is not currently active."
  if (message.includes("phase sold out")) return "Sold out."
  if (message.includes("not whitelisted")) return "Your wallet is not whitelisted."
  if (message.includes("exceeds max per tx")) return "Quantity exceeds the maximum allowed per transaction."
  if (message.includes("User rejected the request")) return "Transaction rejected in wallet."
  if (message.includes("collection not allowed")) return "This NFT collection is not allowed for burn-to-mint."
  if (message.includes("not owner")) return "You don't own this NFT."
  if (message.includes("insufficient approval")) return "Please approve the NFT first."

  if (error.shortMessage) return error.shortMessage.replace("execution reverted:", "").trim()

  return defaultMessage
}

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return "Ended"
  const d = Math.floor(seconds / (3600 * 24))
  const h = Math.floor((seconds % (3600 * 24)) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

export function MintComponent() {
  const { address, isConnected, chain } = useAccount()
  const { open } = useWeb3Modal()
  const { disconnect } = useDisconnect()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [merkleProof, setMerkleProof] = useState<string[]>([])
  const [maxAllowed, setMaxAllowed] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const [selectedBurnCollection, setSelectedBurnCollection] = useState<string>(BURN_COLLECTIONS[0].address)
  const [selectedBurnTokenId, setSelectedBurnTokenId] = useState<string>("")
  const [manualTokenId, setManualTokenId] = useState<string>("")
  const [useManualInput, setUseManualInput] = useState(false)
  const [enumeratedTokenIds, setEnumeratedTokenIds] = useState<string[]>([])
  const [mintQuantity, setMintQuantity] = useState(1)
  const [showBurnConfirm, setShowBurnConfirm] = useState(false)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [mintStatus, setMintStatus] = useState<"idle" | "signing" | "confirming">("idle")
  const [burnStatus, setBurnStatus] = useState<"idle" | "signing" | "confirming">("idle")
  const [approvalStatus, setApprovalStatus] = useState<"idle" | "signing" | "confirming">("idle")
  const [approvalOverrides, setApprovalOverrides] = useState<Record<string, boolean>>({})
  const [enumerationSupported, setEnumerationSupported] = useState<boolean | null>(null)
  const [collectionImageUrl, setCollectionImageUrl] = useState<string>("")
  const [selectedTokenImageUrl, setSelectedTokenImageUrl] = useState<string>("")
  const [hasAnyBurnNFTs, setHasAnyBurnNFTs] = useState<boolean>(false)
  const [isOwnedCheckLoading, setIsOwnedCheckLoading] = useState<boolean>(false)
  const [proofRoot, setProofRoot] = useState<string | null>(null)
  const [ownedContracts, setOwnedContracts] = useState<Set<string>>(new Set())
  const [collectionChangeTimestamp, setCollectionChangeTimestamp] = useState(0)

  useInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)

  const nftContract = { address: NFT_CONTRACT_ADDRESS, abi: MONAD_PHASED_NFT_ABI } as const

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!address || !isConnected) {
        setMerkleProof([])
        setMaxAllowed(0)
        setProofRoot(null)
        return
      }

      const { proofFile } = PHASES_CONFIG[ACTIVE_PHASE_KEY]
      if (!proofFile) {
        setProofRoot(null)
        return
      }

      try {
        // Build a cache-busting URL using optional version param for local dev
        const version = process.env.NEXT_PUBLIC_PROOF_VERSION || ""
        const proofUrl = version
          ? `${proofFile}${proofFile.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`
          : proofFile
        const res = await fetch(proofUrl, { cache: 'no-store' })
        if (!res.ok) throw new Error('failed to load')

        const data: any = await res.json()
        if (cancelled) return

        const lower = address.toLowerCase()
        const entries = (data?.entries as any) || data
        const entry = entries ? entries[lower] : undefined
        setMaxAllowed(entry ? Number(entry.maxAllowed) : 0)
        setMerkleProof(entry ? entry.proof : [])
        if (data?.root && typeof data.root === "string") setProofRoot(data.root)
        else {
          // optional separate root file
          try {
            const version = process.env.NEXT_PUBLIC_PROOF_VERSION || ""
            const rootUrl = version ? `/merkle/root.json?v=${encodeURIComponent(version)}` : "/merkle/root.json"
            const rr = await fetch(rootUrl, { cache: "no-store" })
            if (rr.ok) {
              const rj = await rr.json()
              if (rj?.root) setProofRoot(rj.root)
            }
          } catch {}
        }
      } catch {
        if (cancelled) return
        setMaxAllowed(0)
        setMerkleProof([])
        setProofRoot(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [address, isConnected])

  // Helper: compute leaf = keccak256(abi.encodePacked(address, uint256(maxAllowed)))
  const computeLeaf = useCallback((addr: string, max: number | string | bigint) => {
    const a = (addr || "").toLowerCase() as `0x${string}`
    const amount = BigInt(max || 0)
    const packed = concatHex([a, padHex(numberToHex(amount), { size: 32 })])
    return keccak256(packed)
  }, [])

  const hashPairSorted = useCallback((a: `0x${string}`, b: `0x${string}`) => {
    const al = a.toLowerCase() as `0x${string}`
    const bl = b.toLowerCase() as `0x${string}`
    return al <= bl ? keccak256(concatHex([al, bl])) : keccak256(concatHex([bl, al]))
  }, [])

  const computeRootFromProof = useCallback(
    (leaf: `0x${string}`, proof: `0x${string}`[]) => {
      let h = leaf
      for (const p of proof) h = hashPairSorted(h, p as `0x${string}`)
      return h
    },
    [hashPairSorted],
  )

  const lowerSelectedCollection = useMemo(() => selectedBurnCollection.toLowerCase(), [selectedBurnCollection])

  const selectedBurnContract = {
    address: selectedBurnCollection as `0x${string}`,
    abi: ERC721_ABI,
  } as const

  // Remove on-chain enumeration detection. Alchemy API is the sole source for owned IDs.
  useEffect(() => {
    setEnumerationSupported(null)
  }, [selectedBurnCollection])

  // Fetch owned token IDs via server API (Alchemy) only if the selected collection is owned
  useEffect(() => {
    if (!address || !isConnected || !selectedBurnCollection) {
      setEnumeratedTokenIds([])
      setSelectedBurnTokenId("")
      return
    }
    // Only run when owned
    const isOwned = ownedContracts.has(selectedBurnCollection.toLowerCase())
    if (!isOwned) {
      setEnumeratedTokenIds([])
      setSelectedBurnTokenId("")
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const url = `/api/owned-ids?c=${selectedBurnCollection}&u=${address}&limit=${MAX_TOKEN_ENUMERATION}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error('failed')
        const json = await res.json()
        const ids: string[] = (json?.ids as string[]) || []
        if (!cancelled) {
          setEnumeratedTokenIds(ids)
          if (!selectedBurnTokenId && ids.length > 0) setSelectedBurnTokenId(ids[0])
        }
      } catch {
        if (!cancelled) {
          setEnumeratedTokenIds([])
          setSelectedBurnTokenId("")
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [address, isConnected, selectedBurnCollection, collectionChangeTimestamp, selectedBurnTokenId, ownedContracts])

  // Alchemy-only: no client-side on-chain fallback

  // Keep dropdown UX; no forced manual input even if Enumerable is unsupported

  // Read collection-level metadata via contractURI and display image/logo
  const { data: contractUriRaw } = useReadContract({
    ...selectedBurnContract,
    functionName: "contractURI",
    query: { enabled: !!selectedBurnCollection },
  })
  useEffect(() => {
    setCollectionImageUrl("")
    const uri = (contractUriRaw as string) || ""
    if (!uri) return
    const resolved = toGatewayUrl(uri)
    fetch(resolved)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return
        const img = toGatewayUrl(json.image || json.logo || json.image_url)
        if (img) setCollectionImageUrl(img)
      })
      .catch(() => {})
  }, [contractUriRaw, selectedBurnCollection])

  // Resolve token image for preview in confirmation dialog
  const tokenIdToPreview = useMemo(() => (useManualInput ? manualTokenId : selectedBurnTokenId).trim(), [
    useManualInput,
    manualTokenId,
    selectedBurnTokenId,
  ])
  const { data: tokenUriRaw } = useReadContract({
    ...selectedBurnContract,
    functionName: "tokenURI",
    args: tokenIdToPreview && /^\d+$/.test(tokenIdToPreview) ? [BigInt(tokenIdToPreview)] : undefined,
    query: { enabled: !!tokenIdToPreview && /^\d+$/.test(tokenIdToPreview) },
  })
  useEffect(() => {
    setSelectedTokenImageUrl("")
    const uri = (tokenUriRaw as string) || ""
    if (!uri) return
    const resolved = toGatewayUrl(uri)
    fetch(resolved)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return
        const img = toGatewayUrl(json.image || json.image_url)
        if (img) setSelectedTokenImageUrl(img)
      })
      .catch(() => {})
  }, [tokenUriRaw])

  const activePhase = PHASES_CONFIG[ACTIVE_PHASE_KEY]
  const activePhaseId = activePhase.id

  const { data: contractData, refetch } = useReadContracts({
    contracts: [
      { ...nftContract, functionName: "phases", args: [BigInt(activePhaseId)] },
      { ...nftContract, functionName: "totalSupply" },
    ],
    query: { refetchInterval: 30000 },
  })

  const phaseData = useMemo(() => {
    if (!contractData?.[0]?.result) return null
    return contractData[0].result
  }, [contractData])

  const totalMinted = useMemo(() => {
    if (!contractData?.[1]?.result) return 0
    return Number(contractData[1].result)
  }, [contractData])

  useEffect(() => {
    if (!phaseData) return
    const startTime = Number(phaseData[5])
    const endTime = Number(phaseData[6])
    setIsActive(now >= startTime && now < endTime)
  }, [phaseData, now])

  const { data: mintedAmount, refetch: refetchMintedAmount } = useReadContract({
    ...nftContract,
    functionName: "mintedPerPhase",
    args: [activePhaseId, address!],
    query: { enabled: !!address && isActive && isConnected },
  })

  const { data: remainingMints, refetch: refetchRemainingMints } = useReadContract({
    ...nftContract,
    functionName: "getRemainingMints",
    args: [activePhaseId, address!, activePhase.proofFile ? BigInt(maxAllowed) : BigInt(0)],
    query: {
      enabled: !!address && isActive && isConnected && (activePhase.proofFile ? maxAllowed > 0 : true),
    },
  })

  const { data: isApprovedForAll, refetch: refetchApproval } = useReadContract({
    ...selectedBurnContract,
    functionName: "isApprovedForAll",
    args: [address!, NFT_CONTRACT_ADDRESS],
    query: { enabled: !!address && isConnected },
  })

  const effectiveIsApproved = approvalOverrides[lowerSelectedCollection] ?? Boolean(isApprovedForAll)

  useEffect(() => {
    if (address && isActive && isConnected) {
      refetchMintedAmount()
      if (maxAllowed > 0) refetchRemainingMints()
    }
  }, [address, isActive, maxAllowed, refetchMintedAmount, refetchRemainingMints, isConnected])

  const showMintSuccessToast = useCallback(
    (hash: `0x${string}`, details?: { quantity?: bigint; firstTokenId?: bigint; tokenId?: bigint }) => {
      toast.custom(
        () => (
          <div className="max-w-md w-full bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 shadow-2xl rounded-2xl p-6 border-2 border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-3 rounded-full">
                <PartyPopper className="h-8 w-8 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Mint Successful!
            </h3>
            {details && (
              <div className="text-center mb-4">
                {details.quantity !== undefined && (
                  <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    You minted {details.quantity.toString()} NFT(s)
                  </p>
                )}
                {(details.firstTokenId !== undefined || details.tokenId !== undefined) && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Token ID:
                    {details.firstTokenId !== undefined ? details.firstTokenId.toString() : details.tokenId?.toString()}
                  </p>
                )}
              </div>
            )}
            <a
              href={`${monadTestnet.blockExplorers.default.url}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg transition-all shadow-lg"
            >
              View on Explorer
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ),
        { duration: 10000, position: "top-center" },
      )
    },
    [],
  )

  const handleDisconnect = () => {
    disconnect()
    // Reset all states
    setMerkleProof([])
    setMaxAllowed(0)
    setSelectedBurnTokenId("")
    setManualTokenId("")
    setUseManualInput(false)
    // no-op
    setMintQuantity(1)
    setIsActive(false)
    setApprovalOverrides({})
    setMintStatus("idle")
    setBurnStatus("idle")
    setApprovalStatus("idle")
  }

  const handleNormalMint = async () => {
    if (!walletClient || !publicClient) {
      toast.error("Wallet client is not ready. Please reconnect your wallet.")
      return
    }

    if (!isEligible) {
      toast.error("Your wallet is not on the whitelist.")
      return
    }

    if (maxSelectableMint <= 0) {
      toast.error("You have reached the mint limit.")
      return
    }

    if (mintQuantity > maxSelectableMint) {
      setMintQuantity(maxSelectableMint)
      toast.error("Selected quantity exceeds the allowed maximum.")
      return
    }

    if (isWrongNetwork) {
      toast.error(`Please switch to the ${monadTestnet.name}.`)
      return
    }

    try {
      // Preflight: re-check remaining mints on-chain just before sending
      try {
        const pre = (await publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: MONAD_PHASED_NFT_ABI,
          functionName: "getRemainingMints",
          args: [
            activePhaseId,
            address!,
            isWhitelistPhase ? BigInt(maxAllowed) : BigInt(0),
          ],
        })) as bigint
        const allowedNow = Number(pre)
        if (!Number.isFinite(allowedNow) || allowedNow <= 0) {
          toast.error("You have reached the mint limit.")
          return
        }
        if (mintQuantity > allowedNow) {
          setMintQuantity(allowedNow)
          toast.error("Selected quantity exceeds the allowed maximum.")
          return
        }
      } catch {
        // If preflight fails, block to avoid sending stale-guarded tx
        toast.error("Unable to verify allowance. Please try again.")
        return
      }

      // Client-side self verification of merkle proof (if WL phase)
      if (isWhitelistPhase) {
        if (!merkleProof || merkleProof.length === 0 || maxAllowed <= 0) {
          toast.error("Proof not available. Please refresh your proof.")
          return
        }
        try {
          const leaf = computeLeaf(address!, maxAllowed) as `0x${string}`
          const computedRoot = computeRootFromProof(leaf, merkleProof as `0x${string}`[])
          const onchainRoot = phaseData ? (phaseData[1] as string) : null
          const expectedRoot = (proofRoot || onchainRoot || "").toLowerCase()
          if (!expectedRoot || computedRoot.toLowerCase() !== expectedRoot) {
            toast.error("Proof mismatch with contract root. Please refresh proof.")
            return
          }
        } catch {
          toast.error("Failed to verify proof locally.")
          return
        }
      }

      setMintStatus("signing")
      const pricePerNft = parseEther(activePhase.price)
      const totalValue = isWhitelistPhase ? BigInt(0) : pricePerNft * BigInt(mintQuantity)
      const hash = await walletClient.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: MONAD_PHASED_NFT_ABI,
        functionName: "mint",
        args: [
          activePhaseId,
          BigInt(mintQuantity),
          isWhitelistPhase ? BigInt(maxAllowed) : BigInt(0),
          (isWhitelistPhase ? (merkleProof as `0x${string}`[]) : []) as `0x${string}`[],
        ],
        value: totalValue,
      })

      setMintStatus("confirming")
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      let details: { quantity?: bigint; firstTokenId?: bigint } | undefined
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== NFT_CONTRACT_ADDRESS.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({ abi: MONAD_PHASED_NFT_ABI, data: log.data, topics: log.topics })
          if (decoded.eventName === "BatchMinted") {
            details = {
              quantity: decoded.args?.quantity,
              firstTokenId: decoded.args?.firstTokenId,
            }
            break
          }
        } catch {
          /* noop */
        }
      }

      showMintSuccessToast(hash, details)
      // Refresh contract reads and wait before re-enabling
      try {
        await Promise.all([
          refetch(),
          refetchMintedAmount(),
          maxAllowed > 0 ? refetchRemainingMints() : Promise.resolve(null),
        ])
      } catch {
        /* noop */
      }
    } catch (error) {
      console.error("Mint failed", error)
      toast.error(getFriendlyErrorMessage(error), { duration: 6000 })
    } finally {
      setMintStatus("idle")
    }
  }

  const handleApproveAll = async () => {
    if (!walletClient || !publicClient) {
      toast.error("Wallet client is not ready. Please reconnect your wallet.")
      return
    }

    try {
      setApprovalStatus("signing")
      const hash = await walletClient.writeContract({
        address: selectedBurnCollection as `0x${string}`,
        abi: ERC721_ABI,
        functionName: "setApprovalForAll",
        args: [NFT_CONTRACT_ADDRESS, true],
      })

      setApprovalStatus("confirming")
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success("Collection approved successfully.")
      setApprovalOverrides((prev) => ({ ...prev, [lowerSelectedCollection]: true }))
      refetchApproval()
    } catch (error) {
      console.error("Approval failed", error)
      toast.error(getFriendlyErrorMessage(error), { duration: 6000 })
    } finally {
      setApprovalStatus("idle")
    }
  }

  const handleBurnMintConfirm = () => {
    setShowBurnConfirm(true)
  }

  const handleBurnMint = async () => {
    setShowBurnConfirm(false)

    if (!walletClient || !publicClient) {
      toast.error("Wallet client is not ready. Please reconnect your wallet.")
      return
    }

    if (isWrongNetwork) {
      toast.error(`Please switch to the ${monadTestnet.name}.`)
      return
    }

    const tokenIdToUse = useManualInput ? manualTokenId : selectedBurnTokenId

    if (!tokenIdToUse) {
      toast.error("Select an NFT to burn.")
      return
    }

    try {
      setBurnStatus("signing")
      const tokenId = tokenIdToUse.trim()
      if (!/^\d+$/.test(tokenId)) {
        toast.error("Invalid token ID.")
        setBurnStatus("idle")
        return
      }

      const hash = await walletClient.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: MONAD_PHASED_NFT_ABI,
        functionName: "burnToMint",
        args: [selectedBurnCollection as `0x${string}`, BigInt(tokenId)],
      })

      setBurnStatus("confirming")
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      let mintedTokenId: bigint | undefined

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== NFT_CONTRACT_ADDRESS.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({ abi: MONAD_PHASED_NFT_ABI, data: log.data, topics: log.topics })
          if (decoded.eventName === "BurnToMint") {
            mintedTokenId = decoded.args?.mintedTokenId
            break
          }
        } catch {
          /* noop */
        }
      }

      showMintSuccessToast(hash, { tokenId: mintedTokenId })

      setSelectedBurnTokenId("")
      setManualTokenId("")
      // Refresh reads (including remaining mints, which consider supply)
      try {
        await Promise.all([
          refetch(),
          refetchMintedAmount(),
          maxAllowed > 0 ? refetchRemainingMints() : Promise.resolve(null),
          (async () => { await refetchApproval() })(),
        ])
      } catch {
        /* noop */
      }
    } catch (error) {
      console.error("Burn to mint failed", error)
      toast.error(getFriendlyErrorMessage(error), { duration: 6000 })
    } finally {
      setBurnStatus("idle")
    }
  }

  const isWrongNetwork = useMemo(() => isConnected && chain?.id !== monadTestnet.id, [isConnected, chain])
  const isSoldOut = phaseData ? phaseData[3] >= phaseData[2] : false
  const isWhitelistPhase = Boolean(activePhase.proofFile)
  const isEligible = isWhitelistPhase ? maxAllowed > 0 : true
  // Safe fallback: if remainingMints is not yet fetched, treat as 0 to avoid enabling premature sends
  const rawRemainingMints =
    remainingMints !== undefined ? Number(remainingMints) : 0
  const userRemainingMints = Number.isFinite(rawRemainingMints) ? Math.max(0, rawRemainingMints) : 0
  const hasMintedMax = isEligible && userRemainingMints <= 0

  const hasBurnNFTs = hasAnyBurnNFTs

  const isOwner = useMemo(
    () => isConnected && address?.toLowerCase() === CONTRACT_OWNER_ADDRESS.toLowerCase(),
    [isConnected, address],
  )

  // UX: display "owned / max" for the connected wallet.
  // WL phase: we already know "maxAllowed" and "userRemainingMints"
  //   minted = maxAllowed - userRemainingMints
  //   total cap = maxAllowed
  // non-WL phase: fall back to on-chain mintedAmount + remainingMints
  const mintedCount = isWhitelistPhase
    ? Math.max(0, Math.min(maxAllowed, maxAllowed - userRemainingMints))
    : mintedAmount !== undefined
      ? Number(mintedAmount)
      : 0

  const userTotalCap = isWhitelistPhase
    ? maxAllowed
    : mintedCount + userRemainingMints

  const phaseMaxPerTx = Math.max(0, phaseData ? Number(phaseData[4]) : activePhase.maxPerTx)
  const maxSelectableMint = isEligible ? Math.max(0, Math.min(userRemainingMints, phaseMaxPerTx)) : 0


  const mintOptions = useMemo(() => {
    if (maxSelectableMint <= 0) return []
    return Array.from({ length: maxSelectableMint }, (_, i) => i + 1)
  }, [maxSelectableMint])

  useEffect(() => {
    if (maxSelectableMint <= 0) {
      setMintQuantity(1)
      return
    }

    setMintQuantity((prev) => {
      if (prev < 1) return 1
      if (prev > maxSelectableMint) return maxSelectableMint
      return prev
    })
  }, [maxSelectableMint])

  const endTime = phaseData ? Number(phaseData[6]) : 0
  const timeRemaining = endTime - now

  const selectedCollectionName =
    BURN_COLLECTIONS.find((c) => c.address.toLowerCase() === selectedBurnCollection.toLowerCase())?.name || ""

  const totalTokenCount = enumeratedTokenIds.length

  // Check which collections the user owns (Alchemy), to avoid calling per-collection API for non-owned
  useEffect(() => {
    if (!address || !isConnected) {
      setHasAnyBurnNFTs(false)
      setOwnedContracts(new Set())
      setIsOwnedCheckLoading(false)
      return
    }
    let cancelled = false
    const run = async () => {
      setIsOwnedCheckLoading(true)
      try {
        const params = BURN_COLLECTIONS.map((c) => `c=${c.address}`).join("&")
        const url = `/api/owned-check?${params}&u=${address}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error('failed')
        const json = await res.json()
        const addrs: string[] = (json?.owned as string[]) || []
        if (!cancelled) {
          setHasAnyBurnNFTs(addrs.length > 0)
          setOwnedContracts(new Set(addrs.map((a) => a.toLowerCase())))
        }
      } catch {
        if (!cancelled) {
          setHasAnyBurnNFTs(false)
          setOwnedContracts(new Set())
        }
      } finally {
        if (!cancelled) setIsOwnedCheckLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [address, isConnected])

  return (
    <div className="w-full max-w-3xl mx-auto">
      <Card className="shadow-2xl border-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl overflow-hidden">
        <CardHeader className="space-y-4 pb-4 bg-gradient-to-br from-purple-50/50 via-pink-50/50 to-purple-50/50 dark:from-purple-950/30 dark:via-pink-950/30 dark:to-purple-950/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-4xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent">
              C's Family GTD NFT
            </CardTitle>
            {isConnected ? (
              <div className="flex items-center gap-3 ml-auto">
                <div className="px-5 py-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl text-sm font-bold border border-purple-200/50 dark:border-purple-800/50 shadow-lg">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  className="gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800 transition-all bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border-gray-200/50 dark:border-gray-700/50 rounded-xl font-semibold"
                >
                  <LogOut className="h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => open()}
                size="lg"
                className="ml-auto gap-2 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-700 hover:via-pink-700 hover:to-purple-700 shadow-xl hover:shadow-2xl transition-all rounded-2xl px-8 py-6 text-lg font-bold"
              >
                <Wallet className="h-5 w-5" />
                Connect Wallet
              </Button>
            )}
          </div>

          {/* Subtitle / description under the title */}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            C's Family NFT will be airdropped on mainnet to wallets holding this GTD NFT.
          </p>

          {isWrongNetwork && (
            <Alert variant="destructive">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Wrong Network</AlertTitle>
              <AlertDescription>Please switch to {monadTestnet.name} to continue.</AlertDescription>
            </Alert>
          )}
        </CardHeader>

      <CardContent className="space-y-8 p-8">
        <div className="grid grid-cols-1 gap-6">
          {/* Total minted across the collection */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-purple-100 via-pink-100 to-purple-100 dark:from-purple-900/50 dark:via-pink-900/50 dark:to-purple-900/50 border-2 border-purple-200/50 dark:border-purple-800/50 shadow-xl">
            <div className="flex justify-between items-center">
              <span className="text-base font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Total Minted
              </span>
              <span className="text-5xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent">
                {totalMinted}
              </span>
            </div>
          </div>

          {/* Connected wallet status: owned / max */}
          {isConnected && userTotalCap > 0 && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-50 to-lime-50 dark:from-emerald-900/40 dark:to-lime-900/40 border-2 border-emerald-200/60 dark:border-emerald-700/60 shadow-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/90">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-200 uppercase tracking-wide">
                    Your GTD Status
                  </span>
                </div>
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-300">
                {mintedCount} / {userTotalCap}
              </div>
            </div>
          )}

          {isActive && timeRemaining > 0 && (
            <div className="flex items-center justify-center gap-3 text-base font-bold text-gray-700 dark:text-gray-300 p-6 rounded-3xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 border-2 border-blue-200/50 dark:border-blue-800/50 shadow-lg">
              <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <span>
                Phase ends in:{" "}
                <strong className="text-blue-600 dark:text-blue-400">
                  {formatDuration(timeRemaining)}
                </strong>
              </span>
            </div>
          )}
        </div>

        {!isConnected ? (
            <div className="text-center py-16">
              <Wallet className="h-20 w-20 mx-auto mb-6 text-purple-400 dark:text-purple-600" />
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-3">Connect Your Wallet</p>
              <p className="text-base text-gray-500 dark:text-gray-400">Get started by connecting your wallet to mint NFTs</p>
            </div>
          ) : !isActive ? (
            <div className="text-center py-16">
              <Alert className="border-2 rounded-3xl shadow-lg">
                <Clock className="h-6 w-6" />
                <AlertTitle className="text-xl font-bold">Minting Not Active</AlertTitle>
                <AlertDescription>Minting is currently closed. Please check back later.</AlertDescription>
              </Alert>
            </div>
          ) : isSoldOut ? (
            <div className="text-center py-8">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Sold Out</AlertTitle>
                <AlertDescription>All NFTs have been minted!</AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="space-y-6">
              {isWhitelistPhase && isOwnedCheckLoading ? (
                <div className="text-center py-8">
                  <Alert>
                    <Loader className="h-4 w-4 animate-spin" />
                    <AlertTitle>Checking eligibility…</AlertTitle>
                    <AlertDescription>Holdings and whitelist are being verified.</AlertDescription>
                  </Alert>
                </div>
              ) : isWhitelistPhase && !isEligible && !hasBurnNFTs ? (
                <div className="text-center py-8">
                  <Alert variant="destructive">
                    <Terminal className="h-4 w-4" />
                    <AlertTitle>Not Eligible</AlertTitle>
                    <AlertDescription>Your wallet is not on the whitelist.</AlertDescription>
                  </Alert>
                </div>
              ) : (
                <>
                  {/* Show WL first if eligible, then Burn to Mint if has NFTs */}
                  {isEligible && (
                    <>
                      {isWhitelistPhase ? (
                        <div className="space-y-4 p-6 rounded-xl border-2 border-purple-300 dark:border-purple-700 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
                          <h3 className="text-xl font-bold text-center flex items-center justify-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            {activePhase.name} Mint
                          </h3>

                          {hasMintedMax ? (
                            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <AlertTitle className="text-green-800 dark:text-green-300">Complete!</AlertTitle>
                              <AlertDescription className="text-green-700 dark:text-green-400">
                                You have minted all {maxAllowed} of your allocated NFTs.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <>
                              <div className="text-center space-y-2">
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  Minted: {maxAllowed - userRemainingMints} / {maxAllowed}
                                </div>
                                <div className="text-3xl font-bold text-green-600">FREE MINT</div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Select Quantity
                                </label>
                                <Select
                                  value={mintQuantity.toString()}
                                  onValueChange={(val) => setMintQuantity(Number(val))}
                                >
                                  <SelectTrigger className="w-full h-12">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {mintOptions.map((num) => (
                                      <SelectItem key={num} value={num.toString()}>
                                        {num} NFT{num > 1 ? "s" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <Button
                                className="w-full h-14 text-lg font-semibold"
                                onClick={handleNormalMint}
                                disabled={mintStatus !== "idle" || isWrongNetwork || hasMintedMax}
                              >
                                {mintStatus === "signing" ? (
                                  <>
                                    <Loader className="mr-2 h-5 w-5 animate-spin" />
                                    Confirm in Wallet...
                                  </>
                                ) : mintStatus === "confirming" ? (
                                  <>
                                    <Loader className="mr-2 h-5 w-5 animate-spin" />
                                    Minting...
                                  </>
                                ) : (
                                  `Mint ${mintQuantity} NFT${mintQuantity > 1 ? "s" : ""}`
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4 p-6 rounded-xl border-2 border-purple-300 dark:border-purple-700 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
                          <h3 className="text-xl font-bold text-center flex items-center justify-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            {activePhase.name} Mint
                          </h3>

                          <div className="text-center space-y-2">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Remaining (per your limit): {userRemainingMints}
                            </div>
                            <div className="text-lg font-semibold">
                              Price: {activePhase.price} {monadTestnet.nativeCurrency.symbol}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Select Quantity
                            </label>
                            <Select
                              value={mintQuantity.toString()}
                              onValueChange={(val) => setMintQuantity(Number(val))}
                            >
                              <SelectTrigger className="w-full h-12">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {mintOptions.map((num) => (
                                  <SelectItem key={num} value={num.toString()}>
                                    {num} NFT{num > 1 ? "s" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            className="w-full h-14 text-lg font-semibold"
                            onClick={handleNormalMint}
                            disabled={mintStatus !== "idle" || isWrongNetwork || userRemainingMints <= 0}
                          >
                            {mintStatus === "signing" ? (
                              <>
                                <Loader className="mr-2 h-5 w-5 animate-spin" />
                                Confirm in Wallet...
                              </>
                            ) : mintStatus === "confirming" ? (
                              <>
                                <Loader className="mr-2 h-5 w-5 animate-spin" />
                                Minting...
                              </>
                            ) : (
                              `Mint ${mintQuantity} NFT${mintQuantity > 1 ? "s" : ""}`
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  {ENABLE_BURN_TO_MINT && hasBurnNFTs && (
                    <div className="space-y-4 p-6 rounded-xl border-2 border-orange-300 dark:border-orange-700 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30">
                      <h3 className="text-xl font-bold text-center flex items-center justify-center gap-2 text-orange-600 dark:text-orange-400">
                        <Flame className="h-5 w-5" />
                        Burn to Mint
                      </h3>

                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertTitle>Eligible NFTs Found</AlertTitle>
                        <AlertDescription>
                          Found {totalTokenCount} token(s) in this collection.
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Select Collection
                        </label>
                        <Select
                          value={selectedBurnCollection}
                          onValueChange={(val) => {
                            setSelectedBurnCollection(val)
                            setSelectedBurnTokenId("")
                            setEnumeratedTokenIds([])
                            setManualTokenId("")
                            setUseManualInput(false)
                            // Delay token enumeration to prevent rapid API calls
                            setTimeout(() => {
                              setCollectionChangeTimestamp(Date.now())
                            }, 300)
                          }}
                        >
                          <SelectTrigger className="w-full h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BURN_COLLECTIONS.map((collection) => (
                              <SelectItem key={collection.address} value={collection.address}>
                                {collection.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {collectionImageUrl && (
                          <div className="flex items-center gap-3 mt-2">
                            <img src={collectionImageUrl} alt={selectedCollectionName} className="h-12 w-12 rounded-md object-cover" loading="eager" decoding="async" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">{selectedCollectionName}</span>
                          </div>
                        )}
                      </div>

                      {false && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                           <input
                             type="checkbox"
                             id="manual-input-toggle"
                             checked={useManualInput}
                             onChange={(e) => setUseManualInput(e.target.checked)}
                             className="h-4 w-4"
                           />
                           <label htmlFor="manual-input-toggle" className="text-sm text-gray-700 dark:text-gray-300">
                              {`Enter token ID manually`}
                        </label>
                        </div>
                      )}

                      {useManualInput ? (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enter Token ID</label>
                          <Input
                            type="text"
                            placeholder="Enter token ID (e.g., 1234)"
                            value={manualTokenId}
                            onChange={(e) => setManualTokenId(e.target.value)}
                            className="w-full h-12"
                          />
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Enter the token ID of the NFT you want to burn.
                          </p>
                        </div>
                      ) : enumeratedTokenIds.length > 0 ? (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Select Token ID
                          </label>
                          <Select value={selectedBurnTokenId} onValueChange={(val) => setSelectedBurnTokenId(val)}>
                            <SelectTrigger className="w-full h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {enumeratedTokenIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                  #{id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {`Showing up to ${MAX_TOKEN_ENUMERATION} token(s).`}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Select Token ID
                          </label>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {ownedContracts.has(selectedBurnCollection.toLowerCase())
                              ? "Loading tokens..."
                              : "No NFTs in this collection"}
                          </div>
                        </div>
                      )}

                      {!effectiveIsApproved ? (
                        <Button
                          className="w-full h-14 text-lg font-semibold gap-2"
                          onClick={handleApproveAll}
                          disabled={approvalStatus !== "idle" || isWrongNetwork || (enumeratedTokenIds.length <= 0 && !manualTokenId)}
                        >
                          {approvalStatus === "signing" ? (
                            <>
                              <Loader className="h-5 w-5 animate-spin" />
                              Confirm in Wallet...
                            </>
                          ) : approvalStatus === "confirming" ? (
                            <>
                              <Loader className="h-5 w-5 animate-spin" />
                              Approving...
                            </>
                          ) : (
                            <>
                              <Shield className="h-5 w-5" />
                              {enumeratedTokenIds.length > 0 || manualTokenId ? "Approve Collection" : "No NFTs to Approve"}
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          className="w-full h-14 text-lg font-semibold gap-2"
                          onClick={handleBurnMintConfirm}
                          disabled={
                            burnStatus !== "idle" ||
                            (!useManualInput && !selectedBurnTokenId) ||
                            (useManualInput && !manualTokenId) ||
                            isWrongNetwork
                          }
                        >
                          {burnStatus === "signing" ? (
                            <>
                              <Loader className="h-5 w-5 animate-spin" />
                              Confirm in Wallet...
                            </>
                          ) : burnStatus === "confirming" ? (
                            <>
                              <Loader className="h-5 w-5 animate-spin" />
                              Burning...
                            </>
                          ) : (
                            <>
                              <Flame className="h-5 w-5" />
                              Burn & Mint{" "}
                              {useManualInput
                                ? manualTokenId
                                  ? `(#${manualTokenId})`
                                  : ""
                                : selectedBurnTokenId
                                  ? `(#${selectedBurnTokenId})`
                                  : ""}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && <AdminPanel onPhaseUpdate={refetch} />}

      {/* Burn Confirmation Dialog */}
      <AlertDialog open={showBurnConfirm} onOpenChange={setShowBurnConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Burn & Mint</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to burn 1 NFT from {selectedCollectionName} and mint a new one. This action is irreversible.
              {selectedTokenImageUrl && (
                <div className="mt-4 flex items-center gap-3">
                  <img src={selectedTokenImageUrl} alt="Token preview" className="h-16 w-16 rounded-md object-cover" loading="eager" decoding="async" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Token preview</span>
                </div>
              )}
              <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Token ID to burn:</p>
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  {useManualInput ? manualTokenId || "-" : selectedBurnTokenId || "-"}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBurnMint} className="bg-orange-600 hover:bg-orange-700">
              Confirm Burn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
