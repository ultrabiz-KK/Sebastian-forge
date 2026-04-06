# Phase 2: 変更内容ウォークスルー（実装後に更新）

> このファイルは実装完了後にプルリクエスト説明として更新する。

## 変更概要（予定）

- `src-tauri/Cargo.toml`: bcrypt / aes-gcm / pbkdf2 / rand / base64 追加
- `src-tauri/src/lib.rs`: hash_password / verify_password / encrypt_value / decrypt_value コマンド追加
- `src/lib/session.ts`: 新規（セッション状態管理）
- `src/lib/settings.ts`: setEncryptedSetting / getDecryptedSetting 追加
- `src/lib/ai.ts`: APIキー取得を復号経由に変更
- `src/components/MasterPasswordSetupModal.tsx`: 新規
- `src/components/UnlockModal.tsx`: 新規
- `src/components/SessionExpiredBanner.tsx`: 新規
- `src/components/layout/MainLayout.tsx`: バナー追加
- `src/App.tsx`: 起動時セッションチェック
- `src/pages/Settings.tsx`: セキュリティセクション追加

## 破壊的変更

なし（マスターパスワード未設定時は従来通り動作）
