// A sign-in here is deliberately small: a name and a code, no passwords, no
// email, no provider. The code is the shared secret that opens the same
// projects on every device, so it has to be unambiguous when typed by hand.
export const CODE_MIN = 4;
export const CODE_MAX = 32;
export const NAME_MAX = 40;

export class SessionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function cleanName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new SessionError("Enter a name.");
  if (name.length > NAME_MAX) throw new SessionError(`Names are up to ${NAME_MAX} characters.`);
  return name;
}

export function cleanCode(raw) {
  // Typed by hand on a phone: fold case and spaces so "daisy 42" and "DAISY-42"
  // are the same code rather than two half-empty accounts.
  const code = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  if (!code) throw new SessionError("Enter your code.");
  if (code.length < CODE_MIN) throw new SessionError(`Codes are at least ${CODE_MIN} characters.`);
  if (code.length > CODE_MAX) throw new SessionError(`Codes are up to ${CODE_MAX} characters.`);
  if (!/^[A-Z0-9-]+$/.test(code)) throw new SessionError("Codes use letters, numbers and dashes only.");
  if (code.startsWith("-") || code.endsWith("-")) throw new SessionError("A code cannot start or end with a dash.");
  return code;
}

export function sameName(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}
