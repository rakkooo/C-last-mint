# C's Family NFT Mint (Monad Testnet)

本リポジトリは Monad Testnet 上の NFT ミントサイトです。WL（Merkle）対応、Burn-to-Mint、Alchemy ベースの所有ID自動取得、IPFS 画像表示などを備えています。運用・引き継ぎ・デプロイ時の確認事項を以下にまとめます。

## 機能概要
- WLミント（Merkle Proof）: `public/merkle/wl_proof.json` を参照し、クライアント側で自己検証後にミント。
- Burn-to-Mint: 許可済みコレクションの保有IDから1点をバーンしてミント（UIはWLの下に表示）。
- 所有IDの自動プルダウン: Alchemy NFT API から最大10件のIDを高速取得（Enumerable非対応でも対応）。
- 画像: `contractURI` / `tokenURI` の `image` を IPFSゲートウェイで解決して表示。
- 背景: `public/images/background.png` に白い霞（約30%）のフィルターを重ねた演出。

## 主要ファイル
- `components/mint-component.tsx`: ミントUI/ロジックの中核（WL検証、Alchemy問い合わせ、Burn-to-Mint）。
- `app/api/owned-ids/route.ts`: Alchemy 経由で保有トークンIDを列挙（最大10件）。
- `app/api/owned-check/route.ts`: Alchemy 経由でどのコレクションを保有しているか判定（軽量）。
- `public/merkle/wl_proof.json`: WL証明ファイル（`{ root?, entries? }` 形式に対応）。
- `public/merkle/root.json`（任意）: ルート単体ファイル（`{ root: ... }`）。
- `lib/config.ts`: チェーン/コントラクト/対象コレクションの設定。
- `next.config.mjs`: 画像最適化やヘッダ設定（/merkleへのキャッシュヘッダ）。

## 開発環境
- Node.js 18+ 推奨
- パッケージマネージャ: `pnpm`（推奨）

### セットアップ
```
pnpm install
pnpm dev
```
ブラウザで http://localhost:3000 を開きます。

## 環境変数（.env.local）
以下は代表例です。Vercel では Project Settings → Environment Variables に設定してください。

- `NEXT_PUBLIC_WC_PROJECT_ID`: WalletConnect の Project ID
- `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS`: ミント先のNFTコントラクト
- `NEXT_PUBLIC_CONTRACT_OWNER_ADDRESS`: 管理者ウォレット（Adminパネル表示用）
- `NEXT_PUBLIC_ENABLE_BURN_TO_MINT`: Burn-to-Mint の有効化（`true`/`false`）
- `NEXT_PUBLIC_ACTIVE_PHASE_KEY`: `wl` or `fcfs`
- `NEXT_PUBLIC_PROOF_VERSION`: WLファイルのキャッシュバスター（例: `1`, `2025-10-09`）
- `ALCHEMY_NFT_API_KEY`: Alchemy NFT API Key（サーバ側）
- チェーン系: `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_CHAIN_RPC_HTTP` など

## WL（Merkle）運用
- 生成スクリプト: `scripts/generate-merkle-proof.js`（CSV→`root.json`/`leaves.json`/`proofs.json`）
- 形式:
  - `wl_proof.json` に `root` と `entries` を含める、または `proofs.json` を `wl_proof.json` にリネーム。
  - `root.json` は任意（`wl_proof.json`内に`root`がある場合は不要）。
- フロント自己検証: `leaf=keccak256(abi.encodePacked(address, uint256(maxAllowed)))` を `sorted pair hash` で畳み、コントラクトの `root` と照合。不一致ならミントをブロックします。
- 切り替え手順:
  1. `public/merkle/wl_proof.json`（必要なら `root.json`）を差し替え
  2. `.env.local` の `NEXT_PUBLIC_PROOF_VERSION` を増やす（例: `1→2` or `2025-10-08→2025-10-09`）
  3. ローカル再起動 or ブラウザのハードリロード

## Burn-to-Mint
- 許可コレクションは `lib/config.ts:BURN_COLLECTIONS` に定義。
- 保有判定は `/api/owned-check`（必要に応じ `getOwnersForContract` にフォールバック）。
- ID列挙は `/api/owned-ids`（`getNFTsForOwner` → 不足時 `getOwnersForContract` フォールバック）。

## デプロイ手順（GitHub → Vercel）
1. GitHub リポジトリを作成（空でOK）
2. ローカルで初期化
   ```
   git init
   git add .
   git commit -m "init: monad nft mint"
   git branch -M main
   git remote add origin <YOUR_REPO_URL>
   git push -u origin main  ```

3. Vercel で New Project → GitHub を接続 → 本リポジトリを選択
4. 環境変数を設定（上記参照）
5. Deploy（ビルドは Next.js デフォルト）

## ローカルポートの停止（開発サーバ終了）
- Windows（PowerShell）
  - ポート確認（例: 3000）: `netstat -ano | findstr :3000`
  - PID を停止: `taskkill /PID <PID> /F`
  - まとめて停止（Node系）: `Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`
- macOS / Linux
  - ポート確認: `lsof -i :3000`
  - 停止: `kill -9 <PID>`

停止後に `pnpm dev` を再実行すると新しい開発サーバが起動します。

## リリース前チェックリスト
- [ ] チェーン/コントラアドレスが本番値
- [ ] `BURN_COLLECTIONS` に本番で許可するコレクションのみを記載（Burn Test は削除済）
- [ ] WLファイル差し替え＆`NEXT_PUBLIC_PROOF_VERSION` 更新済
- [ ] `ALCHEMY_NFT_API_KEY` 設定済
- [ ] WL自己検証のルート一致（`phases(id).root` と `wl_proof.json`/`root.json`）
- [ ] UI動作（所有IDプルダウン・Approve不可条件・Burn確認画像・白モヤ背景など）

## 更新作業の注意点
- 所有チェック中は「Checking eligibility…」の中立表示→誤判定の点滅を抑制
- コレクション切替で ID キャッシュは必ずクリア（古いIDが残らない）
- 画像取得はIPFSゲートウェイ依存（必要ならゲートウェイ変更可）

## よくあるトラブルシュート
- 「Proof mismatch」: ルート不一致。`wl_proof.json/root.json` とコントラクトの `root` が一致しているか確認（ENVのバージョンも更新）。
- 所有IDが出ない: Alchemyキー/ネットワーク/対象コントラが正しいか。API側の混在はサーバで厳密フィルタ＆所有者一覧フォールバック済み。

## ライセンス
社内/私用プロジェクト想定。必要に応じて追記してください。
