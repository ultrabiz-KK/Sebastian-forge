import { format, addDays, subDays, startOfWeek } from 'date-fns';

const today      = format(new Date(), 'yyyy-MM-dd');
const yesterday  = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const twoDaysAgo = format(subDays(new Date(), 2), 'yyyy-MM-dd');
const tomorrow   = format(addDays(new Date(), 1), 'yyyy-MM-dd');
const in3days    = format(addDays(new Date(), 3), 'yyyy-MM-dd');
const in7days    = format(addDays(new Date(), 7), 'yyyy-MM-dd');
const in14days   = format(addDays(new Date(), 14), 'yyyy-MM-dd');
const thisWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
const lastWeekStart = format(startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
const lastWeekEnd   = format(addDays(subDays(new Date(), 7), 6), 'yyyy-MM-dd');

export const DEMO_TASKS = [
  { id: 1, title: '月次レポート作成',           status: 'in_progress', priority: 'high',   due_date: today,      category: '管理業務',  description: '4月分の月次レポートをまとめる。前月比の分析・コメントを含める。提出先: 管理部',                   pinned: 0, archived: 0, created_at: `${twoDaysAgo} 09:00:00`, updated_at: `${today} 10:30:00` },
  { id: 2, title: 'サーバー移行計画の策定',      status: 'todo',        priority: 'high',   due_date: in3days,    category: 'インフラ',  description: '老朽化した社内サーバーの移行先選定と移行スケジュールを策定する。ベンダーA社と要調整。',            pinned: 1, archived: 0, created_at: `${twoDaysAgo} 10:00:00`, updated_at: `${twoDaysAgo} 10:00:00` },
  { id: 3, title: 'セキュリティパッチ適用確認',  status: 'todo',        priority: 'high',   due_date: tomorrow,   category: 'インフラ',  description: '先週リリースされたパッチの適用状況を全12台確認。残り3台未適用。',                                   pinned: 1, archived: 0, created_at: `${yesterday} 08:30:00`,  updated_at: `${yesterday} 17:00:00` },
  { id: 4, title: '新人研修資料の更新',          status: 'todo',        priority: 'medium', due_date: in7days,    category: '人事・教育', description: '2026年度版に内容を更新する。PC貸出フロー・社内システム説明を最新化。',                              pinned: 0, archived: 0, created_at: `${yesterday} 14:00:00`,  updated_at: `${yesterday} 14:00:00` },
  { id: 5, title: 'IT資産台帳の整備',            status: 'todo',        priority: 'medium', due_date: in14days,   category: 'インフラ',  description: '棚卸し結果を台帳に反映する。廃棄予定機器のリスト化も行う。',                                        pinned: 0, archived: 0, created_at: `${twoDaysAgo} 11:00:00`, updated_at: `${twoDaysAgo} 11:00:00` },
  { id: 6, title: 'Webサイト軽微修正',           status: 'in_progress', priority: 'low',    due_date: null,       category: 'Web',       description: 'お知らせページの古い記事を削除し、採用情報を更新する。',                                            pinned: 0, archived: 0, created_at: `${twoDaysAgo} 13:00:00`, updated_at: `${today} 09:00:00` },
  { id: 7, title: 'ベンダー打ち合わせ議事録作成', status: 'done',       priority: 'medium', due_date: yesterday,  category: '管理業務',  description: null,                                                                                               pinned: 0, archived: 0, created_at: `${yesterday} 09:00:00`,  updated_at: `${yesterday} 16:00:00` },
  { id: 8, title: '備品発注（プリンター用紙）',   status: 'done',       priority: 'low',    due_date: twoDaysAgo, category: '庶務',      description: null,                                                                                               pinned: 0, archived: 0, created_at: `${twoDaysAgo} 15:00:00`, updated_at: `${twoDaysAgo} 15:30:00` },
];

export const DEMO_CATEGORY_SUMMARY = [
  { category: 'インフラ',   total: 3, done_count: 0 },
  { category: '管理業務',  total: 2, done_count: 1 },
  { category: '人事・教育', total: 1, done_count: 0 },
  { category: 'Web',        total: 1, done_count: 0 },
  { category: '庶務',       total: 1, done_count: 1 },
];

export const DEMO_MEMOS = [
  {
    date: today,
    content: `午前: ベンダーA社とオンライン定例会議（10:00〜11:30）
- サーバー移行スケジュール確認。4月第3週に実施予定で合意
- 移行後の動作確認手順書はベンダー側で対応予定

午後: 月次レポートの下書き作成（約2h）
- 前月比データの集計完了。コメント記載は明日に持ち越し

夕方: セキュリティパッチ適用状況確認
- 全12台中9台完了。残り3台は明日AM中に対応予定`,
  },
  {
    date: yesterday,
    content: `終日: セキュリティパッチ適用作業（全12台中8台完了）
議事録作成・共有（ベンダー打ち合わせ分）
新人研修資料の現状確認 → 内容が古いため来週中に更新が必要と判断`,
  },
  {
    date: twoDaysAgo,
    content: `午前: IT資産棚卸し（PC・周辺機器）
午後: Webサイト更新作業（採用情報ページ）
夕方: 備品発注処理（プリンター用紙 5箱）`,
  },
];

export const DEMO_DAILY_REPORTS = [
  {
    date: today,
    content: `# 日報 — ${today}

## 本日の業務

**【インフラ】**
- ベンダーA社とオンライン定例会議（10:00〜11:30）
  - サーバー移行スケジュールを確認。4月第3週実施予定で合意
  - 移行後の動作確認手順書はベンダー側で作成予定

**【管理業務】**
- 月次レポート下書き作成
  - 前月比データの集計完了。コメント欄の記載は翌日以降に持ち越し

**【インフラ】**
- セキュリティパッチ適用状況確認
  - 全12台中9台完了。残り3台は明朝対応予定

## 完了タスク
- ベンダー打ち合わせ議事録の作成・共有 ✓

## 明日の予定
- セキュリティパッチ残3台の適用（午前）
- 月次レポート完成・提出（午後）
- 新人研修資料の更新着手`,
  },
  {
    date: yesterday,
    content: `# 日報 — ${yesterday}

## 本日の業務

**【インフラ】**
- セキュリティパッチ適用作業（終日）
  - 全12台中8台完了。残り4台は翌日以降に対応

**【管理業務】**
- ベンダー打ち合わせ議事録の作成・関係者へ共有

**【人事・教育】**
- 新人研修資料の現状確認
  - 内容が2024年度のままで古いため、来週中に更新が必要と判断

## 完了タスク
- ベンダー打ち合わせ議事録 ✓

## 明日の予定
- ベンダーA社定例会議（10:00〜）
- セキュリティパッチ適用継続
- 月次レポート着手`,
  },
  {
    date: twoDaysAgo,
    content: `# 日報 — ${twoDaysAgo}

## 本日の業務

**【インフラ】**
- IT資産棚卸し実施（PC・周辺機器）
  - 把握できていない機器が3台発見。台帳整備が急務

**【Web】**
- Webサイト採用情報ページの更新作業
  - 古い公募情報を削除し、2026年度版に更新完了

**【庶務】**
- プリンター用紙の備品発注処理（5箱）

## 完了タスク
- 備品発注（プリンター用紙） ✓

## 明日の予定
- セキュリティパッチ適用作業
- ベンダー議事録の作成`,
  },
];

export const DEMO_WEEKLY_REPORTS = [
  {
    week_start_date: lastWeekStart,
    content: `# 週報 — ${lastWeekStart} 〜 ${lastWeekEnd}

## 週のサマリー

インフラ関連の対応が中心となった一週間。サーバー移行の事前準備と
セキュリティ対応を並行して進めた。業務全体は概ね計画通りに推移。

## 主要な業務実績

**【インフラ・セキュリティ】**
- セキュリティパッチの適用計画策定および展開開始（全12台中8台完了）
- サーバー移行に向けた現行構成の棚卸し完了
- IT資産台帳の確認・差分リスト作成

**【管理業務】**
- 3月分の経費精算・承認処理
- ベンダーA社との定例会議準備・資料作成

**【その他】**
- Webサイト軽微修正（採用情報ページ更新）
- 備品発注処理（プリンター用紙）

## 来週の予定
- セキュリティパッチ残台数の適用完了（火曜AM目処）
- ベンダーA社定例会議（月曜10:00）
- 月次レポート作成・提出（水曜）
- 新人研修資料の更新着手

## 課題・懸念事項
- IT資産台帳の最終確認が滞っているため、来週中に対応要
- サーバー移行スケジュールについてベンダーとの最終合意が必要`,
  },
];

export { today, thisWeekStart, lastWeekStart };
