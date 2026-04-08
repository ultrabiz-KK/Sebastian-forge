# Phase 2: 共有コンテキスト

## ステータス
- **フェーズ**: T2-3完了（セッション管理モジュール実装済）
- **前提**: Phase 1完了、T2-1・T2-2完了
- **最終更新**: 2026-04-08

## 重要な決定事項

- セッション有効期限は `localStorage` に保存するが、パスワード生値はメモリのみ
- アプリ再起動でセッションは必ずリセット（期限残りでも再入力必要）
- 暗号化済み値の識別: `"ENC:"` プレフィックスで平文と区別
- マスターパスワード未設定時は従来通り平文保存（後方互換）
- `APP_RESTART` / `FOREVER` の場合は localStorage へ保存しない

## 完了タスク

- **T2-1**: bcrypt / aes-gcm / pbkdf2 クレート追加
- **T2-2**: Rust暗号化コマンド実装（`hash_password`, `verify_password`, `encrypt_value`, `decrypt_value`）
- **T2-3**: `src/lib/session.ts` 新規実装、`src/lib/settings.ts` に `MASTER_PASSWORD_HASH` / `SESSION_DURATION` キー追加

## 次タスク（T2-4以降）

- T2-4: パスワード設定モーダル
- T2-5: ロック解除モーダル
- T2-6: セッション期限切れバナー
- T2-7: APIキー暗号化保存フロー（`encrypt`/`decrypt` を `settings.ts` 経由で使用）
- T2-8: Settings.tsx セキュリティセクション
