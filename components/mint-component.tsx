"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useAccount, useReadContracts, useReadContract, useDisconnect, useWalletClient, usePublicClient } from "wagmi"
import { useWeb3Modal } from "@web3modal/wagmi/react"
import { decodeEventLog, parseEther, keccak256, numberToHex, padHex, concatHex } from "viem"
import toast from "react-hot-toast"
import { useInterval } from "usehooks-ts"
import dynamic from "next/dynamic"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Terminal,
  CheckCircle,
  Loader,
  Wallet,
  PartyPopper,
  Clock,
  ExternalLink,
  LogOut,
} from "lucide-react"

import {
  MONAD_PHASED_NFT_ABI,
  NFT_CONTRACT_ADDRESS,
  PHASES_CONFIG,
  ACTIVE_PHASE_KEY,
  monadTestnet,
  CONTRACT_OWNER_ADDRESS,
} from "@/lib/config"

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
  const [mintQuantity, setMintQuantity] = useState(1)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [mintStatus, setMintStatus] = useState<"idle" | "signing" | "confirming">("idle")
  const [proofRoot, setProofRoot] = useState<string | null>(null)

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

  const startTime = phaseData ? Number(phaseData[5]) : 0
  const endTime = phaseData ? Number(phaseData[6]) : 0
  const phaseStatus = useMemo<"unknown" | "upcoming" | "active" | "ended">(() => {
    const hasStart = startTime > 0
    const hasEnd = endTime > 0
    if (hasStart && now < startTime) return "upcoming"
    if (hasEnd && now >= endTime) return "ended"
    if (hasStart || hasEnd) return "active"
    return "unknown"
  }, [startTime, endTime, now])
  const isActive = phaseStatus === "active"
  const timeUntilStart = startTime > 0 && now < startTime ? startTime - now : 0
  const timeUntilEnd = endTime > 0 && now < endTime ? endTime - now : 0

  const { data: remainingMints, refetch: refetchRemainingMints } = useReadContract({
    ...nftContract,
    functionName: "getRemainingMints",
    args: [activePhaseId, address!, activePhase.proofFile ? BigInt(maxAllowed) : BigInt(0)],
    query: {
      enabled: !!address && isActive && isConnected && (activePhase.proofFile ? maxAllowed > 0 : true),
    },
  })

  useEffect(() => {
    if (address && isActive && isConnected && maxAllowed > 0) {
      refetchRemainingMints()
    }
  }, [address, isActive, maxAllowed, refetchRemainingMints, isConnected])

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
    setMintQuantity(1)
    setMintStatus("idle")
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

  const isWrongNetwork = useMemo(() => isConnected && chain?.id !== monadTestnet.id, [isConnected, chain])
  const isSoldOut = phaseData ? phaseData[3] >= phaseData[2] : false
  const isWhitelistPhase = Boolean(activePhase.proofFile)
  const isEligible = isWhitelistPhase ? maxAllowed > 0 : true
  // Safe fallback: if remainingMints is not yet fetched, treat as 0 to avoid enabling premature sends
  const rawRemainingMints =
    remainingMints !== undefined ? Number(remainingMints) : 0
  const userRemainingMints = Number.isFinite(rawRemainingMints) ? Math.max(0, rawRemainingMints) : 0
  const hasMintedMax = isEligible && userRemainingMints <= 0

  const isOwner = useMemo(
    () => isConnected && address?.toLowerCase() === CONTRACT_OWNER_ADDRESS.toLowerCase(),
    [isConnected, address],
  )

  const { data: walletBalance } = useReadContract({
    ...nftContract,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })
  const ownedNftCount = walletBalance !== undefined ? Number(walletBalance) : 0

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

  return (
    <div className="w-full max-w-3xl mx-auto">
      <Card className="shadow-2xl border-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-2xl overflow-hidden">
        <CardHeader className="space-y-4 pb-4 bg-gradient-to-br from-purple-50/50 via-pink-50/50 to-purple-50/50 dark:from-purple-950/30 dark:via-pink-950/30 dark:to-purple-950/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-4xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent">
              C's Family Mainnet NFT
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

          {!isActive && timeUntilStart > 0 && (
            <div className="flex items-center justify-center gap-3 text-base font-bold text-gray-700 dark:text-gray-300 p-6 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border-2 border-amber-200/50 dark:border-amber-800/50 shadow-lg">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              <span>
                Phase starts in:{" "}
                <strong className="text-amber-600 dark:text-amber-400">
                  {formatDuration(timeUntilStart)}
                </strong>
              </span>
            </div>
          )}

          {isActive && timeUntilEnd > 0 && (
            <div className="flex items-center justify-center gap-3 text-base font-bold text-gray-700 dark:text-gray-300 p-6 rounded-3xl bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 border-2 border-blue-200/50 dark:border-blue-800/50 shadow-lg">
              <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <span>
                Phase ends in:{" "}
                <strong className="text-blue-600 dark:text-blue-400">
                  {formatDuration(timeUntilEnd)}
                </strong>
              </span>
            </div>
          )}
        </div>

        {!isActive ? (
          <div className="text-center py-16">
            <Alert className="border-2 rounded-3xl shadow-lg">
              <Clock className="h-6 w-6" />
              <AlertTitle className="text-xl font-bold">Minting Not Active</AlertTitle>
              <AlertDescription>
                {timeUntilStart > 0
                  ? `Minting opens in ${formatDuration(timeUntilStart)}.`
                  : "Minting is currently closed. Please check back later."}
              </AlertDescription>
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
          ) : !isConnected ? (
            <div className="text-center py-16 space-y-4">
              <Wallet className="h-20 w-20 mx-auto mb-6 text-purple-400 dark:text-purple-600" />
              <div className="space-y-2">
                <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">Connect Your Wallet</p>
                <p className="text-base text-gray-500 dark:text-gray-400">
                  Connect to mint once the phase is active{isWhitelistPhase ? " and check your eligibility" : ""}.
                </p>
              </div>
              <div>
                <Button
                  onClick={() => open()}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-700 hover:via-pink-700 hover:to-purple-700 shadow-xl hover:shadow-2xl transition-all rounded-2xl px-8 py-6 text-lg font-bold"
                >
                  <Wallet className="h-5 w-5" />
                  Connect Wallet
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {isWhitelistPhase && !isEligible ? (
                <div className="text-center py-8">
                  <Alert variant="destructive">
                    <Terminal className="h-4 w-4" />
                    <AlertTitle>Not Eligible</AlertTitle>
                    <AlertDescription>Your wallet is not on the whitelist.</AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="space-y-4 p-6 rounded-xl border-2 border-purple-300 dark:border-purple-700 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
                  <h3 className="text-xl font-bold text-center flex items-center justify-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    {activePhase.name} Mint
                  </h3>

                  <div className="text-center space-y-2">
                    {isWhitelistPhase ? (
                      <>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Minted: {maxAllowed - userRemainingMints} / {maxAllowed}
                        </div>
                        <div className="text-3xl font-bold text-green-600">FREE MINT</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Remaining (per your limit): {userRemainingMints}
                        </div>
                        <div className="text-lg font-semibold">
                          Price: {activePhase.price} {monadTestnet.nativeCurrency.symbol}
                        </div>
                      </>
                    )}
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
                    disabled={
                      mintStatus !== "idle" ||
                      isWrongNetwork ||
                      (isWhitelistPhase ? hasMintedMax : userRemainingMints <= 0)
                    }
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
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && <AdminPanel onPhaseUpdate={refetch} />}
    </div>
  )
}
