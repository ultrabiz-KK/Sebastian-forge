# Sebastian — 実装引き継ぎドキュメント

> Claude Code による追加実装の全記録。Antigravity等で続きを開発する際の起点として使用してください。
> 最終更新: 2026-03-31

---

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| アプリ名 | Sebastian（セバスチャン） |
| コンセプト | ローカル常駐型AIワークサポート。メモ→日報→タスク→週報を執事のように整える |
| リポジトリ | https://github.com/roman-ease/Sebastian（Private） |
| 対象OS | Windows（Tauriデスクトップアプリ） |

---

## 技術スタック

| 領域 | 技術 |
|------|------|
| フレームワーク | Tauri v2 + React 19 |
| 言語 | TypeScript / Rust |
| UI | Tailwind CSS v4（@theme によるカスタムカラー） |
| DB | SQLite（tauri-plugin-sql） |
| AI | Gemini API / Ollama（lib/ai.ts で抽象化済み） |
| ビルド | Vite |

---

## ディレクトリ構成

```
src/
├── App.tsx                    # ルーティング・グローバルショートカット・終業リマインド
├── index.css                  # Tailwind + テーマ定義（ライト/ダーク/セピア）
├── components/
│   ├── layout/
│   │   ├── MainLayout.tsx     # サイドバー + アウトレットのレイアウト
│   │   └── Sidebar.tsx        # ナビゲーション + テーマ切り替えボタン
│   ├── MorningBriefingModal.tsx  # 朝のブリーフィングモーダル
│   └── TaskCandidatesPanel.tsx   # AI候補タスクの差分プレビューパネル
├── lib/
│   ├── ai.ts                  # AI呼び出し抽象化（Gemini/Ollama/disabled）
│   ├── db.ts                  # SQLiteラッパー（getDb/executeDb/selectDb/closeDb）
│   ├── settings.ts            # 設定キー定数 + getSetting/setSetting
│   ├── shortcut.ts            # グローバルショートカット登録管理（一元化）
│   ├── sync.ts                # データ同期（pushSync/pullSync）
│   ├── taskLogs.ts            # タスク監査ログ記録
│   └── theme.ts               # テーマ適用・保存・読み込み
└── pages/
    ├── Dashboard.tsx          # ホーム（サマリー・ピン留め・カテゴリ別進捗）
    ├── DailyReport.tsx        # 日報生成・編集・承認・タスク候補反映
    ├── Memo.tsx               # デイリーメモ（自動保存・未整理バナー）
    ├── Settings.tsx           # 設定画面（AI・リマインダー・同期）
    ├── Tasks.tsx              # タスク一覧・CRUD・アーカイブ・ピン留め
    ├── WeeklyCalendar.tsx     # 週カレンダー
    └── WeeklyReport.tsx       # 週報生成・編集・承認

src-tauri/
├── src/lib.rs                 # Rustエントリ、DBマイグレーション、カスタムコマンド、トレイ
├── tauri.conf.json            # アプリ設定（CSP設定済み）
└── capabilities/default.json # パーミッション定義
```

---

## DBスキーマ（SQLite）

### `tasks`
```sql
id INTEGER PK, title TEXT, description TEXT,
status TEXT DEFAULT 'todo',   -- todo / in_progress / done / hold
priority TEXT DEFAULT 'none', -- high / medium / low / none
due_date TEXT, category TEXT,
archived INTEGER DEFAULT 0,   -- 0: 通常, 1: アーカイブ済み
pinned INTEGER DEFAULT 0,     -- 0: 通常, 1: ピン留め（今日の注力）
created_at DATETIME, updated_at DATETIME
```

### `task_logs`
```sql
id INTEGER PK, task_id INTEGER,
action_type TEXT,  -- create/update/status_change/delete/archive/restore/pin/unpin
before_json TEXT, after_json TEXT,
actor_type TEXT,   -- manual / ai
source_type TEXT, source_id TEXT, suggestion_group_id TEXT,
applied_by TEXT, note TEXT, created_at DATETIME
```

### `daily_memos`
```sql
id INTEGER PK, date TEXT UNIQUE, content TEXT,
created_at DATETIME, updated_at DATETIME
```

### `reports_daily`
```sql
id INTEGER PK, date TEXT UNIQUE, content TEXT,
created_at DATETIME, updated_at DATETIME
```

### `reports_weekly`
```sql
id INTEGER PK, week_start_date TEXT UNIQUE, content TEXT,
created_at DATETIME, updated_at DATETIME
```

### `settings`
```sql
key TEXT PK, value TEXT
```

---

## 設定キー一覧（SETTING_KEYS）

| キー | 用途 | デフォルト |
|------|------|-----------|
| `daily_report_path` | 日報MDファイル保存先 | - |
| `weekly_report_path` | 週報MDファイル保存先 | - |
| `global_shortcut` | クイックメモショートカット | `Ctrl+Shift+M` |
| `autostart_enabled` | PC起動時自動起動 | `false` |
| `ai_provider` | AIプロバイダー | `disabled` |
| `gemini_api_key` | Gemini APIキー（平文保存） | - |
| `gemini_model` | Geminiモデル名 | `gemini-2.5-flash` |
| `ollama_endpoint` | OllamaエンドポイントURL | `http://localhost:11434` |
| `ollama_model` | Ollamaモデル名 | `qwen2.5:7b` |
| `reminder_enabled` | 終業リマインド有効 | `false` |
| `reminder_time` | リマインド時刻 | `18:00` |
| `reminder_weekdays_only` | 平日のみ通知 | `true` |
| `last_briefing_date` | 朝ブリーフィング最終表示日 | - |
| `theme` | UIテーマ | `light` |
| `sync_folder` | データ同期フォルダパス | - |
| `last_sync_at` | 最終同期日時（ISO文字列） | - |

---

## カスタムRustコマンド（invoke）

| コマンド | 引数 | 戻り値 | 用途 |
|----------|------|--------|------|
| `write_text_file` | path, content | void | 日報・週報のMD保存 |
| `read_text_file` | path | String | テキストファイル読み込み |
| `get_db_path` | - | String | sebastian.dbのフルパス取得 |
| `copy_file` | src, dest | void | DBファイルのコピー（同期用） |
| `file_exists` | path | bool | ファイル存在確認 |
| `get_file_mtime` | path | u64? | ファイル更新日時（Unix秒） |

---

## 実装済み機能

### MVP
- [x] デイリーメモ（自動保存・復元）
- [x] 日報生成（AI）・編集・承認・MD保存
- [x] タスク管理（CRUD・監査ログ・AI候補抽出・差分プレビュー）
- [x] 週カレンダー
- [x] 週報生成（AI）・編集・承認・MD保存

### MVP外
- [x] 終業リマインド（Web Notification API）
- [x] 朝のブリーフィング（初回起動時モーダル）
- [x] 未整理メモの可視化（メモ画面・ダッシュボードバッジ）
- [x] タスク候補抽出パネル（差分プレビュー付き）
- [x] カテゴリ別稼働サマリ（ダッシュボード）
- [x] ピン留め・今日の注力（ダッシュボード）
- [x] UIテーマ切り替え（ライト・ダーク・セピア）
- [x] タスクアーカイブ（アーカイブ・復元）
- [x] データ同期（Push/Pull、同期フォルダ方式）
- [x] グローバルショートカット設定
- [x] PC起動時自動起動

---

## 未実装機能（BasePrompt.md より）

優先度が高いものから順：

1. **週次レビュー補助** — 完了数・持ち越し・カテゴリ偏りのサマリ表示
2. **来週の最重要3件提案** — 週報生成後に次週注力候補を提示
3. **日報テンプレート切り替え** — 自由形式・箇条書き・社内提出向け
4. **週報テンプレート切り替え** — 実績重視・課題重視・次週計画重視
5. **履歴検索の強化** — 日付・カテゴリ・キーワード横断検索
6. **バックアップ/エクスポート** — ZIPエクスポート（同期機能で代替可）
7. **通知センター** — AI提案・期限・リマインドを一覧確認
8. **会議・チャット転記支援** — 貼り付けからタスク・日時を抽出
9. **操作監査ビュー** — AI提案→承認→反映の時系列UI
10. **サイドパネル型ミニビュー** — 小窓で今日のメモ・注力タスクを常時表示

---

## 設計上の注意点

### AIレスポンス処理
`lib/ai.ts` の `callAIForJson()` はMarkdownコードフェンスを自動除去する `cleanJsonResponse()` を内包。`maxOutputTokens: 8192` に設定済み。

### テーマ切り替え
`html.theme-dark` / `html.theme-sepia` クラスをhtmlタグに付与する方式。CSS変数を上書き。ダークテーマはサイドバー背景を専用CSSルールでオーバーライド（`html.theme-dark aside`）。

### データ同期の設計
SQLiteファイルをそのままコピーする方式（JSON変換なし）。Push前後は `closeDb()` でDB接続を閉じ、次アクセス時に自動再接続。Pull後は `window.location.reload()` で画面を再初期化。

### ショートカット登録
`lib/shortcut.ts` が `currentShortcut` 変数で現在の登録を管理。`App.tsx` が起動時登録と `sebastian:shortcut-changed` イベント購読を担当。`Settings.tsx` は保存後にイベントを発火するだけ（二重登録バグ修正済み）。

### APIキー
`settings` テーブルに平文保存。README に注意書き記載済み。将来的にOS credential storeへの移行を検討。

---

## DBマイグレーション履歴

| version | 内容 |
|---------|------|
| 1 | 初期テーブル全作成 |
| 2 | `tasks.archived` 追加 |
| 3 | `tasks.pinned` 追加 |

次にスキーマ変更が必要な場合は `src-tauri/src/lib.rs` の `migrations` vecに version 4 を追加。
