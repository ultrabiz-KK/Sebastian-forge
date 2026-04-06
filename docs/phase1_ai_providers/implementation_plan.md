# Phase 1: AI APIプロバイダー拡充 — 実装計画

## 実装ステップ（推奨順序）

```
T1-1 プロバイダー抽象化
  └─→ T1-2 Claude API
  └─→ T1-3 OpenAI API
  └─→ T1-4 OpenAI互換群（並行可）
  └─→ T1-5 カスタムプロバイダー
       └─→ T1-6 モデル一覧取得
            └─→ T1-7 モデル選択UI
                 └─→ T1-8 機能別設定
                      └─→ T1-9 Settings.tsx刷新
                           └─→ T1-10 CSP更新
```

## アーキテクチャ方針

### プロバイダー抽象化設計

```typescript
// ai.ts の新しい構造

interface AIProvider {
  id: string;
  name: string;
  callText(system: string, user: string): Promise<string>;
  callJson<T>(system: string, user: string): Promise<T>;
  listModels(): Promise<ModelInfo[]>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
}

// ファクトリ
function getProvider(key: string): AIProvider { ... }
function getProviderForFeature(feature: FeatureKey): AIProvider { ... }
```

### 設定キー追加計画

```typescript
// settings.ts に追加するキー
SETTING_KEYS = {
  // 既存
  ai_provider: 'ai_provider',
  gemini_api_key: 'gemini_api_key',
  // ...

  // 新規
  claude_api_key: 'claude_api_key',
  claude_model: 'claude_model',
  openai_api_key: 'openai_api_key',
  openai_model: 'openai_model',
  groq_api_key: 'groq_api_key',
  groq_model: 'groq_model',
  openrouter_api_key: 'openrouter_api_key',
  openrouter_model: 'openrouter_model',
  nanogpt_api_key: 'nanogpt_api_key',
  nanogpt_model: 'nanogpt_model',
  lmstudio_endpoint: 'lmstudio_endpoint',
  lmstudio_model: 'lmstudio_model',
  custom_providers: 'custom_providers',  // JSON配列

  // 機能別プロバイダー
  feature_provider_daily_report: 'feature_provider_daily_report',
  feature_provider_weekly_report: 'feature_provider_weekly_report',
  feature_provider_briefing: 'feature_provider_briefing',
  feature_provider_calendar_comment: 'feature_provider_calendar_comment',
  feature_provider_task_extract: 'feature_provider_task_extract',

  // モデルキャッシュ（TTL付き）
  models_cache: 'models_cache',  // JSON: { [providerId]: { models: [], fetchedAt: ISO } }
}
```

## リスクと対策

| リスク | 対策 |
|--------|------|
| 各プロバイダーのAPIレスポンス形式の差異 | プロバイダークラスで正規化 |
| CSP違反 | tauri.conf.json でエンドポイントを明示追加 |
| モデル一覧取得の失敗 | フォールバック: 手動テキスト入力 |
| カスタムエンドポイントのSSL証明書エラー | LM Studioはhttpを許可（既存Ollamaと同様） |

## 影響範囲

- `src/lib/ai.ts`: 全面改修（後方互換インターフェース維持）
- `src/lib/settings.ts`: キー追加のみ
- `src/pages/Settings.tsx`: AI設定セクション刷新
- `src-tauri/tauri.conf.json`: CSP追加
- 各ページ（DailyReport等）: **変更なし**（callAI()インターフェース維持）
