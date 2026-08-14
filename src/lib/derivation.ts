import { decrypt } from "@metamask/browser-passworder";
import { decodeSuiPrivateKey, mnemonicToSeed } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { fromBase64 } from "@mysten/sui/utils";
import { argon2id } from "@noble/hashes/argon2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

import { entropyToMnemonic } from "./bip39";

export function getDerivationPath(accountIndex: number) {
  return `m/44'/784'/${accountIndex}'/0'/0'`;
}

export function deriveMnemonicAddress(
  mnemonic: string,
  accountIndex: number
): string {
  return Ed25519Keypair.deriveKeypairFromSeed(
    mnemonicToSeed(mnemonic),
    getDerivationPath(accountIndex)
  ).toSuiAddress();
}

export function entropyB64ToMnemonic(b64entropy: string): string {
  return entropyToMnemonic(fromBase64(b64entropy));
}

export function fromExportedKeypair(exportedKey: string) {
  const { scheme, secretKey } = decodeSuiPrivateKey(exportedKey);
  switch (scheme) {
    case "ED25519":
      return Ed25519Keypair.fromSecretKey(secretKey);
    case "Secp256k1":
      return Secp256k1Keypair.fromSecretKey(secretKey);
    case "Secp256r1":
      return Secp256r1Keypair.fromSecretKey(secretKey);
    case "MultiSig":
    case "ZkLogin":
    case "Passkey":
      throw new Error(`Unsupported keypair scheme ${scheme}`);
    default: {
      const _exhaustive: never = scheme;
      throw new Error(`Unsupported keypair scheme ${_exhaustive}`);
    }
  }
}

export function importedKeyToAddress(exportedKey: string): string {
  return fromExportedKeypair(exportedKey).toSuiAddress();
}

const ARGON2_CONFIG = { t: 2, m: 19456, p: 1 };

export function verifyWalletPassword(
  password: string,
  storedHash: string
): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  return bytesToHex(argon2id(password, hexToBytes(saltHex), ARGON2_CONFIG)) ===
    hashHex;
}

export async function decryptSecret(
  password: string,
  ciphertext: string
): Promise<string> {
  const parsed = JSON.parse((await decrypt(password, ciphertext)) as string);
  return parsed.data as string;
}
