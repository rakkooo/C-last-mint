// merkle-gen.js
// 使い方: node merkle-gen.js ./wl.csv
// 出力: root.json, proofs.json, leaves.json

const fs = require("fs")
const fse = require("fs-extra")
const path = require("path")
const { MerkleTree } = require("merkletreejs")
const keccak256 = require("keccak256")

// 許容ヘッダー名（柔軟対応）
const ADDR_HEADERS = new Set(["wallet", "address", "wallet_address", "addy"])
const AMOUNT_HEADERS = new Set(["amount", "maxallowed", "allocation", "allo"])

function die(msg) {
  console.error(msg)
  process.exit(1)
}

// 簡易CSVパーサ（カンマ区切り・ダブルクォート無し前提）
// もし複雑なCSVを扱うなら csv-parse を使ってください。
function parseCsvSimple(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
  if (lines.length === 0) die("CSVが空です")
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const rows = lines.slice(1).map((line) => line.split(",").map((v) => v.trim()))
  return { header, rows }
}

function findColumnIndexes(header) {
  let addrIdx = -1,
    amtIdx = -1
  header.forEach((h, i) => {
    if (ADDR_HEADERS.has(h)) addrIdx = i
    if (AMOUNT_HEADERS.has(h)) amtIdx = i
  })
  if (addrIdx === -1) die(`ウォレット列が見つかりません。ヘッダーを "wallet" か "address" にしてください。`)
  if (amtIdx === -1) die(`割当列が見つかりません。ヘッダーを "amount" か "maxAllowed" にしてください。`)
  return { addrIdx, amtIdx }
}

function isHexAddress(s) {
  return /^0x[0-9a-fA-F]{40}$/.test(s)
}

function to0x(buf) {
  return "0x" + buf.toString("hex")
}

// Solidity: keccak256(abi.encodePacked(address, uint256))
function leafFor(address, maxAllowed) {
  const addr = address.toLowerCase() // 大文字小文字はEVM上は不問
  if (!isHexAddress(addr)) die(`不正なアドレス: ${address}`)
  const addrBuf = Buffer.from(addr.slice(2), "hex")

  // uint256 を32byte big-endian
  const big = BigInt(maxAllowed)
  if (big < 0n) die(`割当数が負です: ${maxAllowed}`)
  const hex = big.toString(16).padStart(64, "0")
  const amtBuf = Buffer.from(hex, "hex")

  const packed = Buffer.concat([addrBuf, amtBuf])
  return keccak256(packed)
}

function main() {
  const file = process.argv[2]
  if (!file) die("使い方: node merkle-gen.js <csv-path>")

  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) die(`ファイルが見つかりません: ${abs}`)

  const text = fs.readFileSync(abs, "utf8")
  const { header, rows } = parseCsvSimple(text)
  const { addrIdx, amtIdx } = findColumnIndexes(header)

  // 同一アドレスが複数回ある場合は「最大割当数」を優先
  const map = new Map() // addr(lower) -> { address, maxAllowed }
  for (const cols of rows) {
    const address = (cols[addrIdx] || "").trim()
    const amountStr = (cols[amtIdx] || "").trim()
    if (!address) continue
    if (!amountStr) continue

    if (!isHexAddress(address)) die(`不正なアドレス: ${address}`)
    let maxAllowed
    try {
      maxAllowed = BigInt(amountStr)
    } catch {
      die(`割当数が整数ではありません: ${amountStr} (address=${address})`)
    }
    const key = address.toLowerCase()
    const prev = map.get(key)
    if (!prev || BigInt(prev.maxAllowed) < maxAllowed) {
      map.set(key, { address, maxAllowed: maxAllowed.toString() })
    }
  }

  if (map.size === 0) die("有効な行がありませんでした。")

  // leaves 作成
  const records = []
  const leaves = []
  for (const { address, maxAllowed } of map.values()) {
    const leaf = leafFor(address, maxAllowed)
    records.push({ address, maxAllowed, leaf: to0x(leaf) })
    leaves.push(leaf)
  }

  // Merkle ツリー（sortPairs: true が一般的）
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
  const root = tree.getHexRoot()

  // 各アドレスの proof 生成
  const proofs = {}
  for (const rec of records) {
    const leaf = Buffer.from(rec.leaf.slice(2), "hex")
    proofs[rec.address.toLowerCase()] = {
      maxAllowed: rec.maxAllowed,
      proof: tree.getHexProof(leaf),
    }
  }

  const outputDir = process.argv[3] || "."
  fse.ensureDirSync(outputDir)

  fse.writeJSONSync(path.join(outputDir, "root.json"), { root }, { spaces: 2 })
  fse.writeJSONSync(path.join(outputDir, "leaves.json"), records, { spaces: 2 })
  fse.writeJSONSync(path.join(outputDir, "proofs.json"), proofs, { spaces: 2 })

  console.log("Root:", root)
  console.log("Generated: root.json, leaves.json, proofs.json")
}

main()
