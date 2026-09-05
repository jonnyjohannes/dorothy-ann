export interface AuthSession { subject: "owner"; method: "passphrase"; expiresAt: string; absoluteExpiresAt: string }
export interface LoginAttemptLimiter { consume(key: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }>; reset(key: string): Promise<void> }
