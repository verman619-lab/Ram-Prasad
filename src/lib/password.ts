import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Lightweight demo password policy for seeded users. */
export function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 6) return "Password must be at least 6 characters";
  return null;
}
