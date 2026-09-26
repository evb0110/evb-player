interface IDirectoryHandleRecord {
  folderId: string;
  handle: FileSystemDirectoryHandle;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  const promise = databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('evb-player-web-folders', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains('directories')) {
        database.deleteObjectStore('directories');
      }
      if (!database.objectStoreNames.contains('roots')) {
        database.createObjectStore('roots', {keyPath: 'folderId'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return promise;
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getDirectoryHandle(folderId: string) {
  const database = await openDatabase();
  const transaction = database.transaction('roots', 'readonly');
  const record = await requestValue(transaction.objectStore('roots').get(folderId) as IDBRequest<IDirectoryHandleRecord | undefined>);
  await transactionDone(transaction);
  return record?.handle ?? null;
}

export async function putDirectoryHandle(folderId: string, handle: FileSystemDirectoryHandle) {
  const database = await openDatabase();
  const transaction = database.transaction('roots', 'readwrite');
  transaction.objectStore('roots').put({folderId, handle} satisfies IDirectoryHandleRecord);
  await transactionDone(transaction);
}

export async function deleteDirectoryHandle(folderId: string) {
  const database = await openDatabase();
  const transaction = database.transaction('roots', 'readwrite');
  transaction.objectStore('roots').delete(folderId);
  await transactionDone(transaction);
}

export async function getAllDirectoryHandles() {
  const database = await openDatabase();
  const transaction = database.transaction('roots', 'readonly');
  const records = await requestValue(transaction.objectStore('roots').getAll() as IDBRequest<IDirectoryHandleRecord[]>);
  await transactionDone(transaction);
  return records;
}
