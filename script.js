/***************************************************************************
 *  FIREBASE INITIALIZATION
 ***************************************************************************/

//  Firebase config
firebase.initializeApp({
  apiKey: "AIzaSyC7lCDQssJJkOe9ux49hmyUCD9Y5NMEdBs",
  authDomain: "test3-53d9d.firebaseapp.com",
  projectId: "test3-53d9d",
  storageBucket: "test3-53d9d.appspot.com",
  messagingSenderId: "23633134126",
  appId: "1:23633134126:web:b9b021dcf5eff4087e95bf",
  measurementId: "G-4PWTYR2E9Q"
});

// Firestore reference
const db = firebase.firestore();
const itemsCollection = db.collection("items");


/***************************************************************************
 *  INDEXEDDB SETUP (OFFLINE DATABASE)
 ***************************************************************************/

let dbLocal;
const DB_NAME = "pockets-db";
const STORE = "items";

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(DB_NAME, 1);

    openReq.onupgradeneeded = (event) => {
      dbLocal = event.target.result;
      dbLocal.createObjectStore(STORE, { keyPath: "id" });
    };

    openReq.onsuccess = (event) => {
      dbLocal = event.target.result;
      resolve();
    };

    openReq.onerror = reject;
  });
}

// IndexedDB helpers
function idbAdd(item) {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = resolve;
  });
}

function idbGetAll() {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

function idbDelete(id) {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
  });
}

function idbClear() {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
  });
}


/***************************************************************************
 *  ONLINE / OFFLINE DETECTION
 ***************************************************************************/

function updateStatus() {
  const statusText = document.getElementById("statusText");
  statusText.textContent = navigator.onLine ? "Online" : "Offline";
  statusText.style.color = navigator.onLine ? "green" : "red";
}

window.addEventListener("online", handleReconnect);
window.addEventListener("offline", updateStatus);


/***************************************************************************
 *  SYNC LOGIC — On reconnect, send IndexedDB → Firestore
 ***************************************************************************/

async function handleReconnect() {
  updateStatus();
  showToast("Back online — syncing...");
  await syncLocalToFirebase();
}

async function syncLocalToFirebase() {
  const localItems = await idbGetAll();
  if (localItems.length === 0) return;

  for (const item of localItems) {
    await itemsCollection.doc(item.id).set(item);
  }

  await idbClear();
  await loadItemsFromFirebase();

  showToast("Sync complete!");
}


/***************************************************************************
 *  CRUD OPERATIONS
 ***************************************************************************/

async function addItem(name, locationText) {
  const id = Date.now().toString();

  const item = {
    id,
    name,
    location: locationText,
    timestamp: Date.now()
  };

  if (navigator.onLine) {
    await itemsCollection.doc(id).set(item);
  } else {
    await idbAdd(item);
  }

  await loadItems();
  showToast("Item added!");
}

async function deleteItem(id) {
  if (navigator.onLine) {
    await itemsCollection.doc(id).delete();
  } else {
    await idbDelete(id);
  }

  await loadItems();
  showToast("Item deleted");
}


/***************************************************************************
 *  LOAD ITEMS FROM THE CORRECT SOURCE
 ***************************************************************************/

let items = [];

async function loadItems() {
  if (navigator.onLine) {
    await loadItemsFromFirebase();
  } else {
    await loadItemsFromIndexedDB();
  }

  renderItems();
}

async function loadItemsFromFirebase() {
  const snapshot = await itemsCollection.orderBy("timestamp").get();
  items = snapshot.docs.map(doc => doc.data());
}

async function loadItemsFromIndexedDB() {
  items = await idbGetAll();
}


/***************************************************************************
 *  RENDER ITEMS INTO UI
 ***************************************************************************/

function renderItems() {
  const list = document.getElementById("itemList");
  list.innerHTML = "";

  if (items.length === 0) {
    list.innerHTML = "<li><em>No items yet</em></li>";
    return;
  }

  items.forEach(item => {
    const li = document.createElement("li");

    li.innerHTML = `
      <div class="item-main">
        <span class="item-name">${item.name}</span>
        <span class="item-meta">${item.location || "No location provided"}</span>
      </div>
      <button class="delete-btn" onclick="deleteItem('${item.id}')">
        <img src="delete-icon.png" alt="Delete" />
      </button>
    `;

    list.appendChild(li);
  });
}


/***************************************************************************
 *  USER INPUT HANDLERS
 ***************************************************************************/

document.getElementById("addItemButton").addEventListener("click", async () => {
  const name = document.getElementById("itemName").value.trim();
  const locationText = document.getElementById("itemLocation").value.trim();

  if (!name) {
    showToast("Please enter an item name");
    return;
  }

  await addItem(name, locationText);

  document.getElementById("itemName").value = "";
  document.getElementById("itemLocation").value = "";
});

document.getElementById("syncButton")?.addEventListener("click", async () => {
  if (!navigator.onLine) {
    showToast("Offline — Cannot sync");
    return;
  }

  showToast("Syncing...");
  await syncLocalToFirebase();
});


/***************************************************************************
 *  REMINDER SYSTEM
 ***************************************************************************/

let reminderIntervalId = null;

document.getElementById("setReminderButton").addEventListener("click", () => {
  const mins = parseInt(document.getElementById("reminderInterval").value);

  if (isNaN(mins) || mins <= 0) {
    showToast("Enter a valid number");
    return;
  }

  if (reminderIntervalId) clearInterval(reminderIntervalId);

  reminderIntervalId = setInterval(() => {
    if (items.length === 0) {
      alert("Check your pockets!");
      return;
    }

    const list = items.map(i =>
      `${i.name}${i.location ? ` (${i.location})` : ""}`
    ).join(", ");

    alert("Reminder: " + list);
  }, mins * 60 * 1000);

  showToast("Reminder set!");
});

document.getElementById("cancelReminderButton")?.addEventListener("click", () => {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
    showToast("Reminder canceled");
  }
});


/***************************************************************************
 *  TOAST POPUP FUNCTION
 ***************************************************************************/

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}


/***************************************************************************
 *  INITIAL APP SETUP
 ***************************************************************************/

(async function init() {
  await initIndexedDB();
  updateStatus();
  await loadItems();
})();
