# 共有コンテキスト — Sebastian v1.1.1

このファイルは開発者・AI エージェント間で共有する参照情報をまとめたもの。
新規機能開発・バグ修正の際に最初に参照すること。

---

## データベーススキーマ（全テーブル）

### `daily_memos`
```sql
CREATE TABLE daily_memos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL UNIQUE,     -- yyyy-MM-dd 形式
  content    TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `tasks`
```sql
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo',  -- todo|in_progress|done|hold
  priority    TEXT DEFAULT 'none',            -- high|medium|low|none
  due_date    TEXT,                           -- yyyy-MM-dd または NULL
  category    TEXT,
  archived    INTEGER DEFAULT 0,             -- 0=通常, 1=アーカイブ
  pinned      INTEGER DEFAULT 0,             -- 0=通常, 1=ピン留め
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `task_logs`
```sql
CREATE TABLE task_logs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id            INTEGER NOT NULL,
  action_type        TEXT NOT NULL,  -- create|update|status_change|delete|archive|restore|pin|unpin
  before_json        TEXT,           -- 変更前スナップショット（JSON 文字列）
  after_json         TEXT,           -- 変更後スナップショット（JSON 文字列）
  actor_type         TEXT NOT NULL,  -- user|ai
  source_type        TEXT,           -- manual|memo|daily_report|weekly_report
  source_id          TEXT,
  suggestion_group_id TEXT,
  applied_by         TEXT,
  note               TEXT,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### `reports_daily`
```sql
CREATE TABLE reports_daily (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL UNIQUE,   -- yyyy-MM-dd 形式
  content    TEXT NOT NULL,          -- Markdown 本文
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `reports_weekly`
```sql
CREATE TABLE reports_weekly (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start_date  TEXT NOT NULL UNIQUE,  -- yyyy-MM-dd（月曜日）
  content          TEXT NOT NULL,         -- Markdown 本文
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `settings`
```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## SETTING_KEYS 定数一覧（settings.ts）

```typescript
DAILY_REPORT_PATH    = 'daily_report_path'
WEEKLY_REPORT_PATH   = 'weekly_report_path'
GLOBAL_SHORTCUT      = 'global_shortcut'
AUTOSTART_ENABLED    = 'autostart_enabled'
AI_PROVIDER          = 'ai_provider'        // 'ollama'|'gemini'|'disabled'
OLLAMA_ENDPOINT      = 'ollama_endpoint'
OLLAMA_MODEL         = 'ollama_model'
GEMINI_API_KEY       = 'gemini_api_key'
GEMINI_MODEL         = 'gemini_model'
REMINDER_ENABLED     = 'reminder_enabled'
REMINDER_TIME        = 'reminder_time'
REMINDER_WEEKDAYS_ONLY = 'reminder_weekdays_only'
LAST_BRIEFING_DATE   = 'last_briefing_date'
BUTLER_BRIEFING      = 'butler_briefing'    // JSON キャッシュ
THEME                = 'theme'              // 'light'|'dark'|'sepia'
SYNC_FOLDER          = 'sync_folder'
LAST_SYNC_AT         = 'last_sync_at'       // ISO 文字列
```

---

## 優先度・ステータス定数（constants.ts）

### 優先度

| 値 | ラベル | Tailwind クラス |
|----|--------|----------------|
| `high` | 高 | `bg-red-50 text-red-600 border-red-100` |
| `medium` | 中 | `bg-blue-50 text-blue-600 border-blue-100` |
| `low` | 低 | `bg-gray-50 text-gray-500 border-gray-100` |
| `none` | なし | `bg-gray-50 text-gray-400 border-gray-100` |

### ステータス

| 値 | ラベル |
|----|--------|
| `todo` | 未着手 |
| `in_progress` | 進行中 |
| `done` | 完了 |
| `hold` | 保留 |
| `archived` | アーカイブ |

---

## ルーティング一覧（App.tsx）

| パス | コンポーネント | 説明 |
|------|--------------|------|
| `/` | `Dashboard` | ホーム（タスクサマリー）|
| `/memo` | `Memo` | 今日のメモ |
| `/tasks` | `Tasks` | タスク管理 |
| `/calendar` | `WeeklyCalendar` | 週間カレンダー |
| `/reports/daily` | `DailyReport` | 日報生成・表示 |
| `/reports/weekly` | `WeeklyReport` | 週報生成・表示 |
| `/settings` | `Settings` | 設定 |

---

## カスタムイベント

| イベント名 | 発火元 | 購読先 | 説明 |
|-----------|--------|--------|------|
| `sebastian:shortcut-changed` | `Settings.tsx` | `App.tsx` | ショートカットキー変更通知（`detail`: 新しいキー文字列）|
| `sebastian:open-memo` | `Settings.tsx` | ※未使用（旧) | メモページを開くトリガー（現在は shortcut-changed で代替）|

---

## AI プロンプト設計（ai.ts）

### 共通方針
- システムプロンプトで「Sebastian」というキャラクター（業務支援 AI 執事）を設定。
- temperature: 0.3（報告系）/ 0.1（JSON 抽出系）
- Gemini: maxOutputTokens 8192、Ollama: num_predict 2048

### タイムアウト設定

| API | タイムアウト |
|-----|------------|
| Ollama（テキスト） | 120 秒 |
| Gemini（テキスト） | 60 秒 |
| Gemini/Ollama（JSON） | 60 秒 / 120 秒 |
| Ollama 接続確認 | 3 秒 |
| Gemini 接続確認 | 8 秒 |

### ファイル出力命名規則

| レポート種別 | ファイル名形式 | 例 |
|------------|--------------|-----|
| 日報 | `Nippo_YYYYMMDD.md` | `Nippo_20260406.md` |
| 週報 | `Shuho_YYYYMMDD.md` | `Shuho_20260403.md`（週始め月曜）|

---

## デモモード制御フロー

```
isDemoMode() === true
       ↓
selectDb() → selectDemo() を呼び出し
  ├── from tasks      → DEMO_TASKS（条件に応じてフィルタ）
  ├── from daily_memos → DEMO_MEMOS
  ├── from reports_daily → DEMO_DAILY_REPORTS
  ├── from reports_weekly → DEMO_WEEKLY_REPORTS
  ├── from task_logs  → [] （空）
  └── from settings   → []（ただし last_briefing_date / ai_provider は固定値返却）

executeDb() → settings テーブルへの書き込みのみ通す（その他は no-op）
```

---

## Tauri コマンド呼び出し例

```typescript
// ファイル書き込み
await invoke<void>('write_text_file', { path: '/path/to/file.md', content: '...' });

// DB パス取得
const dbPath = await invoke<string>('get_db_path');

// ファイルコピー（同期機能）
await invoke<void>('copy_file', { src: srcPath, dest: destPath });

// ファイル存在確認
const exists = await invoke<boolean>('file_exists', { path: srcPath });

// 最終更新日時取得（Unix 秒）
const mtime = await invoke<number | null>('get_file_mtime', { path });
```

---

## テーマ CSS カスタムプロパティ（index.css）

サイドバーのスタイルはテーマ別に以下の変数で制御される。

| 変数 | light | dark | sepia |
|------|-------|------|-------|
| `--sidebar-bg` | ネイビー系 | より暗いネイビー | ブラウン系 |
| `--sidebar-divider` | 半透明ゴールド | 同系 | 同系 |
| `--sidebar-gold` | #c9a456 | 同 | 同 |
| `--sidebar-ivory` | #d4c9a8 | 同 | 同 |
| `--sidebar-text-dim` | 薄いアイボリー | 同 | 同 |

---

## 既知の注意点・制約

1. **DB シングルトン**: `getDb()` はプロセス内でシングルトン。同期時は `closeDb()` で明示的に閉じる必要がある。
2. **デモモードとリリース**: `DemoBanner.tsx` のデモモード切り替えは v1.1.1 でリリースビルド向けに無効化済み。
3. **Gemini 400 エラー**: 接続確認で HTTP 400 が返る場合は「疎通 OK」扱い（Gemini の仕様でテストリクエストに 400 が返るため）。
4. **グローバルショートカットの制限**: OS レベルで他アプリが同じキーを使用している場合、登録に失敗する。エラーは Settings.tsx に表示。
5. **`task_logs` の参照**: `task_id` は `tasks.id` の外部キー（`ON DELETE CASCADE`）。タスク削除時にログも自動削除される。
