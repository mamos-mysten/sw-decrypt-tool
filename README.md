# Slush wallet recovery

Support tool for recovering **passphrase (mnemonic)** and **private-key (imported)** wallets from a dump of the Slush browser extension’s IndexedDB.

Everything runs **client-side in your browser**. Secrets are never uploaded and are never stored on Slush servers.

## What it recovers

- **Mnemonic accounts** — BIP39 recovery phrase, plus derived Sui addresses (from SignalDB metadata, or indexes 0–19 if metadata is missing).
- **Imported accounts** — `suiprivkey1…` private key and its address.
- **zkLogin** — reported only. There is no phrase or private key to recover.

Ledger and read-only accounts are not in the encrypted secret store.

## Produce a dump

1. Open the **Slush extension popup** (not `https://my.slush.app` or any other tab).
2. Right-click the popup → **Inspect** → **Console**.
3. In this tool, click **Copy DB dump script**, paste it into that console, and press Enter.
4. The script downloads `slush-idb-dump.json` and also `console.log`s the object.
5. Upload that file here.

The dump includes `keyval-store` (encrypted secrets + `base_password`) and SignalDB databases (account addresses / indexes).

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
