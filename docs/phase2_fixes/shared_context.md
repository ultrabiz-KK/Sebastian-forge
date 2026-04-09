# Phase 2 修正: 共有コンテキスト

## エージェント間連絡事項

- 2026-04-08: タスク作成完了。Task A（Settings.tsx）と Task B（MasterPasswordSetupModal.tsx）は並列実行可能。
- Task A のサブタスク実装順序: A-1 → A-2 → A-3（依存関係あり）
- 2026-04-09: 追加バグ修正＆UX改善を Settings.tsx に実施（完了）

### 2026-04-09 実施内容（Settings.tsx）

| # | 種別 | 内容 | 実装箇所 |
|---|------|------|----------|
| Bug1 | バグ修正 | handleSaveで空のAPIキーが既存の暗号化済みキーを上書きする問題を修正。空文字の場合はsetEncryptedSettingをスキップ | L480-486 |
| Bug2 | バグ修正 | マスターパスワードのトグルスイッチにflex-shrink-0を追加してデザイン崩れを修正 | L1315 |
| Bug3 | バグ修正 | AI_PROVIDERをPromise.allから分離して先に確実に保存するよう修正 | L477 |
| Bug4 | バグ修正 | ApiKeyFieldに key プロップ追加。プロバイダー切替時にReactがコンポーネントを再利用してstateが引き継がれる問題（未設定キーが入力済みに見える）を修正 | L639,671,693... |
| 改善1 | UX改善 | APIキー編集時、新しい値が入力されるとPencilアイコンがCheckアイコンに変化。Checkをクリックで即時DB保存 | ApiKeyField全体 |
| 改善2 | UX改善 | 新しいキーをCheckボタンで保存した際に「新しいキーを登録しました」トーストを表示（3秒） | L1453-1458 |

---

## 関連ファイル一覧

| ファイル | Task A | Task B | 役割 |
|---------|--------|--------|------|
| `src/pages/Settings.tsx` | ✅ | — | 設定画面全体（A-1, A-2, A-3 の変更対象） |
| `src/components/MasterPasswordSetupModal.tsx` | — | ✅ | パスワード設定モーダル |
| `src/lib/session.ts` | — | ✅(import) | セッション管理（`unlock()` をインポート） |
| `src/lib/settings.ts` | ✅(import) | — | 設定KVストア（`getDecryptedSetting` を使用） |
| `src/lib/ai.ts` | — | — | AI呼び出し（既に `getDecryptedSetting` 使用済み。変更不要） |

---

## 暗号化フロー（復習）

```
保存時:
  APIキー(平文) → setEncryptedSetting() → isUnlocked()? → encrypt() → "ENC:base64(...)" → DB

読み込み時:
  DB → "ENC:base64(...)" → getDecryptedSetting() → isUnlocked()? → decrypt() → APIキー(平文)
                                                   → !isUnlocked → null を返す
```

**重要**: `getSetting()` は生値（`ENC:...` 含む）を返す。UIに表示する場合は必ず `getDecryptedSetting()` を使用すること。

---

## 現在のバグの因果関係

```
Bug 2: パスワード設定後にunlock()を呼んでいない
  ↓
セッション無効のまま
  ↓
Bug 3: getDecryptedSetting() が null を返す → API接続不可
  ↓
Settings load で getSetting() を使用 → ENC:... がフォームに入る
  ↓
再保存で二重暗号化 → 永続的にAPI接続不可
```

Bug 2 の修正は Bug 3 の前提条件。ただし Bug 3 の Settings.tsx 側の修正（getDecryptedSetting使用）も必要。

---

## テスト手順

### Task B 完了後の確認
1. マスターパスワードが未設定の状態で設定画面を開く
2. セキュリティセクションでマスターパスワードを設定
3. セッション状態が「有効」になることを確認
4. APIキーを入力して保存
5. アプリ再起動 → UnlockModal でパスワード入力
6. 設定画面でAPIキーが正しく表示されることを確認
7. 接続テストが成功すること

### Task A 完了後の確認
1. スイッチのデザインが統一されていること（目視）
2. マスターパスワード有効時、APIキーが復号されてフォームに表示されること
3. APIキーフィールドがグレーアウトされていること
4. 編集ボタンクリック後に入力可能になること
5. マスターパスワード有効時、編集開始でフィールドがクリアされること

---

## 既知の問題: ai.ts の withModelOverride 未実装（Phase 3 以降で対応）

### エラー内容

TypeScript ビルド時に以下のエラーが発生:

```
src/lib/ai.ts(130,7): error TS2420: Class 'GeminiProvider' incorrectly implements interface 'AIProvider'.
  Property 'withModelOverride' is missing in type 'GeminiProvider' but required in type 'AIProvider'.
src/lib/ai.ts(249,7): error TS2420: Class 'OllamaProvider' incorrectly implements interface 'AIProvider'.
  Property 'withModelOverride' is missing in type 'OllamaProvider' but required in type 'AIProvider'.
... (全プロバイダークラスで同様)
```

### 原因分析

1. `AIProvider` インターフェース（`ai.ts:79-87`）に `withModelOverride(model: string): AIProvider` が定義されている
2. しかし、各プロバイダークラス（`GeminiProvider`, `OllamaProvider`, `ClaudeProvider`, `OpenAIProvider`, `OpenAICompatibleProvider`）にこのメソッドが実装されていない
3. 各クラスには `_modelOverride` プロパティと内部で使用するロジックは存在するが、`withModelOverride` メソッド自体が未実装

### 詳細箇所

- **インターフェース定義**: `src/lib/ai.ts:79-87`
- **実装が必要なクラス**:
  - `GeminiProvider` (L130)
  - `OllamaProvider` (L249)
  - `ClaudeProvider` (L333)
  - `OpenAIProvider` (L425)
  - `OpenAICompatibleProvider` (L532)
- **影響箇所**: `buildCustomProvider` 関数 (L658, L742, L829) でも `withModelOverride` が必要

### 推定修正方針

各プロバイダークラスに以下のようなメソッドを追加:

```typescript
withModelOverride(model: string): AIProvider {
  const clone = new ThisProviderClass();
  clone._modelOverride = model;
  return clone;
}
```

または、プロバイダーインスタンスをラップするユーティリティ関数を作成。

### 影響範囲

- 現状、機能別プロバイダー設定でモデルオーバーライドが動作しない可能性
- ただし、`vite build` は成功するため、実行時は問題なく動作している可能性が高い（型チェックのみの問題）
- Phase 3 以降で正式に修正することを推奨
