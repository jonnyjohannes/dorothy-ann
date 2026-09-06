import { randomBytes } from "node:crypto";
console.log(`SESSION_SIGNING_KEYS=${randomBytes(32).toString("base64url")}`);
console.log(`LIMITER_KEY_SECRET=${randomBytes(32).toString("base64url")}`);
