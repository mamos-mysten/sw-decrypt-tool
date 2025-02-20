import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { hexToBytes } from "@noble/hashes/utils";

export async function generateMnemonic() {
  const mnemonic = bip39.generateMnemonic(wordlist);
  const keypair = await Ed25519Keypair.deriveKeypair(mnemonic);
  return { mnemonic, keypair };
}

/**
 * Converts mnemonic to entropy (byte array) using the english wordlist.
 *
 * @param mnemonic 12-24 words
 *
 * @return the entropy of the mnemonic (Uint8Array)
 */
export function mnemonicToEntropy(mnemonic: string): Uint8Array {
  return bip39.mnemonicToEntropy(mnemonic, wordlist);
}

/**
 * Converts entropy (byte array) to mnemonic using the english wordlist.
 *
 * @param entropy Uint8Array
 *
 * @return the mnemonic as string
 */
export function entropyToMnemonic(entropy: Uint8Array): string {
  return bip39.entropyToMnemonic(entropy, wordlist);
}

/**
 * Validate a mnemonic string in the BIP39 English wordlist.
 *
 * @param mnemonics a words string split by spaces of length 12/15/18/21/24.
 *
 * @returns true if the mnemonic is valid, false otherwise.
 */
export function validateMnemonics(mnemonics: string): boolean {
  return bip39.validateMnemonic(mnemonics, wordlist);
}

/**
 * Sanitize the mnemonics string provided by user.
 *
 * @param mnemonics a 12-word string split by spaces that may contain mixed cases
 * and extra spaces.
 *
 * @returns a sanitized mnemonics string.
 */
export function normalizeMnemonics(mnemonics: string): string {
  return mnemonics
    .trim()
    .split(/\s+/)
    .map((part) => part.toLowerCase())
    .join(" ");
}

export function mnemonicSeedHexToPhrase(mnemonicSeedHex: string): string {
  const entropyBytes = hexToBytes(mnemonicSeedHex);
  return entropyToMnemonic(entropyBytes);
}
