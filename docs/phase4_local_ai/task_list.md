# Phase 4: ローカルAI（Bonsai-8B）— タスクリスト

> **ステータス凡例**: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了
>
> **前提**: Phase 1（AIプロバイダー拡充）完了後に着手可能
>
> **技術前提**:
> - llama-server はインストーラーに同梱しない（初回使用時にダウンロード or ユーザービルド）
> - PrismMLフォーク版のプリビルドバイナリを使用: https://github.com/PrismML-Eng/llama.cpp
> - ビルドスクリプトをアプリに同梱（インターネット接続必須）
> - GPU: 当面CPUのみ対応

---

## タスク一覧

### T4-1: llama-serverビルドスクリプトの作成

**タイトル:** PrismMLフォーク版llama.cppをビルドするクロスプラットフォームスクリプトを作成する

**説明:**

1. **使用技術**
   - Bash（Unix/Mac用）
   - PowerShell（Windows用）
   - CMake 3.14+
   - Git

2. **具体的な作業内容**
   - `scripts/build_llama_server.sh`（Unix）を作成:
     ```bash
     # 1. git clone PrismML-Eng/llama.cpp (prismブランチ)
     # 2. cmake -B build -DLLAMA_BUILD_SERVER=ON -DGGML_NATIVE=OFF
     # 3. cmake --build build --config Release --target llama-server
     # 4. バイナリをアプリデータディレクトリにコピー
     ```
   - `scripts/build_llama_server.ps1`（Windows）を作成（同内容）
   - ビルド先パス: `%APPDATA%/Sebastian/bin/llama-server.exe`（Windows）
   - ビルド成功確認: `llama-server --version` を実行して終了コードを確認

3. **対象ファイル・関連箇所**
   - `scripts/build_llama_server.sh`（新規）
   - `scripts/build_llama_server.ps1`（新規）

4. **完了条件**
   - スクリプトを実行するとビルドが完了し `llama-server` バイナリが生成される
   - README にビルド手順が記載されている

5. **制約・やってはいけないこと**
   - ビルドスクリプトはアプリ起動時に自動実行しない（ユーザーが明示的に実行）
   - バイナリをリポジトリにコミットしない（.gitignoreに追加）

---

### T4-2: Rust側サブプロセス管理コマンドの実装

**タイトル:** llama-serverの起動・停止・ヘルスチェックを行うTauriコマンドをlib.rsに実装する

**説明:**

1. **使用技術**
   - `std::process::Command`（Rustサブプロセス管理）
   - `std::sync::Mutex<Option<Child>>`（プロセスハンドル保持）
   - Tauri `State`（プロセスハンドルのグローバル管理）

2. **具体的な作業内容**
   - アプリ状態として `LlamaServerState(Mutex<Option<Child>>)` を定義
   - `start_llama_server(model_path: String, port: u16) -> Result<(), String>`:
     - `llama-server -m {model_path} --port {port} -c 4096` を起動
     - ポート競合チェック（使用中なら別ポートを試行）
     - プロセスハンドルを State に保存
   - `stop_llama_server() -> Result<(), String>`:
     - 保持しているプロセスを `kill()`
   - `llama_server_status() -> Result<String, String>`:
     - `"running"` / `"stopped"` / `"not_installed"` を返す
     - バイナリの存在確認 + 起動中チェック
   - アプリ終了時（`on_window_event`）に自動で `stop_llama_server` を呼ぶ

3. **対象ファイル・関連箇所**
   - `src-tauri/src/lib.rs`

4. **完了条件**
   - `start_llama_server` でプロセスが起動し、`stop_llama_server` で停止できる
   - アプリ終了時にllama-serverが自動停止する（ゾンビプロセスが残らない）

5. **制約・やってはいけないこと**
   - llama-serverの標準出力をUI上に全表示しない（ログファイルに書き出すのみ）
   - プロセス起動失敗でアプリ全体がクラッシュしないようにする

---

### T4-3: モデルダウンロードマネージャーの実装

**タイトル:** HuggingFace Hub APIからBonsai GGUFモデルをダウンロードする機能を実装する

**説明:**

1. **使用技術**
   - HuggingFace Hub API（`https://huggingface.co`）
   - Rust: `reqwest` crate（ストリーミングダウンロード）
   - Tauri イベント（ダウンロード進捗のフロントエンド通知）

2. **具体的な作業内容**
   - `download_model(repo_id: String, filename: String, dest_dir: String) -> Result<(), String>` コマンド実装:
     - HuggingFace CDN URL: `https://huggingface.co/{repo_id}/resolve/main/{filename}`
     - ストリーミングダウンロード
     - 進捗を `tauri::Emitter::emit` でフロントエンドに送信（`model_download_progress` イベント）
     - 再開可能ダウンロード: `Content-Range` ヘッダーで途中再開
   - ダウンロード対象モデル（プリセット）:
     - `prism-ml/Bonsai-8B-gguf`: Q4_K_M（推奨）/ Q8_0 / Q1_0
   - `list_models(models_dir: String) -> Result<Vec<String>, String>`: 既存GGUFファイル一覧
   - `delete_model(path: String) -> Result<(), String>`: モデルファイル削除

3. **対象ファイル・関連箇所**
   - `src-tauri/src/lib.rs`（ダウンロードコマンド）
   - `src-tauri/Cargo.toml`（reqwest追加: `features = ["stream"]`）
   - `src-tauri/tauri.conf.json`（CSP: `https://huggingface.co` 追加）

4. **完了条件**
   - モデルダウンロードが開始でき、進捗がUIに表示される
   - ダウンロード中断後に再開できる

5. **制約・やってはいけないこと**
   - HuggingFaceのAPIトークンを要求しない（公開モデルのため不要）
   - モデルをアプリバンドルに含めない

---

### T4-4: モデル管理UIの実装

**タイトル:** モデルのダウンロード・削除・選択・GGUF手動指定を行うUIコンポーネントを実装する

**説明:**

1. **使用技術**
   - React, TypeScript, TailwindCSS v4

2. **具体的な作業内容**
   - `LocalAIModelManager` コンポーネントを新規作成:
     - プリセットモデル一覧（Bonsai-8B Q4/Q8/Q1）とサイズ表示
     - ダウンロードボタン + プログレスバー（`model_download_progress` イベントを購読）
     - ダウンロード済みモデルに「削除」ボタン
     - ダウンロード済みモデルの選択（ラジオボタン）
     - ユーザー所持GGUFファイルのパス指定（ファイルダイアログ）
   - llama-serverバイナリの有無チェック + 未インストール時のビルド手順案内

3. **対象ファイル・関連箇所**
   - `src/components/LocalAIModelManager.tsx`（新規）
   - `src/pages/Settings.tsx`（ローカルAIセクションに組み込み）

4. **完了条件**
   - プリセットモデルをダウンロードし、進捗が表示される
   - ダウンロード完了後にモデルを選択できる
   - GGUFファイルをパスで指定して使用できる

5. **制約・やってはいけないこと**
   - ダウンロード完了前に「使用開始」を選択できる状態にしない
   - モデルディレクトリ外へのパス指定を許可しない（セキュリティ）

---

### T4-5: BonsaiAIプロバイダーの実装とPhase 1への統合

**タイトル:** llama-serverをOpenAI互換APIとして使用するBonsaiプロバイダーをai.tsに実装する

**説明:**

1. **使用技術**
   - OpenAI Chat Completions互換API（llama-server が提供）
   - `src/lib/ai.ts`（Phase 1のプロバイダー抽象化）

2. **具体的な作業内容**
   - `BonsaiProvider` クラスを実装（`OpenAICompatibleProvider` を継承）
   - エンドポイント: `http://localhost:{port}/v1`（ポートは設定可能、デフォルト8080）
   - `testConnection()`: `/v1/models` で疎通確認 + llama-serverが起動中か確認
   - `callText()` / `callJson()`: OpenAI互換形式でリクエスト
   - プロバイダー選択時にllama-serverを自動起動、未選択時に停止
   - ヘルスチェックリトライ（起動完了まで最大30秒待機）

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts`
   - `src/lib/settings.ts`（`local_ai_port`, `local_ai_model_path` キー追加）

4. **完了条件**
   - Settings でBonsaiプロバイダーを選択するとllama-serverが起動する
   - 日報生成がBonsai経由で動作する

5. **制約・やってはいけないこと**
   - CSP上の制約: `http://localhost:*` が `connect-src` に含まれているか確認（Ollamaと同じ扱い）
   - llama-server起動中にモデル変更を許可しない（停止→変更→再起動の手順を強制）

---

### T4-6: Settings.tsxにローカルAIセクションを追加

**タイトル:** Settings画面にローカルAI（Bonsai）の設定・管理UIセクションを追加する

**説明:**

1. **使用技術**
   - React, TypeScript, TailwindCSS v4

2. **具体的な作業内容**
   - 新セクション「ローカルAI（Bonsai）」を追加（デフォルト折りたたみ）
   - 内容:
     - 有効/無効トグル
     - モデルストレージパス設定（デフォルト: `%APPDATA%/Sebastian/models/`）
     - `LocalAIModelManager`（T4-4）の組み込み
     - llama-serverバイナリ状態表示（「未インストール」/「インストール済み」/「起動中」）
     - ポート設定（デフォルト: 8080）
     - ビルドスクリプトの案内（GitHub, CMakeが必要な旨を説明 + スクリプトパスを表示）

3. **対象ファイル・関連箇所**
   - `src/pages/Settings.tsx`

4. **完了条件**
   - Settings からローカルAIの有効化・モデル管理・サーバー管理ができる
   - ビルドスクリプトへの案内が表示される

5. **制約・やってはいけないこと**
   - ローカルAIセクションはデフォルトで折りたたみ状態にする（設定画面の肥大化を防ぐ）
   - アプリ内から `cmake` や `git` を自動実行しない（ユーザーが手動でスクリプトを実行）

---

### T4-7: アプリ終了時のクリーンアップ処理

**タイトル:** アプリ終了時にllama-serverを確実に停止するクリーンアップを実装する

**説明:**

1. **使用技術**
   - Tauri `on_window_event`
   - Rust `std::process::Child::kill()`

2. **具体的な作業内容**
   - `lib.rs` の `run()` 関数内で `CloseRequested` イベントをハンドル
   - llama-serverが起動中なら停止してからウィンドウを閉じる
   - 停止失敗時もアプリ終了を妨げない（タイムアウト2秒）

3. **対象ファイル・関連箇所**
   - `src-tauri/src/lib.rs`

4. **完了条件**
   - アプリを終了後に `llama-server.exe` がタスクマネージャーに残らない

5. **制約・やってはいけないこと**
   - llama-server停止でアプリ終了が10秒以上ブロックされないようにする

---

## 完了チェックリスト

- [ ] T4-1: ビルドスクリプト作成
- [ ] T4-2: Rustサブプロセス管理コマンド
- [ ] T4-3: モデルダウンロードマネージャー
- [ ] T4-4: モデル管理UI
- [ ] T4-5: BonsaiAIプロバイダー実装
- [ ] T4-6: Settings.txsローカルAIセクション
- [ ] T4-7: アプリ終了時クリーンアップ

---

## 補足: llama-serverバイナリ配布について

インストーラーへの同梱は行わず、以下の方式を採用:

1. **推奨（初回使用時）**: Settings画面の案内に従い、ユーザーがビルドスクリプトを実行
   - `scripts/build_llama_server.ps1`（Windows）
   - `scripts/build_llama_server.sh`（Unix/Mac）
2. **代替**: ユーザーが自分でPrismMLフォーク版をビルドして `%APPDATA%/Sebastian/bin/` に配置

インターネット接続とCMake/Git/C++コンパイラが必要。
