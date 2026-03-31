import { invoke } from '@tauri-apps/api/core';
import { format } from 'date-fns';
import { setSetting, SETTING_KEYS } from './settings';
import { closeDb } from './db';

const DB_FILENAME = 'sebastian.db';

function joinPath(dir: string, filename: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith(sep) ? `${dir}${filename}` : `${dir}${sep}${filename}`;
}

/** メインPCからサブPCへ：同期フォルダにDBをコピー */
export async function pushSync(syncFolder: string): Promise<void> {
  if (!syncFolder) throw new Error('同期フォルダが設定されていません');

  const dbPath = await invoke<string>('get_db_path');
  const destPath = joinPath(syncFolder, DB_FILENAME);

  // DB書き込み後にcloseするため先に記録
  await setSetting(SETTING_KEYS.LAST_SYNC_AT, new Date().toISOString());

  await closeDb();
  await invoke<void>('copy_file', { src: dbPath, dest: destPath });
  // 次のDB操作で自動再接続される
}

/** サブPCからメインPCへ：同期フォルダのDBで上書き（自動バックアップ付き） */
export async function pullSync(syncFolder: string): Promise<string> {
  if (!syncFolder) throw new Error('同期フォルダが設定されていません');

  const srcPath = joinPath(syncFolder, DB_FILENAME);
  const exists = await invoke<boolean>('file_exists', { path: srcPath });
  if (!exists) throw new Error('同期フォルダにDBファイルが見つかりません');

  const dbPath = await invoke<string>('get_db_path');
  const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
  const backupPath = dbPath.replace('sebastian.db', `sebastian_backup_${timestamp}.db`);

  await closeDb();

  // 現在のDBをバックアップ
  await invoke<void>('copy_file', { src: dbPath, dest: backupPath });

  // 同期フォルダのDBで上書き
  await invoke<void>('copy_file', { src: srcPath, dest: dbPath });

  return backupPath;
}

/** 同期フォルダ内DBの最終更新日時（Unix秒）を取得 */
export async function getSyncFolderDbMtime(syncFolder: string): Promise<number | null> {
  const path = joinPath(syncFolder, DB_FILENAME);
  const mtime = await invoke<number | null>('get_file_mtime', { path });
  return mtime ?? null;
}
