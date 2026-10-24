// Address checks for ToyChain/TOYPAY addresses (Ethereum-compatible, EIP-55 checksum).
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export type ChecksumState = "invalid" | "lowercase" | "valid" | "wrong";

export function toChecksum(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function checksumState(address: string): ChecksumState {
  const a = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return "invalid";
  const body = a.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return "lowercase";
  return toChecksum(a) === a ? "valid" : "wrong";
}

export interface CompareResult {
  same: boolean;
  diffs: boolean[]; // per hex char of the 40-char body
  poisoning: boolean; // same start and end, different middle: classic address-poisoning trick
  prefixMatch: number;
  suffixMatch: number;
}

export function compareAddresses(a: string, b: string): CompareResult | null {
  const x = a.trim().toLowerCase().replace(/^0x/, "");
  const y = b.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(x) || !/^[0-9a-f]{40}$/.test(y)) return null;
  const diffs = [...x].map((c, i) => c !== y[i]);
  let prefixMatch = 0;
  while (prefixMatch < 40 && x[prefixMatch] === y[prefixMatch]) prefixMatch++;
  let suffixMatch = 0;
  while (suffixMatch < 40 && x[39 - suffixMatch] === y[39 - suffixMatch]) suffixMatch++;
  const same = x === y;
  return { same, diffs, poisoning: !same && prefixMatch >= 3 && suffixMatch >= 3, prefixMatch, suffixMatch };
}
