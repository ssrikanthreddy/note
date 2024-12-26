// utils/indexeddb.js

// Open a connection to IndexedDB
const openDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("SlateNotesDB", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("notes")) {
        db.createObjectStore("notes", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

// Serialize Slate content into a JSON string for storage
export const serialize = (content) => {
  return JSON.stringify(content);
};

// Deserialize JSON string back into Slate content
export const deserialize = (serializedContent) => {
  return JSON.parse(serializedContent);
};

// Save a note to IndexedDB
export const saveNote = async (id, content) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("notes", "readwrite");
    const store = transaction.objectStore("notes");
    const serializedContent = serialize(content);

    const request = store.put({ id, content: serializedContent });

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
};

// Load a note from IndexedDB by ID
export const loadNote = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("notes", "readonly");
    const store = transaction.objectStore("notes");

    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve(deserialize(result.content));
      } else {
        resolve(null); // Return null if no note is found
      }
    };

    request.onerror = (event) => reject(event.target.error);
  });
};
