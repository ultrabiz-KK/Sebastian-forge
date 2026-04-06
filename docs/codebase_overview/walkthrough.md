# ファイル別役割解説 — Sebastian v1.1.1

## ディレクトリツリー（主要ファイルのみ）

```
Sebastian-forge/
├── package.json              # npm 設定・依存関係
├── index.html                # HTML エントリポイント
├── vite.config.ts            # Vite ビルド設定
├── tsconfig.json             # TypeScript 設定（フロントエンド）
├── tsconfig.node.json        # TypeScript 設定（Node/Vite 用）
├── CHANGELOG.md              # 変更履歴
├── README.md                 # プロジェクト説明
├── public/                   # 静的アセット
│   ├── sebastian-butler.png  # サイドバーの執事イラスト（メイン）
│   ├── butler.png            # 執事イラスト（予備）
│   ├── butler-silhouette.svg # シルエット
│   └── quill-pen.png         # 羽ペンアイコン
├── src/                      # フロントエンドソース
│   ├── main.tsx              # React エントリポイント
│   ├── App.tsx               # ルーティング・グローバル設定
│   ├── index.css             # グローバル CSS・テーマ変数
│   ├── App.css               # App 固有 CSS
│   ├── vite-env.d.ts         # Vite 型定義
│   ├── assets/               # バンドル用アセット（react.svg）
│   ├── lib/                  # ライブラリ層
│   │   ├── db.ts             # DB アクセス抽象化
│   │   ├── ai.ts             # AI 呼び出し層
│   │   ├── settings.ts       # 設定 KV ストア
│   │   ├── constants.ts      # 優先度・ステータス定数
│   │   ├── demoData.ts       # デモ用サンプルデータ
│   │   ├── demoMode.ts       # デモモード管理
│   │   ├── shortcut.ts       # グローバルショートカット登録
│   │   ├── sync.ts           # PC 間 DB 同期
│   │   ├── taskLogs.ts       # タスクログ記録
│   │   └── theme.ts          # テーマ（light/dark/sepia）
│   ├── pages/                # ページコンポーネント
│   │   ├── Dashboard.tsx     # ホーム画面
│   │   ├── Memo.tsx          # 今日のメモ
│   │   ├── Tasks.tsx         # タスク管理
│   │   ├── WeeklyCalendar.tsx # 週間カレンダー
│   │   ├── DailyReport.tsx   # 日報生成
│   │   ├── WeeklyReport.tsx  # 週報生成
│   │   └── Settings.tsx      # 設定画面
│   └── components/           # 再利用コンポーネント
│       ├── ClassicUI.tsx     # 共通 UI 部品
│       ├── MorningBriefingModal.tsx # 朝のブリーフィングモーダル
│       ├── TaskModal.tsx     # タスク作成・編集モーダル
│       ├── TaskPeekModal.tsx # タスク詳細クイックビュー
│       ├── TaskCandidatesPanel.tsx  # AI タスク候補パネル
│       ├── GeneratingAnimation.tsx  # AI 生成中アニメーション
│       ├── DemoBanner.tsx    # デモモードバナー
│       └── layout/
│           ├── MainLayout.tsx # メインレイアウト
│           └── Sidebar.tsx   # サイドバー
└── src-tauri/                # Rust バックエンド
    ├── src/
    │   ├── main.rs           # Tauri エントリポイント
    │   └── lib.rs            # コマンド実装・マイグレーション・トレイ
    ├── tauri.conf.json       # Tauri アプリ設定
    ├── Cargo.toml            # Rust 依存関係
    ├── capabilities/         # Tauri 権限設定
    │   ├── default.json      # 全プラットフォーム共通権限
    │   └── desktop.json      # デスクトップ固有権限
    └── icons/                # アプリアイコン（各解像度）
```

---

## src/ ファイル詳解

### `src/main.tsx`
React のエントリポイント。
- `BrowserRouter` でルーティングを初期化。
- Cinzel / EB Garamond フォントを `@fontsource` から読み込む。

### `src/App.tsx`
アプリの中核ロジックを担うルートコンポーネント。
- `AppRoutes` コンポーネントで全ページのルーティングを定義。
- **グローバルショートカット登録**: 起動時に `registerShortcut()` を呼び出し、設定変更イベント（`sebastian:shortcut-changed`）で再登録。
- **終業リマインダー**: 1 分ごとのポーリングで設定時刻に `Notification` API を使ってブラウザ通知を発火。日報が未作成の場合のみ通知。
- **テーマ初期適用**: マウント時に `loadAndApplyTheme()` を呼ぶ。

---

## src/lib/ ファイル詳解

### `db.ts` — DB アクセス抽象化
```typescript
getDb()      // SQLite シングルトン取得
executeDb()  // INSERT/UPDATE/DELETE（デモモード時は settings 以外を無視）
selectDb<T>() // SELECT（デモモード時は selectDemo にリダイレクト）
closeDb()    // 同期時に明示的にクローズするために使用
```
- `Database.load('sqlite:sebastian.db')` でアプリデータディレクトリに DB を作成/接続。

### `ai.ts` — AI 呼び出し層
最も複雑なモジュール。複数の役割を担う。

**プロバイダー抽象化**
- `callAI(system, user)` → settings の `ai_provider` を読んで Gemini/Ollama を振り分け。
- `callAIForJson(system, user)` → JSON 返却専用。Gemini は `responseMimeType: 'application/json'`、Ollama は `format: 'json'` を指定。
- `cleanJsonResponse()` → コードフェンス（` ```json ``` `）や余分なテキストを除去するサニタイザ。

**接続確認**
- `checkOllamaConnection(endpoint?)` → `/api/tags` に 3 秒タイムアウトで GET。
- `checkGeminiConnection(apiKey?, model?)` → `generateContent` に 8 秒タイムアウトで POST（HTTP 400 は疎通 OK 扱い）。

**AI 生成関数**

| 関数 | 入力 | 出力 |
|------|------|------|
| `generateDailyReport()` | date, memoContent, taskLogs, activeTasks | Markdown 日報文字列 |
| `generateWeeklyReport()` | weekStart, weekEnd, dailyReports, activeTasks | Markdown 週報文字列 |
| `generateButlerBriefing()` | tasks[], date | `ButlerBriefing`（時間帯別 5 コメント×4 スロット） |
| `generateWeeklyCalendarComment()` | 週の統計情報 | 60〜100 文字のコメント文字列 |
| `extractTaskCandidates()` | memoContent, existingTasks[], date | `TaskCandidate[]` |

**フォールバック**
- `FALLBACK_BUTLER_BRIEFING` — AI 無効時や生成失敗時の固定フレーズ定義。

### `settings.ts` — 設定 KV ストア
- `settings` テーブルを `key TEXT PRIMARY KEY, value TEXT` の形式で使う。
- `SETTING_KEYS` 定数で型安全なキー管理。
- `getSetting(key)` / `setSetting(key, value)` / `getAllSettings()` の 3 関数のみ。

**主要キー一覧**

| キー | 説明 |
|------|------|
| `daily_report_path` | 日報 Markdown の保存フォルダ |
| `weekly_report_path` | 週報 Markdown の保存フォルダ |
| `global_shortcut` | クイックメモのグローバルショートカット（例: `Ctrl+Shift+M`）|
| `autostart_enabled` | PC 起動時の自動起動 |
| `ai_provider` | `gemini` / `ollama` / `disabled` |
| `gemini_api_key` | Gemini API キー |
| `gemini_model` | 使用モデル（例: `gemini-2.5-flash`）|
| `ollama_endpoint` | Ollama エンドポイント URL（例: `http://localhost:11434`）|
| `ollama_model` | 使用モデル（例: `qwen2.5:7b`）|
| `reminder_enabled` | 終業リマインド有効フラグ |
| `reminder_time` | 通知時刻（例: `18:00`）|
| `reminder_weekdays_only` | 平日のみ通知 |
| `last_briefing_date` | 最後にブリーフィングを生成した日付 |
| `butler_briefing` | ブリーフィング JSON キャッシュ |
| `theme` | `light` / `dark` / `sepia` |
| `sync_folder` | 同期フォルダパス |
| `last_sync_at` | 最終同期日時（ISO 文字列）|

### `constants.ts` — UI 定数
- `PRIORITY_LABEL` — `{ high: '高', medium: '中', low: '低', none: 'なし' }`
- `PRIORITY_COLOR` — 優先度別の Tailwind クラス文字列（bg + text + border）
- `STATUS_LABEL` — `{ todo: '未着手', in_progress: '進行中', done: '完了', hold: '保留', archived: 'アーカイブ' }`

### `demoData.ts` — デモ用サンプルデータ
情シス部門のユースケースを模したサンプルデータを定義。
- `DEMO_TASKS` — 8 件のタスク（インフラ・管理業務・人事・Web・庶務）
- `DEMO_CATEGORY_SUMMARY` — カテゴリ集計データ
- `DEMO_MEMOS` — 今日・昨日のメモ
- `DEMO_DAILY_REPORTS` — 昨日の日報
- `DEMO_WEEKLY_REPORTS` — 先週の週報
- 日付はすべて `format(new Date(), ...)` で動的に生成（起動日基準）。

### `demoMode.ts` — デモモード管理
- `_isDemoMode` フラグと `isDemoMode()` / `toggleDemoMode()` でオン・オフ。
- `selectDemo<T>(query, params)` — SQL クエリ文字列のパターンマッチで分岐し、対応するデモデータを返す。対応テーブル: `tasks`, `daily_memos`, `reports_daily`, `reports_weekly`, `task_logs`, `settings`。

### `shortcut.ts` — グローバルショートカット登録
- `currentShortcut` で現在登録中のキーを追跡。
- `registerShortcut(key, callback)` — 既存登録を解除してから新規登録。
- `event.state === 'Pressed'` のみ callback を実行（キーアップは無視）。

### `sync.ts` — PC 間 DB 同期
- `pushSync(syncFolder)` — DB をクローズして同期フォルダにコピー。
- `pullSync(syncFolder)` — タイムスタンプ付きでバックアップしてから上書き。戻り値はバックアップパス。
- `getSyncFolderDbMtime(syncFolder)` — 同期フォルダの DB の最終更新日時（Unix 秒）。
- Rust コマンド `invoke('copy_file', ...)` / `invoke('file_exists', ...)` を使用。

### `taskLogs.ts` — タスクログ記録
- `logTaskAction(params)` — `task_logs` テーブルに 1 レコード挿入。
- `ActionType`: `create` / `update` / `status_change` / `delete` / `archive` / `restore` / `pin` / `unpin`
- `ActorType`: `user` / `ai`
- `before_json` / `after_json` に操作前後のスナップショットを JSON 文字列で保存。

### `theme.ts` — テーマ管理
- `applyTheme(theme)` — `document.documentElement` のクラスを切り替え（`theme-dark`, `theme-sepia`）。
- `loadAndApplyTheme()` — DB から読み込んで適用。
- `saveTheme(theme)` — DB 保存 + 即時適用。

---

## src/pages/ ファイル詳解

### `Dashboard.tsx` — ホーム画面
起動後に表示されるサマリービュー。

**表示要素**
- 未完了タスク件数
- 本日のメモ文字数（未整理バッジ付き）
- 本日の日報ステータス（未作成 / 承認済）
- ピン留めタスク一覧（`tasks WHERE pinned = 1`）
- 今日が期日のタスク
- 優先度「高」のタスク（最大 5 件）
- カテゴリ別サマリー（完了率プログレスバー）
- 日報作成 CTA（日報未作成の場合のみ表示）

**初期化ロジック**
- `Promise.all()` で 7 つのクエリを並行実行。
- `last_briefing_date` を確認して `MorningBriefingModal` の表示判定。
- `TaskPeekModal` — タスク行クリックで詳細クイックビュー。

### `Memo.tsx` — 今日のメモ
- 全画面テキストエリア（`height: calc(100vh - 6rem)`）。
- 入力後 **1 秒デバウンス**で自動保存（`daily_memos` テーブル、`ON CONFLICT DO UPDATE`）。
- 保存ステータス表示: `idle` / `typing` / `saving` / `saved` / `error`。
- 日報未作成の場合、フッターに「未整理」警告 + 日報作成リンク。

### `Tasks.tsx` — タスク管理
最も多機能なページ。

**フィルタリング**（`useMemo` でクライアントサイド処理）
- ステータスタブ: すべて / 未着手 / 進行中 / 保留 / 完了
- カテゴリフィルター（タスクから動的生成）
- キーワード検索（title / category / description を対象）
- ソート: 作成日 / 更新日 / 期日 / 優先度（昇順/降順切替可）
- **ピン留めタスクは常に最上位に表示。**

**操作**
- ステータスアイコンクリック → 完了/未着手トグル
- タイトルクリック → 編集モーダル
- カテゴリラベルクリック → そのカテゴリでフィルター
- アーカイブ / 削除（ワンクリック確認）
- ピン留め（ダッシュボードの「本日の注力」に反映）
- アーカイブ済みセクション（折りたたみ式、復元・削除可）

**ログ記録**
- 全操作（作成・更新・ステータス変更・削除・アーカイブ・復元・ピン）を `logTaskAction()` で記録。

### `WeeklyCalendar.tsx` — 週間カレンダー
- 月曜始まりの 7 日間グリッドを表示。
- `addWeeks` / `subWeeks` で週を前後移動（今日ボタンで現在週に戻る）。
- 各日に期日が設定されているタスクを表示（`TaskPeekModal` でクイック確認）。
- **格言**: 定義済みの名言リストからランダム表示（執事スタイルで引用）。
- **週コメント**: `generateWeeklyCalendarComment()` で AI が週全体の状況をコメント（設定に AI が有効かつ、タスクが存在する場合）。週の統計（合計/完了/未完了/高優先度/最繁忙日）を AI に渡す。
- 週番号（ISO week）を表示。

### `DailyReport.tsx` — 日報生成
状態マシン型設計。

**PageState**: `idle` → `generating` → `draft` → `saving` → `saved`

- **idle**: 「日報案を生成する」ボタンのみ表示。
- **generating**: `GeneratingAnimation` コンポーネント表示。
- **draft**: `textarea` でドラフト編集 + 「承認・保存する」/「やり直す」。
- **saved**: 承認済みコンテンツ表示 + タスク候補抽出ボタン。

**承認時の動作**
1. `reports_daily` に保存（`ON CONFLICT DO UPDATE`）
2. `daily_report_path` が設定されていれば `Nippo_YYYYMMDD.md` を書き出し（Tauri コマンド経由）

**タスク候補抽出**（`CandidateState`: `idle` → `extracting` → `ready` → `done`）
- 日報承認後に表示されるオプション機能。
- `extractTaskCandidates()` → `TaskCandidatesPanel` で確認・登録。

### `WeeklyReport.tsx` — 週報生成
- `DailyReport.tsx` と同じ PageState 設計。
- 週選択（前後の矢印ボタン）で過去週の週報も生成・閲覧可能。
- 当該週の各日の日報存在状況を表示（日報がない日は注意表示）。
- 承認時に `reports_weekly` に保存 + `Shuho_YYYYMMDD.md` を書き出し。

### `Settings.tsx` — 設定画面
6 つのセクションで構成。

1. **AI 設定** — プロバイダー選択（Gemini / Ollama / 無効）、接続テスト
2. **レポート保存先** — 日報・週報の Markdown 書き出し先フォルダ（ダイアログで選択）
3. **操作・起動** — グローバルショートカット、自動起動（Windows スタートアップ）
4. **終業リマインド** — 通知時刻、平日のみフラグ
5. **レポート MD 一括書き出し** — DB 内の全日報・週報を Markdown に一括エクスポート
6. **データ同期** — 共有フォルダ経由の Push/Pull 同期

「設定を保存する」ボタン押下で全設定を一括保存。

---

## src/components/ ファイル詳解

### `ClassicUI.tsx` — 共通 UI 部品
全ページで使用するデザインシステムコンポーネント。

- `OrnateCard` — 白い角丸カード。四隅にゴールドの装飾線（`border-sebastian-gold/30`）。
- `CardHeading` — ◆ 装飾 + 細い罫線 + 右端アクション枠のセクション見出し。
- `PageHeader` — 小文字ラベル（`tracking-wider`）+ 罫線 + h1 の組み合わせヘッダー。

### `Sidebar.tsx` — サイドバー
固定幅（`w-56`）の左サイドバー。

**構成要素**
1. ロゴメダリオン（"S" のゴールドサークル）+ "Sebastian" テキスト
2. ナビゲーションリンク（`NavLink` でアクティブスタイル適用）
3. 執事イラスト（`sebastian-butler.png`、クリックで吹き出しコメント）
4. テーマ切り替えボタン（ライト / ダーク / セピア）
5. バージョン表示

**ブリーフィング表示ロジック**
- `getTimeSlot(hour)` で morning/noon/afternoon/night を判定。
- クリックのたびに同スロットからランダムに 1 コメント選択（5 秒後自動消去）。
- AI が無効または生成失敗時は `FALLBACK_BUTLER_BRIEFING` の固定フレーズを使用。

### `MorningBriefingModal.tsx` — 朝のブリーフィングモーダル
毎日初回起動時にダッシュボードで表示されるモーダル。
- 今日が期日のタスク
- 3 日以内に期日が来るタスク（最大 5 件）
- 高優先度タスク（最大 3 件）
- 閉じる時に `last_briefing_date` を今日で更新（再表示抑制）。

### `TaskModal.tsx` — タスク作成・編集モーダル
- タイトル（必須）/ 説明 / ステータス / 優先度 / 期日 / カテゴリ を入力。
- `mode: 'create' | 'edit'` で初期値と保存ハンドラを切り替え。

### `TaskPeekModal.tsx` — タスク詳細クイックビュー
- タスク ID を受け取って詳細を DB から取得して表示するだけの読み取り専用モーダル。
- ダッシュボード・週間カレンダーから利用。

### `TaskCandidatesPanel.tsx` — AI タスク候補パネル
- `TaskCandidate[]` を受け取り、各候補を個別に「追加する」/「スキップ」で選択できる UI。
- `type: 'new'` → `INSERT`、`type: 'update'` → `UPDATE`（`target_task_id` 指定）。
- 採用した候補を `logTaskAction({ actorType: 'ai', sourceType: 'daily_report' })` で記録。

### `GeneratingAnimation.tsx` — AI 生成中アニメーション
- 日報 / 週報の生成中に表示するアニメーション。
- `reportType: 'daily' | 'weekly'` でメッセージを切り替え。
- 執事キャラクターのペンアイコンと点滅テキスト。

### `DemoBanner.tsx` — デモモードバナー
- デモモード有効時に画面上部に表示するバナー。
- 現在のビルドではデモモード切り替えは無効化（リリースビルド向け）。

---

## src-tauri/ ファイル詳解

### `src-tauri/src/main.rs`
Tauri の標準エントリポイント。`lib::run()` を呼ぶだけ。

### `src-tauri/src/lib.rs`
バックエンドの実装ファイル。

**Tauri コマンド（`#[tauri::command]`）**
- `write_text_file(path, content)` — 親ディレクトリを自動作成してファイル書き込み。
- `read_text_file(path)` — ファイル読み込み（String を返す）。
- `get_db_path(app)` — `%APPDATA%/sebastian.db` のフルパスを返す。
- `copy_file(src, dest)` — ファイルコピー（dest の親ディレクトリを自動作成）。
- `file_exists(path)` — `Path::new(&path).exists()` で確認。
- `get_file_mtime(path)` — `metadata().modified()` を Unix 秒（u64）で返す。

**`setup_tray()`**（デスクトップのみ）
- `TrayIconBuilder` でシステムトレイアイコンとコンテキストメニューを構築。
- 左クリック / "Sebastianを開く" でメインウィンドウをフォーカス表示。

### `src-tauri/tauri.conf.json`
- `productName`: `"Sebastian"`
- `identifier`: `"com.sebastian.app"`
- ウィンドウサイズ: 1280×800（最小 900×600）
- CSP で Gemini API と Ollama の通信を許可。
- `bundle.targets: "all"` — .exe/.msi/.dmg/.deb を一括ビルド対象。

### `src-tauri/capabilities/`
Tauri v2 の権限設定。利用プラグインごとに権限を明示的に宣言。
- `default.json` — 全プラットフォーム共通
- `desktop.json` — デスクトップ（autostart, global-shortcut など）
