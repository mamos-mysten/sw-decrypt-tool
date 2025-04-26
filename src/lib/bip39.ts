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
  if (!mnemonicSeedHex || mnemonicSeedHex.length === 0) {
    console.warn("Empty or invalid mnemonicSeedHex provided");
    return "Invalid or empty seed";
  }

  try {
    // Clean up the hex string - remove 0x prefix and whitespace
    const cleanHex = mnemonicSeedHex.replace(/^0x/, "").trim();

    // Make sure we have even length for hex string (add leading zero if needed)
    const paddedHex = cleanHex.length % 2 === 0 ? cleanHex : "0" + cleanHex;

    console.log("Processing hex:", {
      original: mnemonicSeedHex,
      cleaned: cleanHex,
      padded: paddedHex,
      length: paddedHex.length,
    });

    const entropyBytes = hexToBytes(paddedHex);

    // Check if we have a valid length for BIP39
    if (
      entropyBytes.length !== 16 &&
      entropyBytes.length !== 20 &&
      entropyBytes.length !== 24 &&
      entropyBytes.length !== 28 &&
      entropyBytes.length !== 32
    ) {
      console.warn(`Invalid entropy length: ${entropyBytes.length} bytes`);

      // If we have a non-standard length but greater than minimum, truncate to nearest valid length
      if (entropyBytes.length > 16) {
        let validLength = 16;
        if (entropyBytes.length > 32) {
          validLength = 32;
        } else if (entropyBytes.length > 28) {
          validLength = 28;
        } else if (entropyBytes.length > 24) {
          validLength = 24;
        } else if (entropyBytes.length > 20) {
          validLength = 20;
        } else if (entropyBytes.length > 16) {
          validLength = 16;
        }

        console.log(`Truncating to ${validLength} bytes`);
        const truncatedBytes = entropyBytes.slice(0, validLength);
        return entropyToMnemonic(truncatedBytes);
      }

      return "Invalid entropy length";
    }

    return entropyToMnemonic(entropyBytes);
  } catch (error) {
    console.error("Error converting hex to mnemonic:", error);
    return "Error decrypting seed phrase";
  }
}
