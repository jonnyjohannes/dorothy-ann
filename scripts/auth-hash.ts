import { randomBytes, scrypt } from "node:crypto";
import { stdin, stdout } from "node:process";

function hiddenQuestion(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    const terminal = stdin.isTTY && typeof stdin.setRawMode === "function";
    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (terminal) stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    stdout.write(prompt);
    if (terminal) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

const passphrase = await hiddenQuestion("Passphrase: ");
const confirm = await hiddenQuestion("Confirm passphrase: ");
if (!passphrase || passphrase !== confirm) throw new Error("passphrases did not match");
const salt = randomBytes(16).toString("base64url");
const derived = await new Promise<Buffer>((resolve, reject) => scrypt(passphrase, salt, 32, (error, key) => error ? reject(error) : resolve(key as Buffer)));
console.log(`scrypt$v1$N=16384,r=8,p=1$${salt}$${derived.toString("base64url")}`);
