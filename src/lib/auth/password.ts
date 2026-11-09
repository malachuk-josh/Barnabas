import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing and the password policy. Hashes use Node's scrypt with a random 16-byte salt per
 * password; verification compares in constant time. Plain passwords are never stored, logged or returned.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

export type PasswordHash = { alg: "scrypt"; N: number; r: number; p: number; salt: string; hash: string };

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return { alg: "scrypt", ...PARAMS, salt: salt.toString("base64"), hash: key.toString("base64") };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  if (stored.alg !== "scrypt") return false;
  const expected = Buffer.from(stored.hash, "base64");
  const key = await scrypt(password, Buffer.from(stored.salt, "base64"), expected.length || KEY_LENGTH, { N: stored.N, r: stored.r, p: stored.p });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spends about the same time as a real check, so a missing account answers no faster than a wrong password. */
const DUMMY_SALT = randomBytes(16);
export async function burnPasswordCheck(password: string) {
  await scrypt(password, DUMMY_SALT, KEY_LENGTH, PARAMS);
}

/** Common passwords (and their usual shapes) that are refused outright. Compared lowercased. */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  `123456 123456789 12345678 1234567890 12345 1234567 password password1 password12 password123 password1234 qwerty qwerty123
qwertyuiop qwerty1234 qwertyui 111111 1111111111 000000 0000000000 123123 123123123 1234512345 abc123 abc12345 abcd1234
abcdefghij iloveyou iloveyou1 iloveyou123 admin admin123 administrator letmein letmein123 welcome welcome1 welcome123
welcome2024 welcome2025 welcome2026 monkey monkey123 dragon dragon123 football football1 baseball baseball1 basketball
soccer hockey sunshine sunshine1 princess princess1 master master123 shadow shadow123 superman batman trustno1 starwars
michael jennifer jordan23 michelle charlie charlie123 jessica ashley hunter2 hunter123 passw0rd p@ssw0rd p@ssword
pa55word pa$$word passwordpassword changeme changeme123 secret secret123 freedom whatever nothing qazwsx qazwsxedc
1qaz2wsx 1q2w3e4r 1q2w3e4r5t zaq12wsx zxcvbnm zxcvbnm123 asdfghjkl asdfasdf asdf1234 computer internet google
samsung apple123 iphone microsoft summer summer2024 summer2025 summer2026 winter2024 winter2025 winter2026 spring2025
spring2026 autumn2025 fall2025 1234qwer qwer1234 987654321 9876543210 0987654321 147258369 159753 159357 789456123
123321 654321 666666 777777 888888 999999 121212 112233 123654 password! password1! password123! letmein! jesus
jesus1 jesus123 jesuschrist jesusislord jesuslovesme jesussaves godisgood godislove godisgreat godbless godblessyou
blessed blessed1 blessed123 blessing faithful faith123 hallelujah amazinggrace praisethelord praisegod christ123
christian christian1 heaven123 heavenly angel123 angels prayer prayer123 psalm23 john316 john3:16 church church123
ministry pastor pastor123 worship worship123 gospel savior salvation trinity grace123 shalom bible123 holyspirit
lordjesus thankyou thankyou1 football123 baseball123 mustang mustang1 ferrari harley corvette yankees cowboys
lakers chelsea liverpool arsenal pokemon minecraft fortnite roblox naruto matrix killer pepper ginger cookie
chocolate butterfly flower rainbow purple orange banana cheese hello123 helloworld lovely loveme family family123
mother father america america1 newyork london paris canada texas florida 1qazxsw2 abcdef abcdefg abcdefgh
`
    .split(/\s+/)
    .filter(Boolean),
);

export type PolicyResult = { ok: true } | { ok: false; error: string };

/** The password policy. Messages are meant to be read by the person choosing the password. */
export function checkPassword(password: string, email: string): PolicyResult {
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Choose a password with at least ${PASSWORD_MIN} characters. A short phrase you'll remember works well.` };
  }
  if (password.length > PASSWORD_MAX) return { ok: false, error: `That's a little long. Keep it to ${PASSWORD_MAX} characters or fewer.` };
  const lower = password.toLowerCase();
  if (/^(.)\1*$/su.test(password)) return { ok: false, error: "A password that repeats one character is easy to guess. Try a short phrase instead." };
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(lower.replace(/[\d!@#$%^&*.?]+$/, ""))) {
    return { ok: false, error: "That password is one of the most common ones, so it's easy to guess. Try a phrase that's personal to you." };
  }
  const local = email.split("@")[0]?.trim().toLowerCase() ?? "";
  if (local.length >= 3 && lower.includes(local)) {
    return { ok: false, error: "Leave your email name out of your password; it's the first thing someone would try." };
  }
  return { ok: true };
}

// No look-alike characters (0/O, 1/l/I), so a temporary password read aloud or copied by hand still works.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A strong one-time password for the owner to hand over: four groups of four, about 90 bits. */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let part = "";
    for (let i = 0; i < 4; i++) part += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    groups.push(part);
  }
  return groups.join("-");
}
