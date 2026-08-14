# Slush wallet recovery

Support tool for recovering **passphrase (mnemonic)** and **private-key (imported)** wallets from a dump of the Slush browser extension’s IndexedDB.

Everything runs **client-side in your browser**. Secrets are never uploaded and are never stored on Slush servers.

## What it recovers

- **Mnemonic accounts** — BIP39 recovery phrase, plus derived Sui addresses (from SignalDB metadata, or indexes 0–19 if metadata is missing).
- **Imported accounts** — `suiprivkey1…` private key and its address.
- **zkLogin** — reported only. There is no phrase or private key to recover.

Ledger and read-only accounts are not in the encrypted secret store.

## Produce a dump

IndexedDB lives on the extension origin. Chrome’s **service-worker** DevTools
hides the Application → IndexedDB UI even when data is present — dump from an
extension **page** instead.

1. Open `chrome://extensions`, enable Developer mode, copy the Slush **Extension ID**.
2. Open `chrome-extension://<EXT_ID>/index.html` in a tab (or use the popup).
3. Right-click that page → **Inspect** → **Console** (not “Service worker” from the extensions page).
4. In this tool, click **Copy DB dump script**, paste, press Enter.
5. Confirm the console summary shows `origin: chrome-extension://…` and ideally `secretKeyCount > 0`.
6. Upload the downloaded `slush-idb-dump.json`.

If `origin` is `https://my.slush.app` / localhost, you ran it in the wrong place.
If origin is correct but `dbNames` / `secretKeyCount` are empty, this profile has
no local passphrase/private-key material (reset/sign-out, or zkLogin-only).

## Two decryption cases

**No wallet password.** Secrets are encrypted with an app-generated obfuscation password stored in plaintext in the dump as `base_password`. This tool reads it automatically — you can leave the password field blank.

**Wallet password set.** Secrets are encrypted with the user’s password. Presence of `password_hash` in the dump means a password is required. Enter the password the user used to unlock Slush. The tool still tries `base_password` as a fallback for secrets that were encrypted before a password was added.

## Reset / sign-out

If the user **reset the wallet** or **signed out**, IndexedDB is wiped. There is nothing left to decrypt. Slush never has a copy of the passphrase or private key. That dump will show `base_password` missing and/or no `mnemonic__` / `imported__` keys — this is unrecoverable.

## Local development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). To generate a synthetic dump for UI testing (writes `.recovery-verify/fixture.dump.json` and prints phrases + addresses):

```bash
node scripts/generate-fixture.mjs
node scripts/generate-fixture.mjs --with-password 'test-password'
```
