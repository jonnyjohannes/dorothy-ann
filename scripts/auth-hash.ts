import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomBytes, scrypt } from "node:crypto";

const readline = createInterface({ input, output });
const passphrase = await readline.question("Passphrase: ");
const confirm = await readline.question("Confirm passphrase: ");
readline.close();
if (!passphrase || passphrase !== confirm) throw new Error("passphrases did not match");
const salt = randomBytes(16).toString("base64url");
const derived = await new Promise<Buffer>((resolve, reject) => scrypt(passphrase, salt, 32, (error, key) => error ? reject(error) : resolve(key as Buffer)));
console.log(`scrypt$v1$N=16384,r=8,p=1$${salt}$${derived.toString("base64url")}`);
