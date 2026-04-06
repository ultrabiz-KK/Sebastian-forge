# Phase 1: AI APIプロバイダー拡充 — タスクリスト

> **ステータス凡例**: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了

---

## タスク一覧

### T1-1: プロバイダー抽象化インターフェースの定義

**タイトル:** `ai.ts` をプロバイダー抽象化アーキテクチャへリファクタリングする

**説明:**

1. **使用技術**
   - TypeScript インターフェース / discriminated union
   - 既存: `src/lib/ai.ts`, `src/lib/settings.ts`

2. **具体的な作業内容**
   - `AIProvider` インターフェースを定義（`callText`, `callJson`, `listModels`, `testConnection`）
   - 各プロバイダーを実装クラスとして分離（`GeminiProvider`, `OllamaProvider`, `ClaudeProvider` など）
   - `getProvider(key: ProviderKey): AIProvider` ファクトリ関数を実装
   - 既存の `callAI()` / `callAIForJson()` をファクトリ経由に変更
   - 機能別プロバイダー解決ロジックを実装（グローバル設定 → 機能別設定のフォールバック）

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts`（全面改修）
   - `src/lib/settings.ts`（SETTING_KEYS拡張）

4. **完了条件**
   - 既存の Gemini / Ollama が引き続き動作する
   - 新しいプロバイダーを追加する際に `callAI()` 呼び出し側を変更しなくて済む構造になっている
   - 機能別プロバイダー設定キーが `SETTING_KEYS` に定義されている

5. **制約・やってはいけないこと**
   - 各ページ（DailyReport.tsx等）の `callAI()` 呼び出し箇所は変更しない（インターフェース互換を保つ）
   - グローバルストア導入禁止（既存の useState/DB パターンを維持）

---

### T1-2: Claude API対応

**タイトル:** Anthropic Claude APIをプロバイダーとして実装する

**説明:**

1. **使用技術**
   - Anthropic Messages API（`https://api.anthropic.com/v1/messages`）
   - fetch API（SDKは使わず生HTTPで実装）

2. **具体的な作業内容**
   - `ClaudeProvider` クラスを実装
   - `x-api-key` / `anthropic-version` ヘッダーを付与したリクエスト
   - レスポンスから `content[0].text` を抽出
   - JSON モードは system prompt で指示（Claude はネイティブ JSON モード非対応）
   - `listModels()`: `GET /v1/models` で取得
   - `testConnection()`: 最小トークンで疎通確認

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts`（ClaudeProvider追加）
   - `src-tauri/tauri.conf.json`（CSP: `https://api.anthropic.com` 追加）

4. **完了条件**
   - Settings画面で Claude を選択してAPIキーを入力し、接続テストが通る
   - 日報生成が Claude API 経由で動作する

5. **制約・やってはいけないこと**
   - `@anthropic-ai/sdk` パッケージの導入禁止（バンドルサイズ増加を避けるため生fetchで実装）
   - APIキーをログ・エラーメッセージに含めない

---

### T1-3: OpenAI API対応

**タイトル:** OpenAI APIをプロバイダーとして実装する

**説明:**

1. **使用技術**
   - OpenAI Chat Completions API（`https://api.openai.com/v1/chat/completions`）
   - fetch API

2. **具体的な作業内容**
   - `OpenAIProvider` クラスを実装
   - `Authorization: Bearer {key}` ヘッダー
   - `response_format: { type: 'json_object' }` で JSON モード
   - `listModels()`: `GET /v1/models` で取得、`gpt-*` / `o*` モデルをフィルタリング
   - `testConnection()`: 疎通確認

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts`
   - `src-tauri/tauri.conf.json`（CSP: `https://api.openai.com` 追加）

4. **完了条件**
   - OpenAI を選択してAPIキーを入力し、接続テストが通る
   - 日報生成が OpenAI API 経由で動作する

5. **制約・やってはいけないこと**
   - `openai` npm パッケージの導入禁止

---

### T1-4: OpenAI互換プロバイダー対応（Groq / OpenRouter / nano-gpt / LM Studio）

**タイトル:** OpenAI互換APIのデフォルトプロバイダー群を実装する

**説明:**

1. **使用技術**
   - OpenAI Chat Completions互換API
   - fetch API

2. **具体的な作業内容**
   - `OpenAICompatibleProvider` 基底クラスを実装（エンドポイントとキーを注入可能）
   - 以下のプリセットを定義:

     | プロバイダー | エンドポイント | 備考 |
     |---|---|---|
     | Groq | `https://api.groq.com/openai` | キーのみ入力 |
     | OpenRouter | `https://openrouter.ai/api` | キーのみ入力 |
     | nano-gpt | `https://nano-gpt.com/api` | キーのみ入力 |
     | LM Studio | ユーザー入力（例: `http://localhost:1234`） | エンドポイント+キー入力 |

   - LM Studio はエンドポイント入力UIを追加

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts`
   - `src-tauri/tauri.conf.json`（CSP各エンドポイント追加）

4. **完了条件**
   - 各プロバイダーで接続テストが通る
   - LM Studio でカスタムエンドポイントを入力して疎通確認できる

5. **制約・やってはいけないこと**
   - 各プロバイダーに個別クラスを作らない（`OpenAICompatibleProvider` の設定で吸収する）

---

### T1-5: カスタムプロバイダー登録機能

**タイトル:** ユーザーが任意のOpenAI/Claude互換エンドポイントを登録・管理できる機能を実装する

**説明:**

1. **使用技術**
   - SQLite（settingsテーブルにJSON配列で保存）
   - TypeScript

2. **具体的な作業内容**
   - カスタムプロバイダー定義型: `{ id, name, type: 'openai_compat'|'claude_compat', endpoint, apiKey, modelOverride? }`
   - `SETTING_KEYS.custom_providers` にJSON文字列として保存
   - CRUD UI（追加・編集・削除）を Settings.tsx に実装
   - 登録したカスタムプロバイダーはプロバイダー選択ドロップダウンに表示

3. **対象ファイル・関連箇所**
   - `src/lib/settings.ts`（SETTING_KEYS追加）
   - `src/lib/ai.ts`（カスタムプロバイダー読み込み）
   - `src/pages/Settings.tsx`

4. **完了条件**
   - カスタムプロバイダーを追加し、接続テストが通る
   - 追加したプロバイダーが機能別設定の選択肢に表示される

5. **制約・やってはいけないこと**
   - カスタムプロバイダーのAPIキーはPhase 2完了まで平文保存（Phase 2で暗号化対応）
   - 別テーブル作成禁止（settings KVで管理）

---

### T1-6: 全プロバイダーのモデル一覧取得とキャッシュ

**タイトル:** 全プロバイダーのモデル一覧をAPIから取得しキャッシュする

**説明:**

1. **使用技術**
   - 各プロバイダーのモデル一覧API
   - `SETTING_KEYS` にキャッシュ保存

2. **具体的な作業内容**
   - 各プロバイダーの `listModels()` 実装:
     - Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models`
     - Claude: `GET https://api.anthropic.com/v1/models`
     - OpenAI / 互換: `GET {endpoint}/v1/models`
     - Ollama: `GET {endpoint}/api/tags`（既存）
   - 取得結果を `{provider_id}_models_cache` キーに保存（TTL: 1時間）
   - キャッシュ有効期間内は再取得しない

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts`（listModels実装）
   - `src/lib/settings.ts`（キャッシュキー追加）

4. **完了条件**
   - 全プロバイダーでモデル一覧が取得できる
   - キャッシュが機能し、同じセッション内で2回目以降はAPIを叩かない

5. **制約・やってはいけないこと**
   - モデル一覧取得の失敗でアプリがクラッシュしないようにする（フォールバック: 手動入力）
   - 毎回APIを叩かない（TTLキャッシュ必須）

---

### T1-7: モデル選択UI（検索機能・プロバイダーグループ表示）

**タイトル:** プロバイダーをグループ見出しとして表示するモデル選択コンポーネントを実装する

**説明:**

1. **使用技術**
   - React, TypeScript
   - `src/components/ClassicUI.tsx`（デザインシステム）

2. **具体的な作業内容**
   - `ModelSelector` コンポーネントを新規作成
   - モデル名でインクリメンタル検索
   - プロバイダーごとにグループ見出しを表示
   - 選択中モデルをハイライト
   - ローディング状態（取得中スピナー）
   - 取得失敗時のフォールバック（手動入力フィールドに切替）

3. **対象ファイル・関連箇所**
   - `src/components/ModelSelector.tsx`（新規）
   - `src/pages/Settings.tsx`（組み込み）

4. **完了条件**
   - 検索ボックスで絞り込みができる
   - プロバイダーの区切り見出しが表示される
   - 選択したモデルが設定に保存される

5. **制約・やってはいけないこと**
   - 外部UIライブラリ（react-select等）の導入禁止（既存のClassicUI.tsxスタイルを踏襲）

---

### T1-8: 機能別AIプロバイダー設定UI

**タイトル:** 日報・週報・ブリーフィング・カレンダー・タスク抽出の各機能にプロバイダー選択を追加する

**説明:**

1. **使用技術**
   - React, settings.ts

2. **具体的な作業内容**
   - `SETTING_KEYS` に以下を追加:
     - `feature_provider_daily_report`
     - `feature_provider_weekly_report`
     - `feature_provider_briefing`
     - `feature_provider_calendar_comment`
     - `feature_provider_task_extract`
   - 値が未設定（空）の場合はグローバル設定にフォールバック
   - Settings.tsx の AI設定セクションに機能別プロバイダー選択を追加
   - `getProviderForFeature(feature: FeatureKey): AIProvider` ヘルパー実装

3. **対象ファイル・関連箇所**
   - `src/lib/settings.ts`
   - `src/lib/ai.ts`
   - `src/pages/Settings.tsx`

4. **完了条件**
   - 機能別にプロバイダーを設定すると、その機能だけ別プロバイダーで動作する
   - 未設定時はグローバル設定で動作する

5. **制約・やってはいけないこと**
   - 各ページ（DailyReport.tsx等）の呼び出しコードは変更しない

---

### T1-9: Settings.tsx AI設定セクション全面刷新

**タイトル:** 増えたプロバイダーに対応するSettings画面のAI設定UIを実装する

**説明:**

1. **使用技術**
   - React, TypeScript, TailwindCSS v4

2. **具体的な作業内容**
   - プロバイダー一覧（プリセット + カスタム）の選択・設定UI
   - 各プロバイダーのAPIキー入力（type="password"）
   - 接続テストボタン（各プロバイダー個別）
   - モデル選択（T1-7の ModelSelector コンポーネントを使用）
   - 機能別プロバイダー設定（T1-8）
   - カスタムプロバイダー管理（T1-5）

3. **対象ファイル・関連箇所**
   - `src/pages/Settings.tsx`

4. **完了条件**
   - 全プロバイダーの設定・テストが Settings 画面から操作できる
   - 既存のGemini/Ollama設定が引き続き動作する

5. **制約・やってはいけないこと**
   - 既存の他セクション（レポート保存先・終業リマインド等）のUIを変更しない

---

### T1-10: CSP（コンテンツセキュリティポリシー）更新

**タイトル:** 新規プロバイダーのAPIエンドポイントをCSPに追加する

**説明:**

1. **使用技術**
   - `src-tauri/tauri.conf.json`

2. **具体的な作業内容**
   - `connect-src` に以下を追加:
     - `https://api.anthropic.com`
     - `https://api.openai.com`
     - `https://api.groq.com`
     - `https://openrouter.ai`
     - `https://nano-gpt.com`
   - LM Studio / カスタムプロバイダーはローカルアドレスのため既存の `'self'` で対応可否を確認

3. **対象ファイル・関連箇所**
   - `src-tauri/tauri.conf.json`

4. **完了条件**
   - 全プロバイダーへの通信がCSPエラーなしで通る

5. **制約・やってはいけないこと**
   - `connect-src '*'` のようなワイルドカードを使用しない

---

## 完了チェックリスト

- [x] T1-1: プロバイダー抽象化
- [x] T1-2: Claude API
- [x] T1-3: OpenAI API
- [x] T1-4: OpenAI互換プロバイダー群
- [x] T1-5: カスタムプロバイダー登録
- [x] T1-6: モデル一覧取得・キャッシュ
- [x] T1-7: モデル選択UI
- [x] T1-8: 機能別プロバイダー設定
- [x] T1-9: Settings.tsx刷新
- [x] T1-10: CSP更新
