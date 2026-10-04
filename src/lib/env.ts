export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. See .env.example`);
  return v;
}
export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";
