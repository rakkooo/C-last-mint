"use client"

import { useState } from "react"
import { useWalletClient, usePublicClient } from "wagmi"
import { parseEther } from "viem"
import toast from "react-hot-toast"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader } from "lucide-react"

import { MONAD_PHASED_NFT_ABI, NFT_CONTRACT_ADDRESS } from "@/lib/config"

interface AdminPanelProps {
  onPhaseUpdate: () => void
}

export function AdminPanel({ onPhaseUpdate }: AdminPanelProps) {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [phaseId, setPhaseId] = useState("0")
  const [price, setPrice] = useState("0")
  const [root, setRoot] = useState("0x9ad49be778b04d20e16a5a66d3d14207da785be5fcc4ccd0bbe375726b75546c")
  const [cap, setCap] = useState("5000")
  const [maxPerTx, setMaxPerTx] = useState("10")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")

  const [isPending, setIsPending] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const handleSetPhase = async () => {
    if (!walletClient || !publicClient) {
      toast.error("Wallet client is not ready. Please reconnect your wallet.")
      return
    }

    try {
      if (!startTime || !endTime) {
        toast.error("Please enter both start and end time.")
        return
      }

      const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000)
      const endTimestamp = Math.floor(new Date(endTime).getTime() / 1000)

      if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
        toast.error("Invalid datetime format.")
        return
      }

      if (startTimestamp >= endTimestamp) {
        toast.error("End time must be after the start time.")
        return
      }

      const capValue = Number(cap)
      const maxPerTxValue = Number(maxPerTx)

      if (!Number.isFinite(capValue) || capValue <= 0) {
        toast.error("Cap must be a positive number.")
        return
      }

      if (!Number.isFinite(maxPerTxValue) || maxPerTxValue <= 0) {
        toast.error("Max per tx must be a positive number.")
        return
      }

      if (maxPerTxValue > capValue) {
        toast.error("Max per tx must not exceed the cap.")
        return
      }

      const priceValue = price.trim().length > 0 ? price : "0"

      setIsPending(true)
      const hash = await walletClient.writeContract({
        address: NFT_CONTRACT_ADDRESS,
        abi: MONAD_PHASED_NFT_ABI,
        functionName: "setPhase",
        args: [
          Number(phaseId),
          parseEther(priceValue),
          root as `0x${string}`,
          capValue,
          maxPerTxValue,
          BigInt(startTimestamp),
          BigInt(endTimestamp),
        ],
      })

      setIsPending(false)
      setIsConfirming(true)
      await publicClient.waitForTransactionReceipt({ hash })
      setIsConfirming(false)

      toast.success("Phase updated successfully!")
      onPhaseUpdate()
    } catch (error) {
      console.error("Error setting phase:", error)
      toast.error("Failed to set phase")
      setIsPending(false)
      setIsConfirming(false)
    }
  }

  const isWalletReady = Boolean(walletClient && publicClient)

  return (
    <Card className="mt-6 border-2 border-yellow-300 dark:border-yellow-700">
      <CardHeader>
        <CardTitle className="text-yellow-600 dark:text-yellow-400">Admin Panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phaseId">Phase ID</Label>
            <Input
              id="phaseId"
              type="number"
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price (MON)</Label>
            <Input id="price" type="text" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="root">Merkle Root</Label>
          <Input
            id="root"
            type="text"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="0x..."
            className="font-mono text-xs"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cap">Cap</Label>
            <Input id="cap" type="number" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="5000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxPerTx">Max Per Tx</Label>
            <Input
              id="maxPerTx"
              type="number"
              value={maxPerTx}
              onChange={(e) => setMaxPerTx(e.target.value)}
              placeholder="10"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startTime">Start Time</Label>
            <Input
              id="startTime"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endTime">End Time</Label>
            <Input id="endTime" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <Button className="w-full" onClick={handleSetPhase} disabled={!isWalletReady || isPending || isConfirming}>
          {isPending || isConfirming ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              {isConfirming ? "Updating..." : "Confirm in Wallet..."}
            </>
          ) : (
            "Update Phase"
          )}
        </Button>

        {!isWalletReady && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400 text-center">
            Please connect your wallet to use the admin panel.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
