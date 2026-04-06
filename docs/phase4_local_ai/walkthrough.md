# Phase 4: 変更内容ウォークスルー（実装後に更新）

> このファイルは実装完了後にプルリクエスト説明として更新する。

## 変更概要（予定）

- `scripts/build_llama_server.sh`: 新規（Unixビルドスクリプト）
- `scripts/build_llama_server.ps1`: 新規（Windowsビルドスクリプト）
- `src-tauri/Cargo.toml`: reqwest（stream feature）追加
- `src-tauri/src/lib.rs`: start_llama_server / stop_llama_server / llama_server_status / download_model / list_models / delete_model コマンド追加
- `src/lib/ai.ts`: BonsaiProvider追加
- `src/lib/settings.ts`: ローカルAI設定キー追加
- `src/components/LocalAIModelManager.tsx`: 新規
- `src/pages/Settings.tsx`: ローカルAIセクション追加
- `src-tauri/tauri.conf.json`: CSP（huggingface.co追加）

## 破壊的変更

なし（ローカルAIはデフォルトオフ。既存機能に影響なし）
