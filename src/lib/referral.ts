const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // excludes 0/O/1/I/L

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}
