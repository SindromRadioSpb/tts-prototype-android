// This record is protected by its own atomic IndexedDB transaction. Physical
// first-backend selection is additionally serialized by the OPFS operation lock.
// Existing localStorage preference is authoritative; a mismatch fails closed.
export async function storageIdentity(preference) {
  if (preference && !['AccessHandlePool', 'tts-opfs-idb'].includes(preference)) throw new Error('DB_PREFERRED_STORAGE_UNAVAILABLE: unknown storage preference');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('linguistpro-storage-identity-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('identity');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('identity', 'readwrite');
      const store = transaction.objectStore('identity');
      const request = store.get('vfs');
      let selected;
      let failure;
      request.onsuccess = () => {
        if (preference && request.result && preference !== request.result) {
          failure = new Error('DB_PREFERRED_STORAGE_UNAVAILABLE: storage identity mismatch');
          transaction.abort(); return;
        }
        selected = request.result || preference || null;
        if (selected && !request.result) store.put(selected, 'vfs');
      };
      transaction.oncomplete = () => resolve(selected);
      transaction.onabort = transaction.onerror = () => reject(failure || transaction.error || new Error('Storage identity unavailable'));
    });
  } finally { database.close(); }
}
