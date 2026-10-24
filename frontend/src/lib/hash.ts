// Download check: hashes a file locally with WebCrypto. The file never leaves the device.

export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Accepts "abc…", "sha256:abc…" or a line from SHA256SUMS ("abc…  file.zip"). */
export function normalizeHash(input: string): string {
  const m = input.trim().toLowerCase().match(/[0-9a-f]{64}/);
  return m ? m[0] : "";
}
