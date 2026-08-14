import { normalizeSuiAddress } from "@mysten/sui/utils";

import {
  decryptSecret,
  deriveMnemonicAddress,
  entropyB64ToMnemonic,
  fromExportedKeypair,
  verifyWalletPassword,
} from "./derivation";

const SECRET_KEY_RE = /^(mnemonic|imported|zkLogin)__(.+)$/;
const FALLBACK_MNEMONIC_INDEXES = 20;

export type RecoveredAccount = {
  type: "mnemonic" | "imported" | "zkLogin" | "unknown";
  handle: string;
  mnemonic?: string;
  privateKey?: string;
  addresses: {
    address: string;
    accountIndex?: number;
    matchedTarget: boolean;
  }[];
  unlockedWith: "obfuscation" | "password" | "none";
  error?: string;
};

export type RecoveryResult = {
  passwordMode: "none" | "password-required";
  passwordProvided: boolean;
  passwordValid?: boolean;
  hasBasePassword: boolean;
  accounts: RecoveredAccount[];
  warnings: string[];
};

type SecretType = "mnemonic" | "imported" | "zkLogin";
type UnlockMethod = "obfuscation" | "password";

type PasswordCandidate = {
  password: string;
  unlockedWith: UnlockMethod;
};

type SignalDbAccount = {
  id?: string;
  providerId?: string;
  type?: string;
  address?: string;
  metadata?: {
    accountIndex?: number;
    derivationPath?: string;
    localCredentialHandle?: string;
  };
};

type SignalDbProvider = {
  id?: string;
  type?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCiphertext(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) return JSON.stringify(value);
  throw new Error("Ciphertext is not a string");
}

function normalizeAddress(address: string): string {
  try {
    return normalizeSuiAddress(address).toLowerCase();
  } catch {
    return address.trim().toLowerCase();
  }
}

function buildTargetSet(targetAddresses: string[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const raw of targetAddresses ?? []) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    set.add(normalizeAddress(trimmed));
  }
  return set;
}

function matchesTarget(address: string, targets: Set<string>): boolean {
  if (targets.size === 0) return false;
  return targets.has(normalizeAddress(address));
}

function ingestKeyvalRows(
  rows: unknown,
  map: Map<string, unknown>
): boolean {
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    if (!isRecord(row) || row.key == null) continue;
    map.set(String(row.key), row.value);
  }
  return true;
}

function unwrapItems(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  const items: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const item = isRecord(row.value) ? row.value : row;
    items.push(item);
  }
  return items;
}

function parseSignalDbAccount(item: Record<string, unknown>): SignalDbAccount {
  const metadata = isRecord(item.metadata) ? item.metadata : undefined;
  return {
    id: typeof item.id === "string" ? item.id : undefined,
    providerId: typeof item.providerId === "string" ? item.providerId : undefined,
    type: typeof item.type === "string" ? item.type : undefined,
    address: typeof item.address === "string" ? item.address : undefined,
    metadata: metadata
      ? {
          accountIndex:
            typeof metadata.accountIndex === "number"
              ? metadata.accountIndex
              : undefined,
          derivationPath:
            typeof metadata.derivationPath === "string"
              ? metadata.derivationPath
              : undefined,
          localCredentialHandle:
            typeof metadata.localCredentialHandle === "string"
              ? metadata.localCredentialHandle
              : undefined,
        }
      : undefined,
  };
}

function findDatabase(
  databases: Record<string, unknown>,
  names: string[]
): Record<string, unknown> | undefined {
  for (const name of names) {
    if (isRecord(databases[name])) {
      return databases[name] as Record<string, unknown>;
    }
  }
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(databases)) {
    if (wanted.has(key.toLowerCase()) && isRecord(value)) return value;
  }
  return undefined;
}

function getStoreRows(
  db: Record<string, unknown> | undefined,
  storeName: string
): unknown {
  if (!db) return undefined;
  if (storeName in db) return db[storeName];
  const match = Object.keys(db).find(
    (key) => key.toLowerCase() === storeName.toLowerCase()
  );
  return match ? db[match] : undefined;
}

function extractDatabases(
  root: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (isRecord(root.databases)) return root.databases;
  if (
    isRecord(root["keyval-store"]) ||
    isRecord(root["signaldb-Accounts"]) ||
    isRecord(root["signaldb-accounts"])
  ) {
    return root;
  }
  return undefined;
}

async function tryDecrypt(
  ciphertext: string,
  candidates: PasswordCandidate[]
): Promise<
  | { data: string; unlockedWith: UnlockMethod }
  | { error: string; unlockedWith: "none" }
> {
  if (candidates.length === 0) {
    return {
      error: "No decryption password available",
      unlockedWith: "none",
    };
  }
  for (const candidate of candidates) {
    try {
      const data = await decryptSecret(candidate.password, ciphertext);
      return { data, unlockedWith: candidate.unlockedWith };
    } catch {
      // Try the next candidate; secrets may predate a later-set wallet password.
    }
  }
  return {
    error: "Failed to decrypt with the available passwords",
    unlockedWith: "none",
  };
}

function parseSecretKey(
  key: string
): { type: SecretType; handle: string } | null {
  const match = SECRET_KEY_RE.exec(key);
  if (!match) return null;
  return { type: match[1] as SecretType, handle: match[2] };
}

export async function recoverFromDump(input: {
  dumpJson: unknown;
  userPassword?: string;
  targetAddresses?: string[];
}): Promise<RecoveryResult> {
  const warnings: string[] = [];
  const userPassword = input.userPassword?.trim() || undefined;
  const passwordProvided = Boolean(userPassword);
  const targets = buildTargetSet(input.targetAddresses);

  let root: unknown = input.dumpJson;
  if (typeof root === "string") {
    try {
      root = JSON.parse(root);
    } catch {
      return {
        passwordMode: "none",
        passwordProvided,
        hasBasePassword: false,
        accounts: [],
        warnings: ["Dump JSON could not be parsed"],
      };
    }
  }

  if (!isRecord(root)) {
    return {
      passwordMode: "none",
      passwordProvided,
      hasBasePassword: false,
      accounts: [],
      warnings: ["Dump JSON is not an object"],
    };
  }

  const databases = extractDatabases(root);
  const keyval = new Map<string, unknown>();
  let hasKeyvalStore = false;

  const keyvalDb = databases
    ? findDatabase(databases, ["keyval-store"])
    : undefined;
  if (keyvalDb) {
    const keyvalRows = getStoreRows(keyvalDb, "keyval");
    if (keyvalRows !== undefined) {
      hasKeyvalStore = ingestKeyvalRows(keyvalRows, keyval);
    } else {
      for (const rows of Object.values(keyvalDb)) {
        if (ingestKeyvalRows(rows, keyval)) hasKeyvalStore = true;
      }
    }
  }

  if (!hasKeyvalStore && Array.isArray(root.keyval)) {
    hasKeyvalStore = ingestKeyvalRows(root.keyval, keyval);
  }

  if (!hasKeyvalStore) {
    warnings.push("No keyval-store found in dump");
  }

  const accountDb = databases
    ? findDatabase(databases, ["signaldb-Accounts", "signaldb-accounts"])
    : undefined;
  const providerDb = databases
    ? findDatabase(databases, ["signaldb-Providers", "signaldb-providers"])
    : undefined;

  const signaldbAccounts = unwrapItems(getStoreRows(accountDb, "items")).map(
    parseSignalDbAccount
  );
  const signaldbProviders: SignalDbProvider[] = unwrapItems(
    getStoreRows(providerDb, "items")
  ).map((item) => ({
    id: typeof item.id === "string" ? item.id : undefined,
    type: typeof item.type === "string" ? item.type : undefined,
  }));

  const basePasswordRaw = keyval.get("base_password");
  const basePassword =
    typeof basePasswordRaw === "string" && basePasswordRaw.length > 0
      ? basePasswordRaw
      : undefined;
  const hasBasePassword = Boolean(basePassword);

  const hasPasswordHash = keyval.has("password_hash");
  const passwordMode: RecoveryResult["passwordMode"] = hasPasswordHash
    ? "password-required"
    : "none";

  let passwordValid: boolean | undefined;
  let storedPasswordHash: string | undefined;
  if (hasPasswordHash && basePassword) {
    try {
      storedPasswordHash = await decryptSecret(
        basePassword,
        asCiphertext(keyval.get("password_hash"))
      );
    } catch {
      warnings.push(
        "Found password_hash but could not decrypt it with base_password"
      );
    }
  } else if (hasPasswordHash && !basePassword) {
    warnings.push(
      "Found password_hash but no base_password to unwrap it"
    );
  }

  if (userPassword && storedPasswordHash) {
    try {
      passwordValid = verifyWalletPassword(userPassword, storedPasswordHash);
    } catch {
      passwordValid = false;
    }
    if (!passwordValid) {
      warnings.push("Provided password did not match stored hash");
    }
  }

  if (passwordMode === "password-required" && !passwordProvided) {
    warnings.push("Password required but not provided");
  }

  if (!hasBasePassword && passwordMode === "none") {
    warnings.push("No base_password found in dump");
  }

  const candidates: PasswordCandidate[] = [];
  const seen = new Set<string>();
  const addCandidate = (
    password: string | undefined,
    unlockedWith: UnlockMethod
  ) => {
    if (!password || seen.has(password)) return;
    seen.add(password);
    candidates.push({ password, unlockedWith });
  };
  if (passwordMode === "password-required") {
    addCandidate(userPassword, "password");
    addCandidate(basePassword, "obfuscation");
  } else {
    addCandidate(basePassword, "obfuscation");
    addCandidate(userPassword, "password");
  }

  const secretEntries = [...keyval.entries()].flatMap(([key, value]) => {
    const parsed = parseSecretKey(key);
    return parsed ? [{ ...parsed, value }] : [];
  });

  if (hasKeyvalStore && secretEntries.length === 0) {
    warnings.push(
      "No secrets found — the store may have been reset/signed out"
    );
  }

  for (const provider of signaldbProviders) {
    if (
      (provider.type === "mnemonic" || provider.type === "imported") &&
      provider.id &&
      !secretEntries.some(
        (entry) => entry.handle === provider.id && entry.type === provider.type
      )
    ) {
      warnings.push(
        `signaldb provider ${provider.id} (${provider.type}) has no matching secret`
      );
    }
  }

  const accounts: RecoveredAccount[] = await Promise.all(
    secretEntries.map(async (entry): Promise<RecoveredAccount> => {
      try {
        return await recoverOneAccount(entry, {
          candidates,
          signaldbAccounts,
          targets,
          warnings,
        });
      } catch (err) {
        return {
          type: entry.type,
          handle: entry.handle,
          addresses: [],
          unlockedWith: "none",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  if (targets.size > 0) {
    const matched = new Set<string>();
    for (const account of accounts) {
      for (const row of account.addresses) {
        if (row.matchedTarget) matched.add(normalizeAddress(row.address));
      }
    }
    const unmatched = [...targets].filter((addr) => !matched.has(addr));
    if (unmatched.length > 0) {
      warnings.push(`Target address(es) not found: ${unmatched.join(", ")}`);
    }
  }

  return {
    passwordMode,
    passwordProvided,
    passwordValid,
    hasBasePassword,
    accounts,
    warnings,
  };
}

async function recoverOneAccount(
  entry: { type: SecretType; handle: string; value: unknown },
  ctx: {
    candidates: PasswordCandidate[];
    signaldbAccounts: SignalDbAccount[];
    targets: Set<string>;
    warnings: string[];
  }
): Promise<RecoveredAccount> {
  const { type, handle } = entry;

  if (type === "zkLogin") {
    return {
      type,
      handle,
      addresses: [],
      unlockedWith: "none",
    };
  }

  const decrypted = await tryDecrypt(asCiphertext(entry.value), ctx.candidates);
  if ("error" in decrypted) {
    return {
      type,
      handle,
      addresses: [],
      unlockedWith: "none",
      error: decrypted.error,
    };
  }

  if (type === "mnemonic") {
    const mnemonic = entropyB64ToMnemonic(decrypted.data);
    const metaAccounts = ctx.signaldbAccounts.filter(
      (account) =>
        account.providerId === handle && account.type === "mnemonic"
    );

    const addresses: RecoveredAccount["addresses"] = [];
    if (metaAccounts.length > 0) {
      for (const account of metaAccounts) {
        const accountIndex = account.metadata?.accountIndex ?? 0;
        try {
          const address = deriveMnemonicAddress(mnemonic, accountIndex);
          if (
            account.address &&
            normalizeAddress(account.address) !== normalizeAddress(address)
          ) {
            ctx.warnings.push(
              `Address mismatch for ${handle} index ${accountIndex}: derived ${address} vs stored ${account.address}`
            );
          }
          addresses.push({
            address,
            accountIndex,
            matchedTarget: matchesTarget(address, ctx.targets),
          });
        } catch (err) {
          ctx.warnings.push(
            `Failed to derive mnemonic address for ${handle} index ${accountIndex}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    } else {
      ctx.warnings.push(
        `No signaldb-Accounts metadata for mnemonic ${handle}; derived indices 0–19`
      );
      for (let accountIndex = 0; accountIndex < FALLBACK_MNEMONIC_INDEXES; accountIndex++) {
        const address = deriveMnemonicAddress(mnemonic, accountIndex);
        addresses.push({
          address,
          accountIndex,
          matchedTarget: matchesTarget(address, ctx.targets),
        });
      }
    }

    return {
      type,
      handle,
      mnemonic,
      addresses,
      unlockedWith: decrypted.unlockedWith,
    };
  }

  const keypair = fromExportedKeypair(decrypted.data);
  const privateKey = keypair.getSecretKey();
  const address = keypair.toSuiAddress();
  const stored = ctx.signaldbAccounts.find(
    (account) =>
      account.providerId === handle && account.type === "imported"
  );
  if (
    stored?.address &&
    normalizeAddress(stored.address) !== normalizeAddress(address)
  ) {
    ctx.warnings.push(
      `Address mismatch for imported ${handle}: derived ${address} vs stored ${stored.address}`
    );
  }

  return {
    type,
    handle,
    privateKey,
    addresses: [
      {
        address,
        matchedTarget: matchesTarget(address, ctx.targets),
      },
    ],
    unlockedWith: decrypted.unlockedWith,
  };
}
