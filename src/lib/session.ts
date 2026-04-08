import { invoke } from '@tauri-apps/api/core';
import { getSetting, SETTING_KEYS } from './settings';

// セッション期間の選択肢
export type SessionDuration =
  | 'APP_RESTART'
  | '1h'
  | '6h'
  | '1d'
  | '2w'
  | '1m'
  | '3m'
  | 'FOREVER';

export interface SessionState {
  unlocked: boolean;
  expiresAt: Date | null;
  password: string | null;
}

const LS_EXPIRES_AT_KEY = 'session_expires_at';

// パスワード生値はメモリのみで保持（アプリ再起動で必ずリセット）
let _password: string | null = null;
let _expiresAt: Date | null = null;

function calcExpiresAt(duration: SessionDuration): Date | null {
  const now = Date.now();
  switch (duration) {
    case '1h': return new Date(now + 1 * 60 * 60 * 1000);
    case '6h': return new Date(now + 6 * 60 * 60 * 1000);
    case '1d': return new Date(now + 24 * 60 * 60 * 1000);
    case '2w': return new Date(now + 14 * 24 * 60 * 60 * 1000);
    case '1m': return new Date(now + 30 * 24 * 60 * 60 * 1000);
    case '3m': return new Date(now + 90 * 24 * 60 * 60 * 1000);
    default:   return null; // APP_RESTART / FOREVER は期限なし
  }
}

/**
 * マスターパスワードを検証してセッションを開始する。
 * @returns 検証成功なら true、パスワード未設定または不一致なら false
 */
export async function unlock(password: string): Promise<boolean> {
  const hash = await getSetting(SETTING_KEYS.MASTER_PASSWORD_HASH);
  if (!hash) return false;

  const valid = await invoke<boolean>('verify_password', { password, hash });
  if (!valid) return false;

  const durationStr = await getSetting(SETTING_KEYS.SESSION_DURATION) ?? 'APP_RESTART';
  const duration = durationStr as SessionDuration;

  _password = password;
  _expiresAt = calcExpiresAt(duration);

  // 有効期限がある場合のみlocalStorageへ保存
  // APP_RESTART / FOREVER はメモリのみ（再起動で自動失効）
  if (_expiresAt !== null) {
    localStorage.setItem(LS_EXPIRES_AT_KEY, _expiresAt.toISOString());
  } else {
    localStorage.removeItem(LS_EXPIRES_AT_KEY);
  }

  return true;
}

/** セッションをクリアしてパスワードをメモリから削除する */
export function lock(): void {
  _password = null;
  _expiresAt = null;
  localStorage.removeItem(LS_EXPIRES_AT_KEY);
}

/** セッションが現在有効かチェック（有効期限も検証）*/
export function isUnlocked(): boolean {
  if (_password === null) return false;
  if (_expiresAt !== null && _expiresAt < new Date()) {
    // 期限切れのため自動ロック
    lock();
    return false;
  }
  return true;
}

/** 復号に使うパスワードを返す（セッション無効なら null）*/
export function getPassword(): string | null {
  return isUnlocked() ? _password : null;
}

/** 現在のセッション状態のスナップショットを返す */
export function getState(): SessionState {
  const unlocked = isUnlocked();
  return {
    unlocked,
    expiresAt: _expiresAt,
    // ロック中はパスワードを公開しない
    password: unlocked ? _password : null,
  };
}

/**
 * 値をAES-256-GCMで暗号化する（Rustコマンドのラッパー）。
 * 暗号化済み値は "ENC:" プレフィックスを付けて返す。
 */
export async function encrypt(value: string): Promise<string> {
  const password = getPassword();
  if (!password) throw new Error('セッションがロックされています');
  const encoded = await invoke<string>('encrypt_value', { plaintext: value, password });
  return `ENC:${encoded}`;
}

/**
 * "ENC:" プレフィックス付きの暗号化値を復号する（Rustコマンドのラッパー）。
 * プレフィックスがない場合は平文とみなしてそのまま返す（後方互換）。
 */
export async function decrypt(value: string): Promise<string> {
  if (!value.startsWith('ENC:')) return value;
  const password = getPassword();
  if (!password) throw new Error('セッションがロックされています');
  return invoke<string>('decrypt_value', { ciphertext: value.slice(4), password });
}
