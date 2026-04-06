# Phase 1: 共有コンテキスト

## ステータス
- **フェーズ**: 実装完了
- **最終更新**: 2026-04-06

## 重要な決定事項

- AIプロバイダーSDKは使わず生fetchで実装する（バンドルサイズ管理のため）
- `callAI()` / `callAIForJson()` の呼び出しインターフェースは変更しない（各ページへの影響ゼロ）
- モデル一覧はTTL 1時間でキャッシュ（`models_cache` キーにJSON保存）
- カスタムプロバイダーはDBのsettingsテーブルにJSON配列で保存（別テーブル不要）

## 実装済み内容

- `src/lib/ai.ts`: 全面改修完了
  - `AIProvider` インターフェース定義
  - `GeminiProvider`, `OllamaProvider`, `ClaudeProvider`, `OpenAIProvider`, `OpenAICompatibleProvider` クラス実装
  - `getProvider(id)`, `getProviderForFeature(feature?)` ファクトリ関数
  - `buildCustomProvider(def)` カスタムプロバイダービルダー
  - モデルキャッシュ（TTL 1時間、`models_cache` キー）
- `src/lib/settings.ts`: 新規SETTING_KEYS追加（Claude/OpenAI/Groq/OpenRouter/nano-gpt/LM Studio/カスタム/機能別/キャッシュ）
- `src/components/ModelSelector.tsx`: 新規作成（検索＋ドロップダウン、キャッシュ利用）
- `src/pages/Settings.tsx`: AI設定セクション全面刷新（全プロバイダー対応、機能別設定、カスタムプロバイダーCRUD）
- `src-tauri/tauri.conf.json`: CSP に全プロバイダーエンドポイントを追加

## エージェント間連絡事項

Phase 1 実装完了。Phase 2（マスターパスワード）でカスタムプロバイダーのAPIキー暗号化を対応予定。
