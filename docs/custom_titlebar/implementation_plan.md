# 実装プラン: カスタムタイトルバー

## 概要
Windows標準のタイトルバーを廃止し、アプリのコンセプト（執事・高級感）に合わせたゴールドベースのカスタムタイトルバーを実装する。Tauri v2環境におけるウィンドウ操作権限の適切な設定と、ReactによるUI制御を組み合わせる。

## 技術的アプローチ
1.  **ネイティブ枠の消去**: Tauri設定でデコレーションを無効化。
2.  **ドラッグ領域の設定**: `data-tauri-drag-region` 属性を使用して、独自UI上でのウィンドウ移動を可能にする。
3.  **パーミッション管理**: Tauri v2のセキュリティモデルに従い、最小化・最大化・閉じる・リサイズ監視に必要な権限を `capabilities/default.json` に明示。
4.  **テーマ同期**: CSS変数を活用し、ライト/ダーク/セピアの既存テーマ切り替えと完全に連動させる。

## 変更ファイル
- `src-tauri/tauri.conf.json`: ウィンドウ設定
- `src-tauri/capabilities/default.json`: 権限設定
- `src/components/layout/TitleBar.tsx`: 新規コンポーネント
- `src/components/layout/MainLayout.tsx`: レイアウト統合
- `src/index.css`: スタイル定義
