import { NextRequest } from "next/server"
import { isAddress } from "viem"

export const dynamic = "force-dynamic"

const cache = new Map<string, { addrs: string[]; at: number }>()

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const owner = searchParams.get("u") || searchParams.get("owner") || ""
    const cols = searchParams.getAll("c").concat(searchParams.getAll("collection"))
    const list = cols.filter((c) => isAddress(c))
    if (!isAddress(owner) || list.length === 0) {
      return new Response(JSON.stringify({ error: "invalid params" }), { status: 400 })
    }

    const cacheKey = `${owner}::${list.sort().join(",")}`
    const now = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && now - cached.at < 30_000) {
      return Response.json({ owned: cached.addrs, source: "cache" })
    }

    const ALCHEMY_KEY = process.env.ALCHEMY_NFT_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_NFT_API_KEY
    if (!ALCHEMY_KEY) return Response.json({ owned: [], source: "none" })

    const base = `https://monad-testnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner`
    const owned: string[] = []

    await Promise.all(
      list.map(async (collection) => {
        const params = new URLSearchParams()
        params.set("owner", owner)
        params.set("withMetadata", "false")
        params.set("pageSize", "1")
        params.append("contractAddresses", collection)
        const url = `${base}?${params.toString()}`
        try {
          const res = await fetch(url, { cache: "no-store" })
          if (!res.ok) return
          const json: any = await res.json()
          const nfts: any[] = json?.ownedNfts || json?.nfts || []
          // strictly filter by given collection
          const filtered = nfts.filter((n) => {
            const addr = (n?.contract?.address || n?.contractAddress || "").toLowerCase()
            return addr === collection.toLowerCase()
          })
          if (filtered.length > 0) {
            owned.push(collection)
            return
          }
          // fallback: ownersForContract with balances
          try {
            const base2 = `https://monad-testnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getOwnersForContract`
            const p2 = new URLSearchParams()
            p2.set("contractAddress", collection)
            p2.set("withTokenBalances", "true")
            const url2 = `${base2}?${p2.toString()}`
            const res2 = await fetch(url2, { cache: "no-store" })
            if (res2.ok) {
              const j2: any = await res2.json()
              const owners: any[] = j2?.owners || []
              const entry = owners.find((o) => (o?.ownerAddress || "").toLowerCase() === owner.toLowerCase())
              if (entry) owned.push(collection)
            }
          } catch {}
        } catch {}
      }),
    )

    cache.set(cacheKey, { addrs: owned, at: Date.now() })
    return Response.json({ owned, source: "alchemy" })
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 })
  }
}
