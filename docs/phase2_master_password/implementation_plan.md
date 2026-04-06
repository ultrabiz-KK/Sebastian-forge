# Phase 2: マスターパスワード — 実装計画

## 実装ステップ（推奨順序）

```
T2-1 Rustクレート追加
  └─→ T2-2 Rust暗号化コマンド
       └─→ T2-3 セッション管理モジュール（session.ts）
            ├─→ T2-4 パスワード設定モーダル
            ├─→ T2-5 ロック解除モーダル
            └─→ T2-6 セッション期限切れバナー
                 └─→ T2-7 APIキー暗号化保存フロー
                      └─→ T2-8 Settings.tsxセキュリティセクション
```

## 暗号化アーキテクチャ

```
[マスターパスワード（生値）]
        ↓ PBKDF2-HMAC-SHA256（100,000回、ランダムソルト16バイト）
[256bit 暗号化キー]
        ↓ AES-256-GCM（ランダムIV 12バイト）
[暗号文 + 認証タグ]
        ↓ Base64エンコード
[保存値: "salt(16B) + iv(12B) + ciphertext + tag(16B)" → Base64]
```

### パスワード検証フロー

```
[入力パスワード] → bcrypt.verify(input, stored_hash) → true/false
```

### セッション状態管理

```typescript
// メモリのみ保持（localStorage不使用 for APP_RESTART）
let sessionState: {
  password: string | null;  // 生値（復号に使用）
  expiresAt: Date | null;
} = { password: null, expiresAt: null };
```

`FOREVER` および `APP_RESTART` 以外のセッション: `localStorage` に有効期限のみ保存（パスワード生値は保存しない）。
アプリ再起動後、有効期限が残っていてもパスワード再入力が必要（`APP_RESTART` と同様の動作）。

→ **ユーザー体験の妥協点**: セッション期間設定の実用的な意味は「自動ロックのタイミング」を制御すること。

## データベース変更

新設定キー（settingsテーブルに追加）:

| キー | 値 | 説明 |
|-----|----|------|
| `master_password_hash` | bcryptハッシュ文字列 | 未設定=機能オフ |
| `session_duration` | `'app_restart'|'1h'|'6h'|'1d'|'2w'|'1m'|'3m'|'forever'` | セッション期間 |

暗号化済みAPIキーは既存のキーに上書き保存（プレフィックスで識別）:
- 暗号化済み値: `"ENC:base64string"` 形式

## リスクと対策

| リスク | 対策 |
|--------|------|
| パスワード忘れによるAPIキー紛失 | 設定画面に「暗号化を解除して平文に戻す」オプション提供 |
| bcryptの処理時間 | コスト係数12（~300ms）: UIブロックなし（非同期） |
| セッション管理の複雑さ | `session.ts` に集約、他モジュールはAPIのみ使用 |
| Phase 1で追加したカスタムプロバイダーのAPIキー | 同じ暗号化フローで対応 |

## 影響範囲

- `src-tauri/Cargo.toml`: クレート追加
- `src-tauri/src/lib.rs`: 暗号化コマンド追加
- `src/lib/session.ts`: 新規
- `src/lib/settings.ts`: `setEncryptedSetting`/`getDecryptedSetting` 追加
- `src/lib/ai.ts`: APIキー取得を `getDecryptedSetting` 経由に変更
- `src/components/`: モーダル2つ + バナー1つ 新規追加
- `src/components/layout/MainLayout.tsx`: バナー配置
- `src/App.tsx`: 起動時セッションチェック追加
- `src/pages/Settings.tsx`: セキュリティセクション追加
