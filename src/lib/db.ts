import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:sebastian.db');
  }
  return dbInstance;
}

export async function executeDb(query: string, bindValues?: unknown[]): Promise<any> {
  const db = await getDb();
  return await db.execute(query, bindValues);
}

export async function selectDb<T>(query: string, bindValues?: unknown[]): Promise<T[]> {
  const db = await getDb();
  return await db.select<T[]>(query, bindValues);
}
