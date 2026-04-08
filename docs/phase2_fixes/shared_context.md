# Phase 2 修正: 共有コンテキスト

## エージェント間連絡事項

- 2026-04-08: タスク作成完了。Task A（Settings.tsx）と Task B（MasterPasswordSetupModal.tsx）は並列実行可能。
- Task A のサブタスク実装順序: A-1 → A-2 → A-3（依存関係あり）

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
