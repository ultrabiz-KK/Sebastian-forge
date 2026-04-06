# Phase 3: S3クラウド同期 — 実装計画

## 実装ステップ（推奨順序）

```
T3-1 S3クレート追加
  └─→ T3-2 S3基本操作コマンド（Rust）
       └─→ T3-3 s3sync.tsモジュール
            ├─→ T3-4 起動時競合解決UI
            ├─→ T3-5 リアルタイム同期フック
            └─→ T3-6 バッチ同期タイマー
                 └─→ T3-7 Settings.tsx S3設定UI
                      └─→ T3-8 Tauri権限設定
```

## S3設定キー一覧

```typescript
SETTING_KEYS = {
  // 既存
  sync_folder: 'sync_folder',
  last_sync_at: 'last_sync_at',

  // 新規（Phase 3）
  sync_mode: 'sync_mode',               // 'folder' | 's3' | 'none'
  s3_endpoint: 's3_endpoint',           // 暗号化対象（Phase 2）
  s3_region: 's3_region',
  s3_bucket: 's3_bucket',
  s3_access_key: 's3_access_key',       // 暗号化対象
  s3_secret_key: 's3_secret_key',       // 暗号化対象
  s3_prefix: 's3_prefix',
  s3_sync_interval: 's3_sync_interval', // 'realtime' | '1h' | '3h' | '6h'
  last_s3_sync_at: 'last_s3_sync_at',
}
```

## 同期フロー詳細

### Push（ローカル→S3）

```
1. getS3Config() で接続情報取得（復号含む）
2. closeDb() で SQLite接続を閉じる
3. s3_upload_file(dbPath, "sebastian.db") で S3にアップロード
4. getDb() で再接続（DB再利用のため）
5. last_s3_sync_at を更新
```

### Pull（S3→ローカル）

```
1. getS3Config()
2. closeDb()
3. ローカルDBをタイムスタンプ付きでバックアップ
4. s3_download_file("sebastian.db", dbPath)
5. window.location.reload()（既存のfolder sync と同様）
```

### 競合検出

```
起動時:
1. S3モードが有効か確認
2. s3_get_object_mtime("sebastian.db") で S3の最終更新時刻を取得
3. get_file_mtime(dbPath) でローカルの最終更新時刻を取得
4. 差分が60秒以上なら競合モーダルを表示
```

## S3互換ストレージ対応

`aws-sdk-s3` はエンドポイントを変更するだけでS3互換ストレージに対応:

```rust
let config = aws_config::defaults(BehaviorVersion::latest())
    .endpoint_url(&s3_config.endpoint)
    .region(Region::new(s3_config.region.clone()))
    .credentials_provider(Credentials::new(
        &s3_config.access_key,
        &s3_config.secret_key,
        None, None, "sebastian"
    ))
    .load()
    .await;
```

対応確認済みサービス（想定）: AWS S3, MinIO, Cloudflare R2, Wasabi, BackBlaze B2

## リスクと対策

| リスク | 対策 |
|--------|------|
| S3への接続失敗（オフライン） | エラーをサイレントにスキップ、最終同期日時を表示 |
| DBアップロード中のアプリクラッシュ | S3のPutObjectはアトミック操作のため部分書き込みなし |
| 大きなDBファイルのアップロード時間 | SQLiteの特性上DBは通常数MB以内、タイムアウトは60秒 |
| 競合解決の誤操作 | 選択前に「この操作は元に戻せません」の警告を表示 |

## 影響範囲

- `src-tauri/Cargo.toml`: aws-sdk-s3追加
- `src-tauri/src/lib.rs`: S3コマンド追加（4つ）
- `src/lib/s3sync.ts`: 新規
- `src/lib/settings.ts`: S3設定キー追加
- `src/components/S3ConflictModal.tsx`: 新規
- `src/App.tsx`: 起動時競合チェック追加
- `src/pages/DailyReport.tsx`: リアルタイム同期フック追加
- `src/pages/Settings.tsx`: S3設定セクション追加
- `src-tauri/capabilities/default.json`: 権限確認・更新
