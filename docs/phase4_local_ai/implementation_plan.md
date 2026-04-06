# Phase 4: ローカルAI（Bonsai-8B）— 実装計画

## 実装ステップ（推奨順序）

```
T4-1 ビルドスクリプト作成
  └─→ T4-2 Rustサブプロセス管理コマンド
       └─→ T4-3 モデルダウンロードマネージャー（Rust）
            └─→ T4-4 モデル管理UI
                 └─→ T4-5 BonsaiAIプロバイダー実装
                      └─→ T4-6 Settings.tsxローカルAIセクション
                           └─→ T4-7 アプリ終了時クリーンアップ
```

## llama-serverバイナリの取得方法

### ユーザー向け手順（アプリ内に案内を表示）

```
1. CMake, Git, C++コンパイラを準備（Windowsの場合: Visual Studio Build Tools）
2. Sebastian アプリの Settings > ローカルAI から
   「ビルドスクリプトを実行」または手動でコマンドを実行
3. scripts/build_llama_server.ps1 を実行
4. バイナリが %APPDATA%/Sebastian/bin/ に配置される
```

### ビルドスクリプト内容（Windows版）

```powershell
# scripts/build_llama_server.ps1
$dest = "$env:APPDATA\Sebastian\bin"
$build_dir = "$env:TEMP\sebastian-llama-build"

git clone --depth 1 -b prism https://github.com/PrismML-Eng/llama.cpp $build_dir
cd $build_dir
cmake -B build -DLLAMA_BUILD_SERVER=ON -DGGML_NATIVE=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release --target llama-server

New-Item -ItemType Directory -Force $dest
Copy-Item "build/bin/Release/llama-server.exe" $dest
```

## プロセス管理アーキテクチャ

```rust
// lib.rs

struct LlamaServerState(Mutex<Option<Child>>);

// 起動: llama-server -m {model} --port {port} -c 4096 --host 127.0.0.1
// 停止: child.kill()
// ヘルスチェック: GET http://127.0.0.1:{port}/health
```

## モデルダウンロードURL

```
https://huggingface.co/prism-ml/Bonsai-8B-gguf/resolve/main/{filename}
```

推奨ファイル:
| ファイル名 | サイズ目安 | 用途 |
|-----------|---------|------|
| `bonsai-8b-q4_k_m.gguf` | ~5GB | 品質重視（推奨） |
| `bonsai-8b-q8_0.gguf` | ~9GB | 高品質 |
| `bonsai-8b-q1_0.gguf` | ~1.2GB | 省メモリ |

## BonsaiプロバイダーのAI統合

```typescript
// Phase 1の OpenAICompatibleProvider を継承
class BonsaiProvider extends OpenAICompatibleProvider {
  constructor(port: number) {
    super({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: 'local',  // llama-serverはキー不要
    });
  }

  async testConnection() {
    // 1. llama_server_status() を確認
    // 2. /health エンドポイントを確認
  }
}
```

## 設定キー追加

```typescript
SETTING_KEYS = {
  // Phase 4追加
  local_ai_enabled: 'local_ai_enabled',        // 'true' | 'false'
  local_ai_model_path: 'local_ai_model_path',  // 選択中のGGUFパス
  local_ai_models_dir: 'local_ai_models_dir',  // モデル保存ディレクトリ
  local_ai_port: 'local_ai_port',              // デフォルト: '8080'
}
```

## リスクと対策

| リスク | 対策 |
|--------|------|
| ビルド環境なしでユーザーが詰まる | Settings画面にビルド要件を明示 + コマンドをコピーしやすいUI |
| llama-serverの起動時間（～5秒） | ヘルスチェックリトライ（30秒タイムアウト）+ 起動中スピナー |
| ポート8080が他アプリと競合 | 起動失敗時は 8081, 8082... と自動フォールバック |
| 8GBモデルの誤ダウンロード | ダウンロード前にファイルサイズを表示して確認を求める |
| アプリ終了時のゾンビプロセス | on_window_event で CloseRequested に kill() |

## 影響範囲

- `scripts/build_llama_server.sh`: 新規
- `scripts/build_llama_server.ps1`: 新規
- `src-tauri/Cargo.toml`: reqwest（features: stream）追加
- `src-tauri/src/lib.rs`: サブプロセス管理 + ダウンロードコマンド追加
- `src/lib/ai.ts`: BonsaiProvider追加（Phase 1のプロバイダー抽象化に統合）
- `src/lib/settings.ts`: ローカルAI設定キー追加
- `src/components/LocalAIModelManager.tsx`: 新規
- `src/pages/Settings.tsx`: ローカルAIセクション追加
- `src-tauri/tauri.conf.json`: CSP（huggingface.co追加）
