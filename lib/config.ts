import type { Address } from "viem"

// Chain config (env-overridable). Named `monadTestnet` for backward-compat exports.
const ENV_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 10143)
const ENV_CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME || "Monad Testnet"
const ENV_SYMBOL = process.env.NEXT_PUBLIC_CHAIN_SYMBOL || "MON"
const ENV_DECIMALS = Number(process.env.NEXT_PUBLIC_CHAIN_DECIMALS || 18)
const ENV_RPC = (process.env.NEXT_PUBLIC_CHAIN_RPC_HTTP || "https://testnet-rpc.monad.xyz")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
const ENV_EXPLORER_NAME = process.env.NEXT_PUBLIC_CHAIN_EXPLORER_NAME || "Monad Explorer"
const ENV_EXPLORER_URL = process.env.NEXT_PUBLIC_CHAIN_EXPLORER_URL || "https://testnet.monadexplorer.com"

export const monadTestnet = {
  id: ENV_CHAIN_ID,
  name: ENV_CHAIN_NAME,
  nativeCurrency: {
    decimals: ENV_DECIMALS,
    name: ENV_SYMBOL,
    symbol: ENV_SYMBOL,
  },
  rpcUrls: {
    default: { http: ENV_RPC },
  },
  blockExplorers: {
    default: { name: ENV_EXPLORER_NAME, url: ENV_EXPLORER_URL },
  },
  testnet: false,
} as const

// Contract addresses
const DEFAULT_NFT_ADDRESS = "0x7392a5A040eca9e62f878Bc94D5817Df07105FAC"
const DEFAULT_OWNER_ADDRESS = "0xab2967A1c1Bc427f08CBA864A841746C8eaA6d05"

export const NFT_CONTRACT_ADDRESS: Address = (process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS ||
  DEFAULT_NFT_ADDRESS) as Address
export const CONTRACT_OWNER_ADDRESS: Address = (process.env.NEXT_PUBLIC_CONTRACT_OWNER_ADDRESS ||
  DEFAULT_OWNER_ADDRESS) as Address

// Burn collections with names
export const BURN_COLLECTIONS = [
  {
    address: "0x42EBb45dBFb74d7AedbDDC524CaD36e08B4C0022" as Address,
    name: "C's Family Genesis",
  },
  {
    address: "0xeaA8f6F22DBE392165ab1Ee32A030226f080C092" as Address,
    name: "Molamons",
  },
]

// MonadPhasedNFTTestnet ABI
export const MONAD_PHASED_NFT_ABI = [
  {
    inputs: [
      { internalType: "string", name: "name_", type: "string" },
      { internalType: "string", name: "symbol_", type: "string" },
      { internalType: "string", name: "baseURI_", type: "string" },
      { internalType: "string", name: "contractURI_", type: "string" },
      { internalType: "address", name: "royaltyReceiver_", type: "address" },
      { internalType: "uint96", name: "royaltyBps_", type: "uint96" },
      { internalType: "address", name: "initialOwner_", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "ERC721EnumerableForbidden", type: "error" },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address", name: "owner", type: "address" },
    ],
    name: "ERC721IncorrectOwner",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "ERC721InsufficientApproval",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "approver", type: "address" }],
    name: "ERC721InvalidApprover",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "operator", type: "address" }],
    name: "ERC721InvalidOperator",
    type: "error",
  },
  { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "ERC721InvalidOwner", type: "error" },
  {
    inputs: [{ internalType: "address", name: "receiver", type: "address" }],
    name: "ERC721InvalidReceiver",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "sender", type: "address" }],
    name: "ERC721InvalidSender",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ERC721NonexistentToken",
    type: "error",
  },
  { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "OwnableInvalidOwner", type: "error" },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "OwnableUnauthorizedAccount",
    type: "error",
  },
  { inputs: [], name: "PausableEnforcedPause", type: "error" },
  { inputs: [], name: "PausableExpectedPause", type: "error" },
  { inputs: [], name: "ReentrancyGuardReentrantCall", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "address", name: "approved", type: "address" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "address", name: "operator", type: "address" },
      { indexed: false, internalType: "bool", name: "approved", type: "bool" },
    ],
    name: "ApprovalForAll",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: true, internalType: "uint8", name: "phaseId", type: "uint8" },
      { indexed: false, internalType: "uint256", name: "quantity", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "firstTokenId", type: "uint256" },
    ],
    name: "BatchMinted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "collection", type: "address" },
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: false, internalType: "uint256", name: "burnedTokenId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "mintedTokenId", type: "uint256" },
    ],
    name: "BurnToMint",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "previousOwner", type: "address" },
      { indexed: true, internalType: "address", name: "newOwner", type: "address" },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: "address", name: "account", type: "address" }],
    name: "Paused",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint8", name: "phaseId", type: "uint8" },
      { indexed: false, internalType: "uint256", name: "price", type: "uint256" },
      { indexed: false, internalType: "bytes32", name: "root", type: "bytes32" },
      { indexed: false, internalType: "uint32", name: "cap", type: "uint32" },
      { indexed: false, internalType: "uint32", name: "maxPerTx", type: "uint32" },
      { indexed: false, internalType: "uint64", name: "startTime", type: "uint64" },
      { indexed: false, internalType: "uint64", name: "endTime", type: "uint64" },
    ],
    name: "PhaseConfigured",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint8", name: "phaseId", type: "uint8" },
      { indexed: false, internalType: "uint64", name: "startTime", type: "uint64" },
      { indexed: false, internalType: "uint64", name: "endTime", type: "uint64" },
      { indexed: false, internalType: "uint32", name: "maxPerTx", type: "uint32" },
    ],
    name: "PhaseTimeUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: "address", name: "account", type: "address" }],
    name: "Unpaused",
    type: "event",
  },
  {
    inputs: [],
    name: "MAX_SUPPLY",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "collection", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "burnToMint",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "contractURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getActivePhases",
    outputs: [{ internalType: "uint8[]", name: "", type: "uint8[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "getApproved",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "phaseId", type: "uint8" },
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "maxAllowed", type: "uint256" },
    ],
    name: "getRemainingMints",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "isAllowedBurnCollection",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "id", type: "uint8" },
      { internalType: "uint256", name: "quantity", type: "uint256" },
      { internalType: "uint256", name: "maxAllowed", type: "uint256" },
      { internalType: "bytes32[]", name: "proof", type: "bytes32[]" },
    ],
    name: "mint",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "", type: "uint8" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "mintedPerPhase",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "pause", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [],
    name: "paused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "phases",
    outputs: [
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "bytes32", name: "root", type: "bytes32" },
      { internalType: "uint32", name: "cap", type: "uint32" },
      { internalType: "uint32", name: "minted", type: "uint32" },
      { internalType: "uint32", name: "maxPerTx", type: "uint32" },
      { internalType: "uint64", name: "startTime", type: "uint64" },
      { internalType: "uint64", name: "endTime", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "renounceOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "salePrice", type: "uint256" },
    ],
    name: "royaltyInfo",
    outputs: [
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "uint256", name: "royaltyAmount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "collection", type: "address" },
      { internalType: "bool", name: "allowed", type: "bool" },
    ],
    name: "setAllowedBurnCollection",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "bool", name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "u", type: "string" }],
    name: "setBaseURI",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "u", type: "string" }],
    name: "setContractURI",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "id", type: "uint8" },
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "bytes32", name: "root", type: "bytes32" },
      { internalType: "uint32", name: "cap", type: "uint32" },
      { internalType: "uint32", name: "maxPerTx", type: "uint32" },
      { internalType: "uint64", name: "startTime", type: "uint64" },
      { internalType: "uint64", name: "endTime", type: "uint64" },
    ],
    name: "setPhase",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "unpause", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { internalType: "uint8", name: "id", type: "uint8" },
      { internalType: "uint64", name: "startTime", type: "uint64" },
      { internalType: "uint64", name: "endTime", type: "uint64" },
    ],
    name: "updatePhaseTime",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

// ERC721 ABI (for burn collection)
export const ERC721_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "contractURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint256", name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "getApproved",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "bool", name: "approved", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const

// Optional owner query ABIs commonly found in ERC721A and derivatives
export const ERC721A_TOKENS_OF_OWNER_ABI = [
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "tokensOfOwner",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export const ERC721A_WALLET_OF_OWNER_ABI = [
  {
    inputs: [{ internalType: "address", name: "_owner", type: "address" }],
    name: "walletOfOwner",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export type PhaseKey = "wl" | "fcfs"

// Feature flag: enable or disable Burn to Mint UI/logic
export const ENABLE_BURN_TO_MINT = (process.env.NEXT_PUBLIC_ENABLE_BURN_TO_MINT ?? "true").toLowerCase() !== "false"

// Which phase the UI should target by default. Can be overridden via env.
const ACTIVE_PHASE_ENV = process.env.NEXT_PUBLIC_ACTIVE_PHASE_KEY as PhaseKey | undefined
export const ACTIVE_PHASE_KEY: PhaseKey = ACTIVE_PHASE_ENV ?? "wl"

export const PHASES_CONFIG: Record<
  PhaseKey,
  {
    id: number
    name: string
    price: string // in native token units, string form e.g. "0", "0.01"
    cap: number
    maxPerTx: number
    root: string // 0x00.. means public-like (FCFS/Public)
    proofFile?: string // only for WL phases
  }
> = {
  wl: {
    id: 0,
    name: "WL",
    price: "0",
    cap: 5000,
    maxPerTx: 10,
    root: "0x9ad49be778b04d20e16a5a66d3d14207da785be5fcc4ccd0bbe375726b75546c",
    proofFile: "/merkle/wl_proof.json",
  },
  fcfs: {
    id: 1,
    name: "FCFS",
    price: "0.01",
    cap: 5000,
    maxPerTx: 10,
    root: "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
}
