import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { rolePasswords } from "../db/schema";
import type { Role } from "./auth";

const encoder = new TextEncoder();
const envKeys: Record<Role, string> = {
  supervisor: "SUPERVISOR_PASSWORD",
  engenheiro: "ENGENHEIRO_PASSWORD",
  eletrica: "ELETRICA_PASSWORD",
  hidraulica: "HIDRAULICA_PASSWORD",
  refrigeracao: "REFRIGERACAO_PASSWORD",
  civil: "CIVIL_PASSWORD",
};

const toHex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => Uint8Array.from(value.match(/.{1,2}/g) || [], (part) => Number.parseInt(part, 16));
function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0; for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}
async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 }, key, 256));
}

export async function verifyRolePassword(role: Role, password: string) {
  const [saved] = await getDb().select().from(rolePasswords).where(eq(rolePasswords.role, role)).limit(1);
  if (saved) return sameBytes(await derive(password, fromHex(saved.salt)), fromHex(saved.passwordHash));
  const initial = String((env as unknown as Record<string, unknown>)[envKeys[role]] || "");
  return Boolean(initial) && sameBytes(encoder.encode(password), encoder.encode(initial));
}

export async function saveRolePassword(role: Role, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const values = { role, salt: toHex(salt), passwordHash: toHex(await derive(password, salt)), updatedAt: new Date() };
  await getDb().insert(rolePasswords).values(values).onConflictDoUpdate({ target: rolePasswords.role, set: { salt: values.salt, passwordHash: values.passwordHash, updatedAt: values.updatedAt } });
}
