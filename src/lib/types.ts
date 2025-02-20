export type LegacyAccountSourceType = "mnemonic" | "qredo";
export type LegacyAccountType =
  | "mnemonic-derived"
  | "imported"
  | "ledger"
  | "qredo"
  | "zkLogin";
export type LegacyZkLoginProvider = "google" | "twitch" | "facebook" | "kakao";

export const LEGACY_ACCOUNT_TYPE_TO_ACCOUNT_TYPE: Record<
  LegacyAccountType,
  "mnemonic" | "imported" | "zkLogin"
> = {
  "mnemonic-derived": "mnemonic",
  imported: "imported",
  zkLogin: "zkLogin",
  ledger: "imported",
  qredo: "imported",
};

export type DecryptedData = {
  entropyHex: string;
  mnemonicSeedHex: string;
  keyPair: string;
};

export type LegacyAccountSource = {
  id: string; // uuid-v4
  type: LegacyAccountSourceType;
  encryptedData: string;
  createdAt: number;
};

export interface LegacyAccountBase {
  id: string; // uuid-v4
  type: LegacyAccountType;
  address: string;
  createdAt: number;
  lastUnlockedOn?: number | null;
  nickname?: string | null;
  publicKey?: string | null;
  selected: boolean;
}

export interface LegacyMnemonicAccount extends LegacyAccountBase {
  type: "mnemonic-derived";
  encryptedData: string;
  derivationPath: string;
  sourceID: string; // uuid-v4
  sourceHash: string;
}

export interface LegacyImportedAccount extends LegacyAccountBase {
  type: "imported";
  encrypted: string;
}

export interface LegacyLedgerAccount extends LegacyAccountBase {
  type: "ledger";
  encrypted: string;
  derivationPath: string;
}

export interface LegacyZkLoginAccount extends LegacyAccountBase {
  type: "zkLogin";
  addressSeed: string;
  claimName?: string;
  claims: string;
  provider: LegacyZkLoginProvider;
  salt: string;
  warningAcknowledged: boolean;
}

export type LegacyAccount =
  | LegacyMnemonicAccount
  | LegacyImportedAccount
  | LegacyZkLoginAccount
  | LegacyLedgerAccount;

export type Claims = {
  aud: string;
  email: string;
  firstName: string;
  fullName: string;
  lastName: string;
  picture: string;
  sub: string;
  iss: string;
};

export type LegacySetting = {
  setting: string;
  value: boolean | number | null | string;
};
