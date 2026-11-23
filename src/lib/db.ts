import type { ChatMessage, TaskDraft } from '../types';

const DB_NAME = 'qa_bugsnap_db';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';
const MESSAGES_STORE = 'messages';

const FALLBACK_DRAFTS_KEY = 'qa_bugsnap_fallback_drafts';
const FALLBACK_MESSAGES_KEY = 'qa_bugsnap_fallback_messages';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open error'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB transaction error'));
    tx.oncomplete = () => db.close();
  });
}

export async function getAllDrafts(): Promise<TaskDraft[]> {
  try {
    const items = await withStore<TaskDraft[]>(DRAFTS_STORE, 'readonly', (s) => s.getAll());
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    try {
      const raw = localStorage.getItem(FALLBACK_DRAFTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as TaskDraft[]) : [];
      return parsed.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }
}

export async function saveDraft(draft: TaskDraft): Promise<void> {
  try {
    await withStore(DRAFTS_STORE, 'readwrite', (s) => s.put(draft));
  } catch {
    const existing = await getAllDrafts();
    const next = [draft, ...existing.filter((d) => d.id !== draft.id)];
    localStorage.setItem(FALLBACK_DRAFTS_KEY, JSON.stringify(next));
  }
}

export async function deleteDraftById(id: string): Promise<void> {
  try {
    await withStore(DRAFTS_STORE, 'readwrite', (s) => s.delete(id));
  } catch {
    const existing = await getAllDrafts();
    localStorage.setItem(
      FALLBACK_DRAFTS_KEY,
      JSON.stringify(existing.filter((d) => d.id !== id))
    );
  }
}

export async function getAllMessages(): Promise<ChatMessage[]> {
  try {
    const items = await withStore<ChatMessage[]>(MESSAGES_STORE, 'readonly', (s) => s.getAll());
    return items.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    try {
      const raw = localStorage.getItem(FALLBACK_MESSAGES_KEY);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
      return parsed.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return [];
    }
  }
}

export async function saveMessage(msg: ChatMessage): Promise<void> {
  try {
    await withStore(MESSAGES_STORE, 'readwrite', (s) => s.put(msg));
  } catch {
    const existing = await getAllMessages();
    const next = [...existing.filter((m) => m.id !== msg.id), msg];
    localStorage.setItem(FALLBACK_MESSAGES_KEY, JSON.stringify(next));
  }
}

export async function deleteMessageById(id: string): Promise<void> {
  try {
    await withStore(MESSAGES_STORE, 'readwrite', (s) => s.delete(id));
  } catch {
    const existing = await getAllMessages();
    localStorage.setItem(
      FALLBACK_MESSAGES_KEY,
      JSON.stringify(existing.filter((m) => m.id !== id))
    );
  }
}

export async function clearAllMessages(): Promise<void> {
  try {
    await withStore(MESSAGES_STORE, 'readwrite', (s) => s.clear());
  } catch {
    localStorage.removeItem(FALLBACK_MESSAGES_KEY);
  }
}
