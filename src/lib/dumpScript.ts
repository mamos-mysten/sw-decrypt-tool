/**
 * Paste this into the Slush extension's DevTools console (not a normal web page).
 * Right-click the extension popup → Inspect → Console → paste → Enter.
 * Downloads slush-idb-dump.json and logs the dump object.
 */
export const DB_DUMP_SCRIPT = `// Run this in the Slush extension's own DevTools, not a normal web page.
// Right-click the extension popup → Inspect → Console, then paste and press Enter.
// It downloads slush-idb-dump.json and also logs the dump object.

(async function dumpSlushIndexedDB() {
  var FALLBACK_DBS = [
    "keyval-store",
    "signaldb-Accounts",
    "signaldb-Providers",
    "signaldb-Preferences",
    "signaldb-Connections",
    "signaldb-accounts",
    "signaldb-providers",
    "signaldb-preferences",
    "signaldb-connections",
  ];

  function dumpStore(db, storeName) {
    return new Promise(function (resolve) {
      var rows = [];
      try {
        var tx = db.transaction(storeName, "readonly");
        var store = tx.objectStore(storeName);
        var req = store.openCursor();
        req.onsuccess = function () {
          var cursor = req.result;
          if (cursor) {
            rows.push({ key: cursor.key, value: cursor.value });
            cursor.continue();
          }
        };
        req.onerror = function () {
          console.warn("Failed to cursor store", db.name, storeName, req.error);
          resolve(rows);
        };
        tx.oncomplete = function () {
          resolve(rows);
        };
        tx.onerror = function () {
          console.warn("Failed to dump store", db.name, storeName, tx.error);
          resolve(rows);
        };
      } catch (err) {
        console.warn("Failed to dump store", db.name, storeName, err);
        resolve(rows);
      }
    });
  }

  function openAndDump(name) {
    return new Promise(function (resolve) {
      var created = false;
      try {
        var req = indexedDB.open(name);
        req.onupgradeneeded = function () {
          created = true;
        };
        req.onerror = function () {
          console.warn("Failed to open database", name, req.error);
          resolve(null);
        };
        req.onsuccess = function () {
          var db = req.result;
          var finish = function (stores) {
            try {
              db.close();
            } catch (_closeErr) {}
            if (created) {
              try {
                indexedDB.deleteDatabase(name);
              } catch (_delErr) {}
            }
            resolve(stores);
          };
          if (created && db.objectStoreNames.length === 0) {
            finish(null);
            return;
          }
          var storeNames = Array.from(db.objectStoreNames);
          var stores = {};
          var chain = Promise.resolve();
          storeNames.forEach(function (storeName) {
            chain = chain.then(function () {
              return dumpStore(db, storeName).then(function (rows) {
                stores[storeName] = rows;
              });
            });
          });
          chain.then(function () {
            finish(stores);
          }).catch(function (err) {
            console.warn("Failed to dump database", name, err);
            finish(stores);
          });
        };
      } catch (err) {
        console.warn("Failed to open database", name, err);
        resolve(null);
      }
    });
  }

  var names = [];
  try {
    if (typeof indexedDB.databases === "function") {
      var listed = await indexedDB.databases();
      if (listed && listed.length) {
        names = listed
          .map(function (db) {
            return db && db.name;
          })
          .filter(Boolean);
      }
    }
  } catch (err) {
    console.warn("indexedDB.databases() failed", err);
  }
  if (!names.length) {
    names = FALLBACK_DBS;
  }

  var databases = {};
  for (var i = 0; i < names.length; i++) {
    var dbName = names[i];
    try {
      var stores = await openAndDump(dbName);
      if (stores) {
        databases[dbName] = stores;
      }
    } catch (err) {
      console.warn("Skipping database", dbName, err);
    }
  }

  var dump = {
    dumpedAt: new Date().toISOString(),
    origin: location.origin,
    databases: databases,
  };

  console.log(dump);

  var json;
  try {
    json = JSON.stringify(dump, function (_key, value) {
      if (typeof value === "bigint") return value.toString();
      if (value instanceof Date) return value.toISOString();
      return value;
    }, 2);
  } catch (err) {
    console.warn("Failed to serialize dump", err);
    json = JSON.stringify({
      dumpedAt: dump.dumpedAt,
      origin: dump.origin,
      databases: {},
      error: String(err && err.message ? err.message : err),
    });
  }

  var blob = new Blob([json], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "slush-idb-dump.json";
  a.click();
  URL.revokeObjectURL(url);

  return dump;
})();
`;
