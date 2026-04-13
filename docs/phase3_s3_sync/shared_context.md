# Phase 3: 共有コンテキスト

## ステータス
- **フェーズ**: T3-1・T3-2・IMP-1完了、T3-3以降実装待ち
- **前提**: Phase 2完了（S3接続情報の暗号化保存のため）
- **最終更新**: 2026-04-13

## 重要な決定事項

- S3通信はRust側（aws-sdk-s3）で完結させる（フロントエンドのCSP変更不要）
- 既存のフォルダ同期（sync.ts）は変更しない。`sync_mode` 設定で切り替え
- 競合解決は自動化しない（必ずユーザー選択）
- S3接続失敗はサイレントスキップ（オフライン時の考慮）
- S3のアクセスキー・シークレットキーは Phase 2の暗号化で保護

## 完了済み実装 (2026-04-13)

### T3-1 + T3-2: Rust S3コマンド
- `src-tauri/Cargo.toml`: `aws-sdk-s3 = "1"` + `aws-config = "1"` 追加
- `src-tauri/src/lib.rs`: `S3Config` struct + 4コマンド実装・登録済み
  - `s3_upload_file` / `s3_download_file` / `s3_get_object_mtime` / `s3_test_connection`
- `cargo build` 完了確認済み

### IMP-1: PBKDF2イテレーション引き上げ
- `encrypt_value` + `decrypt_value` で 100_000 → 210_000 に変更
- **互換性注意**: 既存の暗号化済みAPIキーはデコード不可になる。
  再設定が必要。T3-3以降のUI実装時に案内文を追加すること。

## エージェント間連絡事項

次エージェントへ: T3-3 (s3sync.ts) から着手可能。Rustコマンドのシグネチャは上記の通り。
