# Phase 1: 変更内容ウォークスルー（実装後に更新）

> このファイルは実装完了後にプルリクエスト説明として更新する。
> 現時点では変更予定の概要のみ記載。

## 変更概要

- `src/lib/ai.ts`: プロバイダー抽象化 + Claude/OpenAI/Groq/OpenRouter/nano-gpt/LM Studio/カスタム対応
- `src/lib/settings.ts`: 新プロバイダー設定キー追加
- `src/components/ModelSelector.tsx`: 新規（モデル選択コンポーネント）
- `src/pages/Settings.tsx`: AI設定セクション刷新
- `src-tauri/tauri.conf.json`: CSP追加

## 破壊的変更

なし（既存の `callAI()` インターフェースを維持）
