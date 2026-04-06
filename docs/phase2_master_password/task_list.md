# Phase 2: マスターパスワード — タスクリスト

> **ステータス凡例**: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了
>
> **前提**: Phase 1（AIプロバイダー拡充）完了後に着手すること

---

## タスク一覧

### T2-1: Rust暗号化クレートの追加

**タイトル:** Cargo.toml に bcrypt / AES-256-GCM / PBKDF2 クレートを追加する

**説明:**

1. **使用技術**
   - `bcrypt` crate（パスワードハッシュ）
   - `aes-gcm` crate（AES-256-GCM 対称暗号化）
   - `pbkdf2` + `hmac` + `sha2` crate（パスワードから暗号化キーを導出）
   - `base64` crate（暗号化データのエンコード）
   - `rand` crate（ソルト・IV生成）

2. **具体的な作業内容**
   - `src-tauri/Cargo.toml` に上記クレートを追加
   - バージョンは最新安定版を使用

3. **対象ファイル・関連箇所**
   - `src-tauri/Cargo.toml`

4. **完了条件**
   - `cargo build` が通る

5. **制約・やってはいけないこと**
   - 独自暗号化実装禁止（必ず既存クレートを使用）
   - 非推奨アルゴリズム（MD5, SHA1, AES-ECB等）使用禁止

---

### T2-2: Rust側暗号化コマンドの実装

**タイトル:** パスワードハッシュ・暗号化・復号の Tauri コマンドを lib.rs に実装する

**説明:**

1. **使用技術**
   - `bcrypt`（コスト係数12推奨）
   - `pbkdf2`（HMAC-SHA256, 100,000イテレーション）で暗号化キー導出
   - `aes-gcm`（AES-256-GCM）
   - `rand::thread_rng`（ソルト/IV生成）

2. **具体的な作業内容**
   - `hash_password(password: String) -> Result<String, String>`: bcryptハッシュ生成
   - `verify_password(password: String, hash: String) -> Result<bool, String>`: ハッシュ検証
   - `encrypt_value(plaintext: String, password: String) -> Result<String, String>`: AES-GCM暗号化（`base64(salt + iv + ciphertext)` を返す）
   - `decrypt_value(ciphertext: String, password: String) -> Result<String, String>`: 復号

3. **対象ファイル・関連箇所**
   - `src-tauri/src/lib.rs`

4. **完了条件**
   - `encrypt_value` → `decrypt_value` でラウンドトリップが成立する
   - 間違ったパスワードで復号すると `Err` を返す

5. **制約・やってはいけないこと**
   - パスワード自体をどこにも保存・ログ出力しない
   - IVを使い回さない（毎回ランダム生成）

---

### T2-3: フロントエンドセッション管理モジュールの実装

**タイトル:** セッション状態を管理する `src/lib/session.ts` を実装する

**説明:**

1. **使用技術**
   - TypeScript
   - `invoke`（Tauri コマンド呼び出し）
   - `localStorage`（セッション有効期限の一時保存）

2. **具体的な作業内容**
   - `SessionState`: `{ unlocked: boolean, expiresAt: Date | null, password: string | null }`
   - `unlock(password)`: Rust の `verify_password` を呼び出してセッション開始
   - `lock()`: セッションをクリア（パスワードをメモリから削除）
   - `isUnlocked(): boolean`: 現在有効かチェック（有効期限も確認）
   - `getPassword(): string | null`: 復号に使うパスワードを返す（期限切れなら `null`）
   - `encrypt(value)` / `decrypt(value)`: Rust コマンドを呼び出すラッパー
   - セッション期間定数: `APP_RESTART` / `1h` / `6h` / `1d` / `2w` / `1m` / `3m` / `FOREVER`
   - `APP_RESTART` の場合は `localStorage` ではなくメモリのみに保持

3. **対象ファイル・関連箇所**
   - `src/lib/session.ts`（新規）
   - `src/lib/settings.ts`（`master_password_hash`, `session_duration` キー追加）

4. **完了条件**
   - `unlock()` → `isUnlocked()` → `lock()` のサイクルが正しく動作する
   - アプリ再起動後に `APP_RESTART` セッションが無効になる
   - `FOREVER` 以外で有効期限が正しく計算される

5. **制約・やってはいけないこと**
   - パスワード（生値）を `localStorage` や DB に保存しない
   - セッション状態をグローバルストアに入れない（`session.ts` の関数で管理）

---

### T2-4: パスワード設定フロー（初回セットアップUI）

**タイトル:** マスターパスワードの初回設定・変更モーダルを実装する

**説明:**

1. **使用技術**
   - React, TypeScript, TailwindCSS v4

2. **具体的な作業内容**
   - `MasterPasswordSetupModal` コンポーネントを新規作成
   - 新パスワード入力 + 確認入力の2フィールド
   - バリデーション（8文字以上、一致確認）
   - 設定保存時: `hash_password` で bcrypt ハッシュを生成 → `settings.master_password_hash` に保存
   - 変更時: 現在のパスワード確認 → 新パスワード設定の2ステップ
   - パスワード削除（マスターパスワード機能を無効化）オプション

3. **対象ファイル・関連箇所**
   - `src/components/MasterPasswordSetupModal.tsx`（新規）
   - `src/pages/Settings.tsx`（呼び出し追加）

4. **完了条件**
   - パスワードを設定すると `master_password_hash` が DB に保存される
   - パスワード変更・削除が正しく動作する

5. **制約・やってはいけないこと**
   - `type="text"` で入力フィールドを作成しない（必ず `type="password"`）
   - パスワード強度メーターなどの過剰なUIを追加しない

---

### T2-5: ロック解除モーダルの実装

**タイトル:** アプリ起動時・セッション期限切れ時に表示するパスワード入力モーダルを実装する

**説明:**

1. **使用技術**
   - React, TypeScript

2. **具体的な作業内容**
   - `UnlockModal` コンポーネントを新規作成
   - パスワード入力フィールド + 「ロック解除」ボタン
   - 誤入力時のエラーメッセージ（「パスワードが違います」）
   - `App.tsx` のマウント時に `master_password_hash` が存在するかチェック → 存在してセッションが無効なら表示

3. **対象ファイル・関連箇所**
   - `src/components/UnlockModal.tsx`（新規）
   - `src/App.tsx`（起動時チェック追加）

4. **完了条件**
   - アプリ起動時にパスワードが設定されていれば解除モーダルが表示される
   - 正しいパスワードを入力するとモーダルが閉じてアプリが使える

5. **制約・やってはいけないこと**
   - パスワードなしでモーダルを閉じる手段を提供しない
   - マスターパスワード機能がオフの場合（`master_password_hash` が未設定）はモーダルを表示しない

---

### T2-6: セッション期限切れバナーの実装

**タイトル:** セッション期限切れを画面上部のバナーで通知しパスワード再入力を促すコンポーネントを実装する

**説明:**

1. **使用技術**
   - React, TypeScript, TailwindCSS v4

2. **具体的な作業内容**
   - `SessionExpiredBanner` コンポーネントを新規作成（画面上部固定表示）
   - バナー内にパスワード入力フィールド + 「再認証」ボタンを配置
   - `isUnlocked()` が `false` かつ `master_password_hash` が設定済みの場合に表示
   - 1分ごとに `isUnlocked()` をポーリングして期限切れを検知
   - AI APIを呼び出した際に期限切れだった場合もバナーを強調表示（赤色に変化など）

3. **対象ファイル・関連箇所**
   - `src/components/SessionExpiredBanner.tsx`（新規）
   - `src/components/layout/MainLayout.tsx`（バナーを最上部に配置）

4. **完了条件**
   - セッション期限が切れると自動でバナーが表示される
   - バナーからパスワードを入力するとセッションが再開しバナーが消える
   - セッション未使用時（マスターパスワード未設定）はバナーが表示されない

5. **制約・やってはいけないこと**
   - バナー表示中でも既存のアプリ操作（タスク管理・メモ等）は妨げない
   - ページ遷移をブロックしない

---

### T2-7: APIキーの暗号化保存フロー

**タイトル:** APIキーをSettings保存時に暗号化し、使用時に復号するフローを実装する

**説明:**

1. **使用技術**
   - `src/lib/session.ts`（T2-3）
   - Rust コマンド `encrypt_value` / `decrypt_value`

2. **具体的な作業内容**
   - `settings.ts` に `setEncryptedSetting(key, value)` / `getDecryptedSetting(key)` を追加
   - 暗号化対象キー: 全プロバイダーのAPIキー + S3接続情報（Phase 3で追加）
   - Settings保存時: マスターパスワードが設定・解除済みなら暗号化して保存
   - AI呼び出し時: `getDecryptedSetting` で復号してAPIキーを取得
   - セッション期限切れ時: `getDecryptedSetting` が `null` を返す → エラーを表示してバナーを強調

3. **対象ファイル・関連箇所**
   - `src/lib/settings.ts`
   - `src/lib/ai.ts`（APIキー取得部分を変更）

4. **完了条件**
   - APIキーが DB 上で暗号化文字列として保存されている
   - 正しいパスワードで解除後にAI機能が動作する
   - 期限切れ時はAPIキーを使用できずエラーが表示される

5. **制約・やってはいけないこと**
   - マスターパスワードが未設定の場合は従来通り平文保存（後方互換性を保つ）
   - 暗号化・復号の失敗でアプリがクラッシュしないようにする

---

### T2-8: Settings.tsxにマスターパスワード設定セクションを追加

**タイトル:** Settings画面にマスターパスワードの設定・管理UIを追加する

**説明:**

1. **使用技術**
   - React, TypeScript, TailwindCSS v4

2. **具体的な作業内容**
   - 新セクション「セキュリティ」を追加（セクション0番目 or 最後に配置）
   - 内容:
     - マスターパスワード有効/無効トグル
     - セッション期間選択（ドロップダウン）
     - パスワード設定・変更ボタン → `MasterPasswordSetupModal` を開く
     - 現在のセッション状態表示（「解除中（あと○時間）」「期限切れ」）

3. **対象ファイル・関連箇所**
   - `src/pages/Settings.tsx`

4. **完了条件**
   - マスターパスワードの有効化・無効化が Settings から操作できる
   - セッション期間の変更が反映される

5. **制約・やってはいけないこと**
   - マスターパスワードをオフにする際は確認ダイアログを必ず表示する

---

## 完了チェックリスト

- [ ] T2-1: Rustクレート追加
- [ ] T2-2: Rust暗号化コマンド実装
- [ ] T2-3: セッション管理モジュール
- [ ] T2-4: パスワード設定モーダル
- [ ] T2-5: ロック解除モーダル
- [ ] T2-6: セッション期限切れバナー
- [ ] T2-7: APIキー暗号化保存フロー
- [ ] T2-8: Settings.tsx セキュリティセクション
