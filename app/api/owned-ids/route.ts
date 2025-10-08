import { NextRequest } from "next/server"
import { isAddress } from "viem"

export const dynamic = "force-dynamic"

// naive in-memory cache (clears on cold start)
const cache = new Map<string, { ids: string[]; at: number }>()

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const collection = searchParams.get("c") || searchParams.get("collection") || ""
    const owner = searchParams.get("u") || searchParams.get("owner") || ""
    const limitParam = Number(searchParams.get("limit") || "10")
    const limit = Math.max(1, Math.min(10, Number.isFinite(limitParam) ? limitParam : 10))

    if (!isAddress(collection) || !isAddress(owner)) {
      return new Response(JSON.stringify({ error: "invalid params" }), { status: 400 })
    }

    const cacheKey = `${collection}-${owner}`
    const now = Date.now()
    const cached = cache.get(cacheKey)
    if (cached && now - cached.at < 30_000) {
      return Response.json({ ids: cached.ids.slice(0, limit), source: "cache" })
    }

    // helper: normalizes various tokenId formats (hex with/without 0x, or decimal) to decimal string
    const toDecimalTokenId = (raw: any): string => {
      if (raw == null) return ""
      let s = String(raw)
      try {
        if (s.startsWith("0x") || /[a-f]/i.test(s)) {
          // hex (with or without 0x)
          if (!s.startsWith("0x")) s = "0x" + s
          return BigInt(s).toString()
        }
        // pure decimal
        if (/^\d+$/.test(s)) return s.replace(/^0+/, "") || "0"
        // fallback: try as hex
        return BigInt("0x" + s).toString()
      } catch {
        return ""
      }
    }

    // 0) Prefer Alchemy NFT API if API key present (fast, indexed)
    try {
      const ALCHEMY_KEY = process.env.ALCHEMY_NFT_API_KEY || process.env.NEXT_PUBLIC_ALCHEMY_NFT_API_KEY
      if (ALCHEMY_KEY) {
        const base = `https://monad-testnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner`
        const params = new URLSearchParams()
        params.set("owner", owner)
        params.set("withMetadata", "true")
        params.set("pageSize", String(limit))
        // support multiple c params if provided
        const cols = searchParams.getAll("c").concat(searchParams.getAll("collection"))
        const list = cols.length ? cols : [collection]
        for (const c of list) params.append("contractAddresses", c)
        const url = `${base}?${params.toString()}`
        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) {
          const json: any = await res.json()
          const nfts: any[] = json?.ownedNfts || json?.nfts || []
          // Strictly filter by the requested collection to avoid API-side filtering quirks
          const filtered = nfts.filter((n) => {
            const addr = (n?.contract?.address || n?.contractAddress || "").toLowerCase()
            return addr === (collection as string).toLowerCase()
          })
          const ids = filtered
            .map((n) => n?.id?.tokenId ?? n?.tokenId)
            .map(toDecimalTokenId)
            .filter((s: string) => s)
            .sort((a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : 1))
            .slice(0, limit)
          if (ids.length) {
            cache.set(cacheKey, { ids, at: Date.now() })
            return Response.json({ ids, source: "alchemy" })
          }
          // Fallback: getOwnersForContract with withTokenBalances if the above returned mixed results or empty
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
            const balances: any[] = entry?.tokenBalances || []
            const ids2 = balances
              .map((b) => b?.tokenId)
              .map(toDecimalTokenId)
              .filter((s: string) => s)
              .sort((a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : 1))
              .slice(0, limit)
            cache.set(cacheKey, { ids: ids2, at: Date.now() })
            return Response.json({ ids: ids2, source: "alchemy:ownersForContract" })
          }
        }
      }
    } catch {}

    // Only Alchemy path is used. If no result, return empty list.
    cache.set(cacheKey, { ids: [], at: Date.now() })
    return Response.json({ ids: [], source: "none" })
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 })
  }
}
