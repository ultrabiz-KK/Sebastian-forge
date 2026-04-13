# Phase 3: 共有コンテキスト

## ステータス
- **フェーズ**: T3-1〜T3-3・T3-5・IMP-1・IMP-4・IMP-6完了。次: T3-4（競合モーダル）
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

## 完了済み実装 (2026-04-13 追記)

### T3-3: s3sync.ts
- `src/lib/s3sync.ts`: `getS3Config` / `s3Push` / `s3Pull` / `checkConflict` 実装済み

### T3-5: DailyReport.tsx リアルタイム同期フック
- `handleApprove` 後に `s3Push()` を呼び出す（SYNC_MODE='s3' かつ S3_SYNC_INTERVAL='realtime_only' または未設定の場合のみ）
- アップロード中スピナー（Loader2）・エラー時オレンジバナー表示
- 保存失敗でロールバックしない（S3はベストエフォート）

### IMP-4: 共通DBクエリ関数
- `src/lib/queries.ts` 新規作成: `loadDailyMemoContent` / `loadDailyReportExists` / `loadAllTasks`
- Dashboard・DailyReport・Memo・WeeklyReport で適用済み

### IMP-6: エラーUI
- Dashboard: `loadError` state + 赤バナー
- DailyReport: `init()` に try/catch 追加（既存 `errorMsg` state 流用）

### settings.ts
- `S3_SYNC_INTERVAL: 's3_sync_interval'` キー追加（T3-6バッチタイマーでも使用）

## エージェント間連絡事項

次エージェントへ: T3-4（競合モーダル）から着手可能。`src/lib/s3sync.ts` の `checkConflict()` / `s3Push()` / `s3Pull()` が利用可能。`SETTING_KEYS.S3_SYNC_INTERVAL` も追加済み。
