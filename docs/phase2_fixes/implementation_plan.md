# Phase 2 修正: 実装計画

## 概要

Phase 2（マスターパスワード）実装完了後に発見された4つのバグを修正する。
修正は2つの並列タスクに整理し、同一ファイル編集はサブタスクとして順次処理する。

---

## Task A: Settings.tsx の修正（3サブタスク・順次処理）

### A-1: スイッチデザイン統一

**変更方針:**

現在のセキュリティセクションのマスターパスワードトグルは、`bg-sebastian-parchment/50` コンテナ内にShieldアイコン＋バッジと共に配置されているが、他のトグル（自動起動・リマインド等）は `flex items-center justify-between` の直下にラベルとトグルが配置されている。

**修正手順:**
1. マスターパスワードトグルの外側コンテナを他のスイッチと同じ `flex items-center justify-between` レイアウトに変更
2. 左側: テキストラベル（"マスターパスワード" + サブテキスト）
3. 右側: トグルボタン（既存のON/OFF動作ロジックはそのまま）
4. 「有効」バッジは残す（ただしスイッチ横に移動）
5. セッション期間・状態表示・変更ボタンは `form.masterPasswordEnabled` が `true` の場合のみ表示（既存動作維持）

**参考: 他のスイッチのHTML構造**
```tsx
<div className="flex items-center justify-between">
  <div>
    <p className="text-sm text-sebastian-text">ラベル</p>
    <p className="text-xs text-sebastian-lightgray mt-0.5">サブテキスト</p>
  </div>
  <button className={`relative w-11 h-6 rounded-full ...`}>
    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full ...`} />
  </button>
</div>
```

---

### A-2: APIキー復号読み込み対応

**変更方針:**

Settings.tsx の `load()` 関数で暗号化対象のAPIキーを `getSetting()` → `getDecryptedSetting()` に変更する。

**修正手順:**

1. `load()` 関数内の APIキー取得を変更:
   ```typescript
   // Before
   getSetting(SETTING_KEYS.GEMINI_API_KEY),

   // After
   getDecryptedSetting(SETTING_KEYS.GEMINI_API_KEY),
   ```
   対象キー: `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `NANOGPT_API_KEY`

2. `getDecryptedSetting` のインポートを追加（既に `settings.ts` からインポート済みだが確認）

3. `handleSave()` に空値ガードを追加:
   - セッション未解除時に `getDecryptedSetting()` が `null` を返した場合、フォームの APIキー欄は空になる
   - この状態で保存すると空文字でDB上の暗号化キーが上書きされてしまう
   - 対策: APIキーが空で、かつ DB上に暗号化済み値が存在する場合は保存をスキップする
   - もしくは、フォーム上で「変更されたか」を追跡するフラグを追加する

4. カスタムプロバイダーのAPIキーも同様に復号して読み込む

**注意点:**
- `getDecryptedSetting()` は非同期関数。既存の `Promise.all()` 内で使用可能
- セッション未解除時は `null` が返るので `?? ''` でフォールバック

---

### A-3: APIキーフィールド グレーアウト＋編集ボタン

**変更方針:**

`ApiKeyField` コンポーネントに「編集モード」の概念を追加する。

**修正手順:**

1. `ApiKeyField` に新しいpropsを追加:
   ```typescript
   interface ApiKeyFieldProps {
     // ... 既存props
     savedValue: string;           // DBに保存済みの値（空なら未保存）
     masterPasswordEnabled: boolean; // マスターパスワード有効フラグ
     onStartEdit: () => void;      // 編集開始コールバック
   }
   ```

2. 内部状態管理:
   ```typescript
   const [editing, setEditing] = useState(!savedValue); // 保存済み値がなければ最初から編集モード
   ```

3. 表示ロジック:
   - `editing === false`（読み取り専用モード）:
     - フィールド: `readOnly`, グレーアウト背景, 値は `"••••••••"` のマスク表示
     - ボタン: 「編集」（Pencilアイコン）
   - `editing === true`（編集モード）:
     - フィールド: 通常入力可能
     - ボタン: 「キャンセル」で `editing = false` に戻す

4. マスターパスワード有効時の編集開始:
   ```typescript
   const handleStartEdit = () => {
     if (masterPasswordEnabled) {
       onChange(''); // 暗号化キーを表示しないようクリア
     }
     setEditing(true);
   };
   ```

5. Eye/EyeOff ボタンは編集モード中のみ表示

---

## Task B: セッション自動有効化（独立・並列処理可能）

**変更方針:**

`MasterPasswordSetupModal.tsx` でパスワードハッシュ保存後に `session.ts` の `unlock()` を呼び出し、即座にセッションを開始する。

**修正手順:**

1. `MasterPasswordSetupModal.tsx` に `unlock` をインポート:
   ```typescript
   import { unlock } from '../lib/session';
   ```

2. `handleSetup()` 内の成功処理を修正:
   ```typescript
   const hash = await invoke<string>('hash_password', { password: newPassword });
   await setSetting(SETTING_KEYS.MASTER_PASSWORD_HASH, hash);
   // ↓ 追加: 設定したパスワードで即座にセッション開始
   await unlock(newPassword);
   setSuccess('マスターパスワードを設定しました');
   onPasswordSet?.();
   ```

3. `handleChangeConfirm()` 内も同様:
   ```typescript
   const hash = await invoke<string>('hash_password', { password: newPassword });
   await setSetting(SETTING_KEYS.MASTER_PASSWORD_HASH, hash);
   // ↓ 追加: 新パスワードでセッション再開始
   await unlock(newPassword);
   setSuccess('パスワードを変更しました');
   onPasswordSet?.();
   ```

4. `handleDelete()` では `unlock()` を呼ばない（パスワード削除 = 暗号化無効化）

**注意:**
- `unlock()` は内部で `verify_password` を呼ぶが、直前に `hash_password` で生成したハッシュがDBに保存済みなので検証は必ず成功する
- セッション期間のデフォルト値 `APP_RESTART` が適用される

---

## ビルド確認

TypeScript変更のみ（Rust変更なし）:
```bash
npm run build
```

---

## リスクと注意事項

1. **Settings.tsx の3サブタスク間の依存**: A-2（復号読み込み）を先に実装しないと、A-3（グレーアウト）の `savedValue` が正しく設定できない。実装順序: A-1 → A-2 → A-3
2. **既存データの後方互換**: マスターパスワード未設定ユーザーへの影響なし（平文キーはそのまま動作）
3. **セッション切れ時のUX**: APIキーが空表示になるが、保存しなければDBの暗号化キーは保持される
