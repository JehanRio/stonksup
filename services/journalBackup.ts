const DB_NAME = 'strategy_journal_backup_db_v1';
const STORE_NAME = 'file_handles';
const HANDLE_KEY = 'journal_backup_file';

type JournalBackupPermissionMode = 'read' | 'readwrite';

type JournalBackupPermissionDescriptor = {
  mode?: JournalBackupPermissionMode;
};

type JournalBackupWritable = {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
};

export type JournalBackupFileHandle = {
  kind: 'file';
  name: string;
  createWritable: () => Promise<JournalBackupWritable>;
  queryPermission?: (descriptor?: JournalBackupPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: JournalBackupPermissionDescriptor) => Promise<PermissionState>;
};

type JournalBackupWindow = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<JournalBackupFileHandle>;
  };

type JournalBackupPayload = {
  version: 1;
  app: 'ai-investment-agent';
  storageKey: string;
  exportedAt: string;
  entries: unknown;
};

const getBackupWindow = () => window as JournalBackupWindow;

const openBackupDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const runStoreRequest = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const isJournalFileBackupSupported = () =>
  typeof window !== 'undefined' &&
  typeof indexedDB !== 'undefined' &&
  typeof getBackupWindow().showSaveFilePicker === 'function';

export const createJournalBackupHandle = async () => {
  const picker = getBackupWindow().showSaveFilePicker;

  if (!picker) {
    throw new Error('当前浏览器不支持直接写入本地备份文件');
  }

  return picker({
    suggestedName: 'strategy-journal-backup.json',
    types: [
      {
        description: 'Trading journal backup',
        accept: {
          'application/json': ['.json'],
        },
      },
    ],
  });
};

export const getStoredJournalBackupHandle = async () => {
  if (!isJournalFileBackupSupported()) {
    return null;
  }

  const db = await openBackupDb();

  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    return (await runStoreRequest(store.get(HANDLE_KEY))) as JournalBackupFileHandle | undefined;
  } finally {
    db.close();
  }
};

export const persistJournalBackupHandle = async (handle: JournalBackupFileHandle) => {
  const db = await openBackupDb();

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    await runStoreRequest(store.put(handle, HANDLE_KEY));
  } finally {
    db.close();
  }
};

export const ensureJournalBackupPermission = async (
  handle: JournalBackupFileHandle,
  requestPermission: boolean
) => {
  const descriptor = { mode: 'readwrite' as const };

  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }

  if ((await handle.queryPermission(descriptor)) === 'granted') {
    return true;
  }

  if (!requestPermission) {
    return false;
  }

  return (await handle.requestPermission(descriptor)) === 'granted';
};

export const writeJournalBackup = async (
  handle: JournalBackupFileHandle,
  entries: unknown,
  storageKey: string
) => {
  const hasPermission = await ensureJournalBackupPermission(handle, false);

  if (!hasPermission) {
    return { ok: false as const, reason: 'permission' as const };
  }

  const payload: JournalBackupPayload = {
    version: 1,
    app: 'ai-investment-agent',
    storageKey,
    exportedAt: new Date().toISOString(),
    entries,
  };

  const writable = await handle.createWritable();
  await writable.write(`${JSON.stringify(payload, null, 2)}\n`);
  await writable.close();

  return { ok: true as const };
};
