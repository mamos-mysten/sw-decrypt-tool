/**
 * Paste into the Slush extension page DevTools console (popup or full tab).
 * Do NOT use the service-worker inspector from chrome://extensions — its
 * Application panel hides IndexedDB even when data exists. Prefer:
 *   chrome-extension://<EXT_ID>/index.html → Inspect → Console
 */
export const DB_DUMP_SCRIPT = `// Run in the Slush EXTENSION PAGE DevTools (popup or full tab).
// Best: open chrome-extension://<EXT_ID>/index.html (ID from chrome://extensions),
// then right-click → Inspect → Console → paste → Enter.
// Do NOT use "Service worker" Inspect from chrome://extensions (Application/IDB UI is blank there).
// Do NOT run on my.slush.app / localhost — wrong origin, empty dump.
// Downloads slush-idb-dump.json and logs a summary + dump object.

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

  var origin = String(location.origin || "");
  var isExtensionOrigin = origin.indexOf("chrome-extension://") === 0
    || origin.indexOf("moz-extension://") === 0;

  if (!isExtensionOrigin) {
    console.error(
      "[slush-dump] Wrong origin:",
      origin,
      "\\nOpen the extension page (chrome-extension://<ID>/index.html) and run there."
    );
    return {
      error: "wrong-origin",
      origin: origin,
      hint: "Run inside chrome-extension://<EXT_ID>/index.html DevTools, not a website.",
    };
  }

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

  // Open existing DBs only — never create empty ones (that would pollute the profile).
  function openExistingAndDump(name) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open(name);
        var created = false;
        req.onupgradeneeded = function (event) {
          created = true;
          // Abort creation of a brand-new empty DB from fallback guesses.
          try {
            event.target.transaction.abort();
          } catch (_abortErr) {}
        };
        req.onerror = function () {
          // Missing DB / aborted upgrade → treat as absent.
          resolve(null);
        };
        req.onsuccess = function () {
          var db = req.result;
          if (created) {
            try {
              db.close();
            } catch (_closeErr) {}
            try {
              indexedDB.deleteDatabase(name);
            } catch (_delErr) {}
            resolve(null);
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
          chain
            .then(function () {
              try {
                db.close();
              } catch (_closeErr2) {}
              resolve(stores);
            })
            .catch(function (err) {
              console.warn("Failed to dump database", name, err);
              try {
                db.close();
              } catch (_closeErr3) {}
              resolve(stores);
            });
        };
      } catch (err) {
        console.warn("Failed to open database", name, err);
        resolve(null);
      }
    });
  }

  var listedNames = [];
  var databasesApiAvailable = typeof indexedDB.databases === "function";
  try {
    if (databasesApiAvailable) {
      var listed = await indexedDB.databases();
      if (listed && listed.length) {
        listedNames = listed
          .map(function (db) {
            return db && db.name;
          })
          .filter(Boolean);
      }
    }
  } catch (err) {
    console.warn("indexedDB.databases() failed", err);
  }

  // Prefer enumerated names; only fall back when the API is missing entirely.
  var names = listedNames.length
    ? listedNames
    : databasesApiAvailable
      ? []
      : FALLBACK_DBS.slice();

  console.log("[slush-dump] origin:", origin);
  console.log(
    "[slush-dump] indexedDB.databases():",
    databasesApiAvailable ? listedNames : "(API unavailable — using fallback list)"
  );

  var databases = {};
  for (var i = 0; i < names.length; i++) {
    var dbName = names[i];
    try {
      var stores = await openExistingAndDump(dbName);
      if (stores) {
        databases[dbName] = stores;
      }
    } catch (err) {
      console.warn("Skipping database", dbName, err);
    }
  }

  // If enumeration was empty, still probe known names without creating them.
  if (!Object.keys(databases).length && listedNames.length === 0) {
    for (var j = 0; j < FALLBACK_DBS.length; j++) {
      var probeName = FALLBACK_DBS[j];
      try {
        var probed = await openExistingAndDump(probeName);
        if (probed) {
          databases[probeName] = probed;
        }
      } catch (err2) {
        console.warn("Skipping database", probeName, err2);
      }
    }
  }

  var keyvalRows =
    (databases["keyval-store"] && databases["keyval-store"].keyval) || [];
  var secretKeys = keyvalRows
    .map(function (row) {
      return row && row.key != null ? String(row.key) : "";
    })
    .filter(function (key) {
      return (
        key.indexOf("mnemonic__") === 0 ||
        key.indexOf("imported__") === 0 ||
        key.indexOf("zkLogin__") === 0
      );
    });

  var summary = {
    origin: origin,
    dbNames: Object.keys(databases),
    keyvalEntryCount: keyvalRows.length,
    secretKeyCount: secretKeys.length,
    secretKeys: secretKeys,
    hasBasePassword: keyvalRows.some(function (row) {
      return row && row.key === "base_password";
    }),
    hasPasswordHash: keyvalRows.some(function (row) {
      return row && row.key === "password_hash";
    }),
  };

  var dump = {
    dumpedAt: new Date().toISOString(),
    origin: origin,
    summary: summary,
    databases: databases,
  };

  console.log("[slush-dump] summary:", summary);
  if (!summary.dbNames.length) {
    console.warn(
      "[slush-dump] No IndexedDB databases found in this origin.\\n" +
        "If you expected data: confirm you are on chrome-extension://…/index.html " +
        "(not the service-worker inspector, not my.slush.app).\\n" +
        "If this origin is correct and still empty, the wallet was likely reset/signed out " +
        "and local secrets are gone."
    );
  } else if (!summary.secretKeyCount) {
    console.warn(
      "[slush-dump] keyval-store has no mnemonic__/imported__ secrets.\\n" +
        "zkLogin-only / Sync accounts without a local passphrase store nothing recoverable here."
    );
  }
  console.log(dump);

  var json;
  try {
    json = JSON.stringify(
      dump,
      function (_key, value) {
        if (typeof value === "bigint") return value.toString();
        if (value instanceof Date) return value.toISOString();
        return value;
      },
      2
    );
  } catch (err) {
    console.warn("Failed to serialize dump", err);
    json = JSON.stringify({
      dumpedAt: dump.dumpedAt,
      origin: dump.origin,
      summary: summary,
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
