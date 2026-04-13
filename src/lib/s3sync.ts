import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { closeDb } from './db';
import { getSetting, getDecryptedSetting, setSetting, SETTING_KEYS } from './settings';

const DB_FILENAME = 'sebastian.db';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  prefix: string;
}

export type ConflictResult = 'local_newer' | 'remote_newer' | 'same';

/** 設定からS3接続情報を取得（暗号化キーは復号して返す） */
export async function getS3Config(): Promise<S3Config | null> {
  const [endpoint, region, bucket, accessKey, secretKey, prefix] = await Promise.all([
    getSetting(SETTING_KEYS.S3_ENDPOINT),
    getSetting(SETTING_KEYS.S3_REGION),
    getSetting(SETTING_KEYS.S3_BUCKET),
    getDecryptedSetting(SETTING_KEYS.S3_ACCESS_KEY),
    getDecryptedSetting(SETTING_KEYS.S3_SECRET_KEY),
    getSetting(SETTING_KEYS.S3_PREFIX),
  ]);

  if (!endpoint || !region || !bucket || !accessKey || !secretKey) return null;

  return {
    endpoint,
    region,
    bucket,
    access_key: accessKey,
    secret_key: secretKey,
    prefix: prefix ?? '',
  };
}

/** DB クローズ → S3アップロード（次のDB操作で自動再接続） */
export async function s3Push(): Promise<void> {
  const config = await getS3Config();
  if (!config) throw new Error('S3設定が未完了です');

  const dbPath = await invoke<string>('get_db_path');

  // closeDb前に同期日時を記録
  await setSetting(SETTING_KEYS.LAST_SYNC_AT, new Date().toISOString());

  await closeDb();
  await invoke<void>('s3_upload_file', { config, localPath: dbPath, s3Key: DB_FILENAME });
}

/** バックアップ作成 → S3ダウンロード → ページリロード */
export async function s3Pull(): Promise<void> {
  const config = await getS3Config();
  if (!config) throw new Error('S3設定が未完了です');

  const dbPath = await invoke<string>('get_db_path');
  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
  const backupPath = dbPath.replace('sebastian.db', `sebastian_backup_${timestamp}.db`);

  await closeDb();

  // 現在のDBをバックアップ
  await invoke<void>('copy_file', { src: dbPath, dest: backupPath });

  // S3からダウンロードしてDBを上書き
  await invoke<void>('s3_download_file', { config, s3Key: DB_FILENAME, localPath: dbPath });

  window.location.reload();
}

/**
 * ローカルDBとS3オブジェクトのタイムスタンプを比較する。
 * S3オブジェクトが存在しない場合は 'local_newer' を返す。
 */
export async function checkConflict(): Promise<ConflictResult> {
  const config = await getS3Config();
  if (!config) throw new Error('S3設定が未完了です');

  const dbPath = await invoke<string>('get_db_path');

  const localMtime = await invoke<number | null>('get_file_mtime', { path: dbPath });
  if (localMtime === null) throw new Error('ローカルDBのタイムスタンプを取得できません');

  let remoteMtime: number;
  try {
    // Rustコマンドはi64（Unix秒）を返す
    remoteMtime = await invoke<number>('s3_get_object_mtime', { config, s3Key: DB_FILENAME });
  } catch {
    // S3にオブジェクトが存在しない場合
    return 'local_newer';
  }

  if (localMtime > remoteMtime) return 'local_newer';
  if (localMtime < remoteMtime) return 'remote_newer';
  return 'same';
}
