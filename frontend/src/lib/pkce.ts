import * as Crypto from "expo-crypto";

// PKCE (RFC 7636, S256). The verifier is a high-entropy random string from the
// unreserved set; the challenge is base64url(sha256(verifier)) with padding
// stripped — exactly what the backend recomputes to verify the exchange.
const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const bytes = Crypto.getRandomBytes(64);
  let verifier = "";
  for (let i = 0; i < bytes.length; i++) {
    verifier += UNRESERVED[bytes[i] % UNRESERVED.length];
  }
  const b64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verifier, challenge: toBase64Url(b64) };
}
