import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { encrypt } from "@metamask/browser-passworder";
import { mnemonicToSeed } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { toBase64 } from "@mysten/sui/utils";
import { argon2id } from "@noble/hashes/argon2";
import { bytesToHex, randomBytes } from "@noble/hashes/utils";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const ARGON2_CONFIG = { t: 2, m: 19456, p: 1 };
const MNEMONIC_COUNT = 2;

function getDerivationPath(accountIndex) {
  return `m/44'/784'/${accountIndex}'/0'/0'`;
}

function deriveMnemonicAddress(mnemonic, accountIndex) {
  return Ed25519Keypair.deriveKeypairFromSeed(
    mnemonicToSeed(mnemonic),
    getDerivationPath(accountIndex)
  ).toSuiAddress();
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = argon2id(password, salt, ARGON2_CONFIG);
  return `${bytesToHex(salt)}:${bytesToHex(hash)}`;
}

function wrap(value) {
  return JSON.stringify({ data: value });
}

function parseArgs(argv) {
  let userPassword;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--with-password") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(
          "Usage: node scripts/generate-fixture.mjs [--with-password <pw>]"
        );
        process.exit(1);
      }
      userPassword = next;
    }
  }
  return { userPassword };
}

const { userPassword } = parseArgs(process.argv.slice(2));
const secretPassword = userPassword ?? null;
const basePassword = bytesToHex(randomBytes(64));
const encryptWith = secretPassword ?? basePassword;

const keyval = [];
const accountItems = [];
const providerItems = [];
const printed = [];

keyval.push({ key: "base_password", value: basePassword });

if (secretPassword) {
  const passwordHash = hashPassword(secretPassword);
  keyval.push({
    key: "password_hash",
    value: await encrypt(basePassword, wrap(passwordHash)),
  });
}

for (let n = 0; n < MNEMONIC_COUNT; n++) {
  const mnemonic = bip39.generateMnemonic(wordlist);
  const handle = randomUUID();
  const b64entropy = toBase64(bip39.mnemonicToEntropy(mnemonic, wordlist));
  const indexes = n === 0 ? [0, 1] : [0];

  keyval.push({
    key: `mnemonic__${handle}`,
    value: await encrypt(encryptWith, wrap(b64entropy)),
  });
  providerItems.push({
    key: handle,
    value: { id: handle, type: "mnemonic" },
  });

  const addresses = [];
  for (const accountIndex of indexes) {
    const keypair = Ed25519Keypair.deriveKeypairFromSeed(
      mnemonicToSeed(mnemonic),
      getDerivationPath(accountIndex)
    );
    const address = keypair.toSuiAddress();
    const id = randomUUID();
    accountItems.push({
      key: id,
      value: {
        id,
        providerId: handle,
        type: "mnemonic",
        address,
        publicKey: keypair.getPublicKey().toSuiPublicKey(),
        createdAt: new Date().toISOString(),
        metadata: { accountIndex },
      },
    });
    addresses.push({ accountIndex, address });
  }

  printed.push({
    kind: "mnemonic",
    handle,
    mnemonic,
    addresses,
  });
}

{
  const keypair = Ed25519Keypair.generate();
  const handle = randomUUID();
  const exported = keypair.getSecretKey();
  const address = keypair.toSuiAddress();
  const id = randomUUID();

  keyval.push({
    key: `imported__${handle}`,
    value: await encrypt(encryptWith, wrap(exported)),
  });
  providerItems.push({
    key: handle,
    value: { id: handle, type: "imported" },
  });
  accountItems.push({
    key: id,
    value: {
      id,
      providerId: handle,
      type: "imported",
      address,
      publicKey: keypair.getPublicKey().toSuiPublicKey(),
      createdAt: new Date().toISOString(),
      metadata: {},
    },
  });

  printed.push({
    kind: "imported",
    handle,
    privateKey: exported,
    address,
  });
}

const dump = {
  dumpedAt: new Date().toISOString(),
  origin: "https://fixture.local",
  databases: {
    "keyval-store": { keyval },
    "signaldb-Accounts": { items: accountItems },
    "signaldb-Providers": { items: providerItems },
  },
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, ".recovery-verify", "fixture.dump.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(dump, null, 2));

console.log(`Wrote ${outPath}`);
console.log(
  `Password mode: ${secretPassword ? "password-required" : "none"}`
);
if (secretPassword) {
  console.log(`Wallet password: ${secretPassword}`);
}
console.log(`base_password: ${basePassword}`);
console.log("");

for (const item of printed) {
  if (item.kind === "mnemonic") {
    console.log(`Mnemonic ${item.handle}`);
    console.log(`  phrase: ${item.mnemonic}`);
    for (const row of item.addresses) {
      const expected = deriveMnemonicAddress(item.mnemonic, row.accountIndex);
      console.log(`  address[${row.accountIndex}]: ${row.address}`);
      if (expected !== row.address) {
        console.error(`  MISMATCH vs deriveMnemonicAddress: ${expected}`);
        process.exitCode = 1;
      }
    }
  } else {
    console.log(`Imported ${item.handle}`);
    console.log(`  privateKey: ${item.privateKey}`);
    console.log(`  address: ${item.address}`);
  }
  console.log("");
}
