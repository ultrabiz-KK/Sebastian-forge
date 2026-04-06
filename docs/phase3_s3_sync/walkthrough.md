# Phase 3: 変更内容ウォークスルー（実装後に更新）

> このファイルは実装完了後にプルリクエスト説明として更新する。

## 変更概要（予定）

- `src-tauri/Cargo.toml`: aws-sdk-s3 / aws-config 追加
- `src-tauri/src/lib.rs`: s3_upload_file / s3_download_file / s3_get_object_mtime / s3_test_connection コマンド追加
- `src/lib/s3sync.ts`: 新規（S3同期高レベルAPI）
- `src/lib/settings.ts`: S3設定キー追加
- `src/components/S3ConflictModal.tsx`: 新規
- `src/App.tsx`: 起動時S3競合チェック追加
- `src/pages/DailyReport.tsx`: リアルタイム同期フック追加
- `src/pages/Settings.tsx`: S3設定UI追加

## 破壊的変更

なし（既存のフォルダ同期はそのまま動作。sync_mode=s3に設定した場合のみS3が有効）
