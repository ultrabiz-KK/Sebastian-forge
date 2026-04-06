# Phase 3: S3クラウドオブジェクトストレージ同期 — タスクリスト

> **ステータス凡例**: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了
>
> **前提**: Phase 2（マスターパスワード）完了後に着手すること（接続情報の暗号化のため）

---

## タスク一覧

### T3-1: Rust S3クライアントクレートの追加

**タイトル:** Cargo.toml に S3通信用クレートを追加する

**説明:**

1. **使用技術**
   - `aws-sdk-s3` + `aws-config`（AWS公式Rust SDK）
   - `tokio`（非同期ランタイム、Tauriが既に使用）

2. **具体的な作業内容**
   - `src-tauri/Cargo.toml` に以下を追加:
     ```toml
     aws-sdk-s3 = "1"
     aws-config = { version = "1", features = ["behavior-version-latest"] }
     ```
   - S3互換ストレージのためにカスタムエンドポイント設定を必須とする

3. **対象ファイル・関連箇所**
   - `src-tauri/Cargo.toml`

4. **完了条件**
   - `cargo build` が通る

5. **制約・やってはいけないこと**
   - `rusoto`（非推奨）を使用しない
   - HTTP直接実装（fetch）をしない（aws-sdk-s3を使う）

---

### T3-2: S3基本操作コマンドの実装（アップロード・ダウンロード・メタデータ）

**タイトル:** S3へのDB同期に必要な Tauri コマンドを lib.rs に実装する

**説明:**

1. **使用技術**
   - `aws-sdk-s3`
   - Tauri `async` コマンド

2. **具体的な作業内容**
   以下のコマンドを実装:

   - `s3_upload_file(config: S3Config, local_path: String, s3_key: String) -> Result<(), String>`
     - ファイルをバイト列で読み込み → S3にPutObject
   - `s3_download_file(config: S3Config, s3_key: String, local_path: String) -> Result<(), String>`
     - S3からGetObject → ローカルに書き込み
   - `s3_get_object_mtime(config: S3Config, s3_key: String) -> Result<i64, String>`
     - HeadObject で `LastModified` を Unix秒で返す
   - `s3_test_connection(config: S3Config) -> Result<(), String>`
     - ListObjectsV2（1件のみ）で疎通確認

   `S3Config` 構造体:
   ```rust
   struct S3Config {
     endpoint: String,    // カスタムエンドポイント（AWS S3: "https://s3.amazonaws.com"）
     region: String,
     bucket: String,
     access_key: String,
     secret_key: String,
     prefix: String,      // オブジェクトキーのプレフィックス（例: "sebastian/"）
   }
   ```

3. **対象ファイル・関連箇所**
   - `src-tauri/src/lib.rs`

4. **完了条件**
   - AWS S3 および MinIO（S3互換）でアップロード・ダウンロードが動作する

5. **制約・やってはいけないこと**
   - 接続情報（`access_key`, `secret_key`）をログに出力しない
   - バケット作成コマンドは実装しない（バケットは事前に作成済みを前提）

---

### T3-3: フロントエンドS3同期ロジックモジュールの実装

**タイトル:** S3同期の高レベルロジック（push/pull/競合検出）を `src/lib/s3sync.ts` に実装する

**説明:**

1. **使用技術**
   - TypeScript, `invoke`
   - `src/lib/db.ts`（既存: `closeDb`）
   - `src/lib/session.ts`（S3接続情報の復号）

2. **具体的な作業内容**
   - `getS3Config(): Promise<S3Config | null>`: 設定からS3接続情報を取得（暗号化されていれば復号）
   - `s3Push()`: DB をクローズ → S3にアップロード → DB再接続
   - `s3Pull()`: バックアップ作成 → S3からダウンロード → `window.location.reload()`
   - `checkConflict()`: ローカルのDBタイムスタンプとS3の `LastModified` を比較 → `'local_newer' | 'remote_newer' | 'same'` を返す
   - 既存の `sync.ts`（フォルダ同期）との共存: 設定で `sync_mode: 'folder' | 's3' | 'none'` を切り替え

3. **対象ファイル・関連箇所**
   - `src/lib/s3sync.ts`（新規）
   - `src/lib/settings.ts`（S3設定キー追加）
   - `src/lib/sync.ts`（既存: 変更しない）

4. **完了条件**
   - `s3Push()` / `s3Pull()` が正常動作する
   - `checkConflict()` がタイムスタンプ差分を正しく判定する

5. **制約・やってはいけないこと**
   - 既存の `sync.ts`（フォルダ同期）のコードを変更しない
   - DB接続中にファイルコピーしない（必ず `closeDb()` を先に呼ぶ）

---

### T3-4: 起動時競合検出・解決UIの実装

**タイトル:** S3同期モード時に起動時の競合を検出しユーザーに選択させるモーダルを実装する

**説明:**

1. **使用技術**
   - React, TypeScript
   - `src/lib/s3sync.ts`（T3-3）

2. **具体的な作業内容**
   - `S3ConflictModal` コンポーネントを新規作成
   - 表示内容:
     - ローカルDB最終更新日時
     - S3上のDB最終更新日時
     - 「ローカルを使用（S3へアップロード）」ボタン
     - 「クラウドを使用（S3からダウンロード）」ボタン
   - `App.tsx` 起動時: S3モードが有効かつ `remote_newer` または差分ありの場合に表示

3. **対象ファイル・関連箇所**
   - `src/components/S3ConflictModal.tsx`（新規）
   - `src/App.tsx`（起動時チェック追加）

4. **完了条件**
   - 複数デバイスでデータが異なる状態でアプリを起動した際に競合モーダルが表示される
   - 選択に応じて push または pull が実行される

5. **制約・やってはいけないこと**
   - 競合解決を自動でしない（必ずユーザーに選択させる）
   - S3への接続失敗時はモーダルを表示せずサイレントにスキップする（オフライン対応）

---

### T3-5: リアルタイム同期フック（日報完成後）

**タイトル:** 日報承認後に自動でS3にDBをアップロードする処理を追加する

**説明:**

1. **使用技術**
   - `src/lib/s3sync.ts`（T3-3）

2. **具体的な作業内容**
   - `DailyReport.tsx` の「承認・保存する」処理の後に `s3Push()` を呼び出す
   - アップロード中インジケーター（小さなスピナー）を表示
   - アップロード失敗時はトースト通知（エラーのみ、成功通知は不要）
   - S3モードが有効かつリアルタイム設定の場合のみ実行

3. **対象ファイル・関連箇所**
   - `src/pages/DailyReport.tsx`
   - `src/lib/s3sync.ts`

4. **完了条件**
   - 日報承認後にS3へ自動アップロードされる
   - S3モードが無効の場合は何も起きない

5. **制約・やってはいけないこと**
   - アップロード失敗で日報保存処理全体をロールバックしない（S3は非同期・ベストエフォート）

---

### T3-6: バッチ同期タイマーの実装

**タイトル:** 設定間隔（1h/3h/6h）で定期的にS3へDBをアップロードするタイマーを実装する

**説明:**

1. **使用技術**
   - `setInterval`
   - `src/lib/s3sync.ts`（T3-3）

2. **具体的な作業内容**
   - `App.tsx` にバッチ同期タイマーを追加
   - 設定: `s3_sync_interval` キー（`'1h'` / `'3h'` / `'6h'` / `'realtime_only'`）
   - バッチ設定の場合のみ `setInterval` で定期 push
   - アプリが非アクティブ（最小化）中でも実行（Tauriデスクトップアプリのため常駐）
   - 最終同期日時を `last_s3_sync_at` に保存

3. **対象ファイル・関連箇所**
   - `src/App.tsx`
   - `src/lib/settings.ts`（`s3_sync_interval`, `last_s3_sync_at` キー追加）

4. **完了条件**
   - バッチ設定で起動から指定時間後に自動アップロードされる

5. **制約・やってはいけないこと**
   - バッチ同期失敗でユーザーに通知しない（サイレントな失敗でOK、ログのみ）
   - S3モードが無効の場合はタイマーを起動しない

---

### T3-7: S3設定UIをSettings.tsxに追加

**タイトル:** S3接続情報・同期モード・更新タイミングを設定できるUIをSettings画面に追加する

**説明:**

1. **使用技術**
   - React, TypeScript, TailwindCSS v4

2. **具体的な作業内容**
   - 既存の「データ同期」セクションを拡張:
     - 同期モード選択: `フォルダ同期` / `S3同期` / `無効`
     - S3設定（モードがS3の場合のみ表示）:
       - エンドポイントURL（デフォルト: `https://s3.amazonaws.com`）
       - リージョン
       - バケット名
       - アクセスキー（type="password"）
       - シークレットキー（type="password"）
       - プレフィックス（オプション）
       - 更新タイミング: `リアルタイム（日報完成後）` / `1時間おき` / `3時間おき` / `6時間おき`
     - 「接続テスト」ボタン
     - 手動「今すぐ同期（Push）」「今すぐ取得（Pull）」ボタン
     - 最終同期日時表示

3. **対象ファイル・関連箇所**
   - `src/pages/Settings.tsx`
   - `src/lib/settings.ts`（S3設定キー追加）

4. **完了条件**
   - S3接続情報を入力して接続テストが通る
   - 手動Push/Pullが正常動作する

5. **制約・やってはいけないこと**
   - S3接続情報は Phase 2 の `setEncryptedSetting` で保存する
   - バケット作成・削除機能は追加しない

---

### T3-8: Tauri権限設定の更新

**タイトル:** S3通信に必要なTauri権限とCSPを更新する

**説明:**

1. **使用技術**
   - `src-tauri/tauri.conf.json`
   - `src-tauri/capabilities/`

2. **具体的な作業内容**
   - S3通信はRust側（aws-sdk-s3）で行うため、フロントエンドのCSPは変更不要
   - Tauriの `http` プラグイン権限が必要な場合は `capabilities/default.json` に追加
   - `fs` プラグインの権限確認（DB一時バックアップのため）

3. **対象ファイル・関連箇所**
   - `src-tauri/capabilities/default.json`
   - `src-tauri/tauri.conf.json`

4. **完了条件**
   - S3通信がパーミッションエラーなしで動作する

5. **制約・やってはいけないこと**
   - 過剰な権限（`fs:allow-*` のワイルドカード等）を付与しない

---

## 完了チェックリスト

- [ ] T3-1: S3クレート追加
- [ ] T3-2: S3基本操作コマンド実装
- [ ] T3-3: s3sync.tsモジュール実装
- [ ] T3-4: 起動時競合解決モーダル
- [ ] T3-5: リアルタイム同期フック
- [ ] T3-6: バッチ同期タイマー
- [ ] T3-7: Settings.tsx S3設定UI
- [ ] T3-8: Tauri権限設定更新
