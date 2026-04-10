# Phase 2 セキュリティレビュー: 高重要度修正 — タスクリスト

> **ステータス凡例**: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了
>
> **前提**: Phase 2 完了後、Phase 3 着手前に対応すること
> **プロジェクトドキュメント**: `./docs/`
> **変更計画を作成し、コードの変更を行う前に確認を求めること。**

---

## 依存関係

```
SR-1（パストラバーサル修正）────── 独立
SR-2（withModelOverride修正）──── 独立
SR-3（暗号化フォールバック修正）── SR-4 の前提
SR-4（セッション未処理修正）───── SR-3 に依存
SR-5（カスタムプロバイダー復号）── SR-3 に依存
SR-6（エラー握りつぶし修正）───── 独立
```

SR-1, SR-2, SR-6 は並列実行可能。SR-3 → SR-4/SR-5 は順次実行。

---

## タスク一覧

### SR-1: Tauriコマンドのパストラバーサル脆弱性を修正する

**タイトル:** `write_text_file`, `read_text_file`, `copy_file` コマンドにパス検証を追加し、任意ファイルアクセスを防止する

**説明:**

1. **使用技術**
   - Rust, Tauri v2
   - `std::path::Path::canonicalize()`
   - `tauri::AppHandle` の `path()` API

2. **具体的な作業内容**
   - 現状、`write_text_file`（L19-27）, `read_text_file`（L29-32）, `copy_file`（L42-51）は渡されたパスをそのまま使用しており、`../../etc/passwd` のようなパストラバーサル攻撃が可能
   - 各コマンドにパス検証ロジックを追加:
     (a) 許可ディレクトリのリストを定義（アプリデータディレクトリ、ユーザー指定の日報/週報保存先、同期フォルダ）
     (b) `Path::canonicalize()` で正規化し、許可ディレクトリの配下にあることを検証
     (c) 検証に失敗した場合は `Err("Access denied: path is outside allowed directories")` を返す
   - `get_db_path`, `get_file_mtime`, `file_exists` も同様に検証を追加

3. **対象ファイル・関連箇所**
   - `src-tauri/src/lib.rs` — L19-27（write_text_file）, L29-32（read_text_file）, L42-51（copy_file）

4. **完了条件**
   - アプリデータディレクトリ内のファイル操作は従来通り動作する
   - ユーザー設定の日報/週報保存先パスでのファイル操作が動作する
   - `../../` を含むパスでのアクセスが拒否される
   - `cd src-tauri && cargo build` が通る

5. **制約・やってはいけないこと**
   - 既存の日報/週報のMarkdown書き出し機能を壊さない（ユーザー指定パスは許可する）
   - フォルダ同期機能（`sync_folder`）のコピー操作を壊さない
   - パス検証のために新しいクレートを追加しない（標準ライブラリで対応）

6. **タスク完了後作業**
   - `docs/codebase_overview/implementation_plan.md` に変更内容を反映

7. **ビルドコマンド**
   - `cd src-tauri && cargo build`

---

### SR-2: AIProviderインターフェースの withModelOverride 未実装を修正する

**タイトル:** 全AIプロバイダークラスに `withModelOverride` メソッドを実装し、`as any` キャストを除去する

**説明:**

1. **使用技術**
   - TypeScript

2. **具体的な作業内容**
   - `AIProvider` インターフェース（L79-87）に定義されている `withModelOverride(model: string): AIProvider` が、以下の5クラスに未実装:
     - `GeminiProvider`（L130）
     - `OllamaProvider`（L249）
     - `ClaudeProvider`（L333）
     - `OpenAIProvider`（L425）
     - `OpenAICompatibleProvider`（L532）
   - 各クラスに `withModelOverride` メソッドを実装する:
     ```typescript
     withModelOverride(model: string): AIProvider {
       const clone = new XxxProvider(/* 必要なコンストラクタ引数 */);
       // 現在のインスタンスの設定をコピー
       clone._modelOverride = model;
       return clone;
     }
     ```
   - `buildCustomProvider` 関数内の `as any`（L828, L847, L857）を除去し、型安全なコードに修正
   - 各プロバイダーの内部で `_modelOverride` を適切に参照するよう確認

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts` — L79-87（インターフェース）, L130/249/333/425/532（各クラス）, L828/847/857（as any）

4. **完了条件**
   - `tsc --noEmit` が型エラーなしで通る
   - `npm run build` が通る
   - `as any` がai.tsから除去されている
   - 機能別プロバイダー設定でモデルオーバーライドが正しく動作する

5. **制約・やってはいけないこと**
   - `AIProvider` インターフェースの既存メソッドシグネチャを変更しない
   - プロバイダーの既存のAPI呼び出しロジックを変更しない
   - インターフェースから `withModelOverride` を削除して逃げない（Phase 3のS3設定で必要になるため）

6. **タスク完了後作業**
   - `docs/codebase_overview/implementation_plan.md` に変更内容を反映

7. **ビルドコマンド**
   - `npm run build`

---

### SR-3: 暗号化失敗時の平文フォールバックを除去する

**タイトル:** `setEncryptedSetting()` の暗号化失敗時に平文保存するフォールバックを除去し、エラーをthrowする

**説明:**

1. **使用技術**
   - TypeScript
   - `src/lib/settings.ts`

2. **具体的な作業内容**
   - `setEncryptedSetting()`（L94-105）の catch ブロック（L100-102）で、暗号化失敗時にAPIキーが平文でDBに保存される
   - これはセキュリティ上重大な問題: ユーザーはマスターパスワードで保護されていると思っているが、実際は平文で保存される
   - 修正内容:
     (a) catch ブロックで平文保存せず、エラーをthrowする
     (b) 呼び出し元（Settings.tsx の保存処理）でcatchし、ユーザーに「暗号化に失敗しました。セッションが有効か確認してください。」等のエラーメッセージを表示
     (c) マスターパスワード未設定時（`isUnlocked() === false` かつ `MASTER_PASSWORD_HASH` が未設定）は従来通り平文保存を許可（後方互換）

3. **対象ファイル・関連箇所**
   - `src/lib/settings.ts` — L94-105（`setEncryptedSetting`）
   - `src/pages/Settings.tsx` — APIキー保存箇所（`handleSave` 内）

4. **完了条件**
   - マスターパスワード設定済み + セッション有効時: APIキーが暗号化されて保存される
   - マスターパスワード設定済み + セッション無効時: 保存がエラーになり、ユーザーに通知される（平文保存されない）
   - マスターパスワード未設定時: 従来通り平文保存される
   - `npm run build` が通る

5. **制約・やってはいけないこと**
   - マスターパスワード未設定ユーザーの既存動作を壊さない
   - `getDecryptedSetting()` のロジックは変更しない
   - `ai.ts` の `getDecryptedSetting()` 呼び出し箇所は変更不要

6. **タスク完了後作業**
   - `docs/codebase_overview/implementation_plan.md` に変更内容を反映

7. **ビルドコマンド**
   - `npm run build`

---

### SR-4: マスターパスワード削除時にセッションをクリアする

**タイトル:** パスワード削除後に `lock()` を呼び出し、メモリ上のパスワードをクリアする

**説明:**

1. **使用技術**
   - TypeScript
   - `src/lib/session.ts` の `lock()` 関数

2. **具体的な作業内容**
   - `MasterPasswordSetupModal.tsx` の `handleDelete()`（L122-136）で、パスワード削除後にメモリ上の `_password` がクリアされない
   - パスワード削除後も `getPassword()` が古いパスワードを返すため、削除後にもかかわらず暗号化操作が可能な状態になる
   - 修正内容:
     (a) `handleDelete()` 内で `setSetting(SETTING_KEYS.MASTER_PASSWORD_HASH, '')` の後に `lock()` を呼び出す
     (b) `lock()` がメモリの `_password` をクリアし、セッション状態をリセットする
     (c) `onPasswordSet()` コールバックでSettings画面のセッション状態表示が更新される

3. **対象ファイル・関連箇所**
   - `src/components/MasterPasswordSetupModal.tsx` — L122-136（`handleDelete`）
   - `src/lib/session.ts` — `lock()` のインポート確認

4. **完了条件**
   - パスワード削除後、`getPassword()` が `null` を返す
   - パスワード削除後、`isUnlocked()` が `false` を返す
   - Settings画面のセッション状態表示が「無効」に更新される
   - `npm run build` が通る

5. **制約・やってはいけないこと**
   - `lock()` 関数の既存ロジックを変更しない
   - パスワード削除時に暗号化済みAPIキーを自動復号・平文変換しない（別途対応が必要な場合は Issue として記録）

6. **タスク完了後作業**
   - `docs/codebase_overview/implementation_plan.md` に変更内容を反映

7. **ビルドコマンド**
   - `npm run build`

---

### SR-5: カスタムプロバイダーのAPIキー復号を修正する

**タイトル:** カスタムプロバイダーのAPIキーが `ENCRYPTED_KEYS` に含まれないため復号されない問題を修正する

**説明:**

1. **使用技術**
   - TypeScript
   - `src/lib/settings.ts` の暗号化・復号API

2. **具体的な作業内容**
   - Settings.tsx L284 で `getDecryptedSetting('__custom_' + p.id)` を呼んでいるが、`settings.ts` の `ENCRYPTED_KEYS`（L60-67）に `__custom_*` キーが含まれていない
   - `getDecryptedSetting()` は `ENCRYPTED_KEYS` にないキーの場合、暗号化プレフィックス `ENC:` を検出せず生値を返す可能性がある
   - 修正方針（2案のうち適切な方を選択）:
     (a) **案A**: `getDecryptedSetting()` を修正して、`ENCRYPTED_KEYS` チェックを廃止し、値が `ENC:` で始まる場合は常に復号を試みる
     (b) **案B**: `setEncryptedSetting()` / `getDecryptedSetting()` にキー名の動的チェック機能を追加し、`__custom_` プレフィックスを持つキーも暗号化対象とする
   - 保存側（`setEncryptedSetting('__custom_' + p.id, apiKey)`）も同様に確認・修正

3. **対象ファイル・関連箇所**
   - `src/lib/settings.ts` — L60-67（`ENCRYPTED_KEYS`）, `getDecryptedSetting()`, `setEncryptedSetting()`
   - `src/pages/Settings.tsx` — L284（カスタムプロバイダー復号）

4. **完了条件**
   - カスタムプロバイダーのAPIキーがマスターパスワード有効時に暗号化保存される
   - Settings画面でカスタムプロバイダーのAPIキーが正しく復号表示される
   - 既存の標準プロバイダー（Gemini, Ollama等）の暗号化動作に影響がない
   - `npm run build` が通る

5. **制約・やってはいけないこと**
   - 標準プロバイダーの暗号化フローを変更しない
   - `ENCRYPTED_KEYS` リストに動的にキーを追加するような複雑な仕組みを導入しない（シンプルに解決する）

6. **タスク完了後作業**
   - `docs/codebase_overview/implementation_plan.md` に変更内容を反映

7. **ビルドコマンド**
   - `npm run build`

---

### SR-6: ai.ts のエラー握りつぶしを修正する

**タイトル:** ai.ts 内の空 catch ブロック・エラー握りつぶしにログ出力を追加し、重要箇所はユーザー通知する

**説明:**

1. **使用技術**
   - TypeScript

2. **具体的な作業内容**
   - ai.ts 内に12箇所以上のエラー握りつぶし（`catch { return null; }`, `catch { return []; }`, `catch { /* 無視 */ }`）が存在
   - 修正方針:
     (a) **全箇所**: 最低限 `console.error('箇所の説明:', error)` を追加し、デバッグを可能にする
     (b) **API呼び出し失敗**（`callAI`, `callAIForJson` 内）: ネットワークエラーとパースエラーを区別し、適切なエラーメッセージを返す
     (c) **モデルリスト取得失敗**（各プロバイダーの `listModels`、L219/314/395/506/624/719）: `console.warn` でログ出力（空配列を返すのは許容）
     (d) **APIキー復号失敗**（L876-877）: 既にthrowしているので変更不要
     (e) **カスタムプロバイダーパース失敗**（L883）: `console.warn` でログ出力
   - `.catch(() => ({}))` のようなfetchレスポンスのJSONパース失敗は、空オブジェクトで握りつぶすのではなく、エラー内容を保持するよう修正

3. **対象ファイル・関連箇所**
   - `src/lib/ai.ts` — L104, 113, 219, 314, 395, 506, 624, 719, 883, 911, 930 他

4. **完了条件**
   - 全ての catch ブロックで最低限ログ出力される
   - API呼び出し失敗時にコンソールにエラー原因が表示される
   - エラーによりアプリがクラッシュしない（既存のフォールバック動作は維持）
   - `npm run build` が通る

5. **制約・やってはいけないこと**
   - エラー握りつぶしの修正を理由にAPIの戻り値の型を変更しない
   - 既存のフォールバック動作（AIが失敗しても固定フレーズで代替）を壊さない
   - ユーザー向けのエラーUIは追加しない（ログ出力のみ。UIは各ページ側の責務）

6. **タスク完了後作業**
   - `docs/codebase_overview/implementation_plan.md` に変更内容を反映

7. **ビルドコマンド**
   - `npm run build`

---

## 完了チェックリスト

- [ ] SR-1: パストラバーサル脆弱性修正
- [ ] SR-2: withModelOverride 実装
- [ ] SR-3: 暗号化フォールバック除去
- [ ] SR-4: パスワード削除時セッションクリア
- [ ] SR-5: カスタムプロバイダー復号修正
- [ ] SR-6: エラー握りつぶし修正

---

## タスク完了後作業

- [ ] `docs/codebase_overview/implementation_plan.md` に変更内容を反映
- [ ] Rust変更（SR-1）: `cd src-tauri && cargo build`
- [ ] TypeScript変更（SR-2〜SR-6）: `npm run build`（`tsc && vite build`）
