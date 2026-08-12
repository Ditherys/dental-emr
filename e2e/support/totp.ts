import { createHmac } from "node:crypto";

function decodeBase32(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.toUpperCase().replace(/[=\s-]/g, "");
  let bits = "";

  for (const character of normalized) {
    const value = alphabet.indexOf(character);

    if (value < 0) {
      throw new Error("E2E_OWNER_TOTP_SECRET is not valid base32.");
    }

    bits += value.toString(2).padStart(5, "0");
  }

  const bytes = [];

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

export function currentTotp(secret: string, now = Date.now()) {
  const counter = BigInt(Math.floor(now / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);

  const digest = createHmac("sha1", decodeBase32(secret))
    .update(message)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 1_000_000).toString().padStart(6, "0");
}
