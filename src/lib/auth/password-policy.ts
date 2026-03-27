const UPPERCASE_PATTERN = /[A-Z]/;
const LOWERCASE_PATTERN = /[a-z]/;
const DIGIT_PATTERN = /\d/;
const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_REQUIREMENTS_TEXT = `Use at least ${MIN_PASSWORD_LENGTH} characters with uppercase, lowercase, a number, and a symbol.`;

export function validatePasswordStrength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (!UPPERCASE_PATTERN.test(password)) {
    return "Password must include at least one uppercase letter.";
  }

  if (!LOWERCASE_PATTERN.test(password)) {
    return "Password must include at least one lowercase letter.";
  }

  if (!DIGIT_PATTERN.test(password)) {
    return "Password must include at least one number.";
  }

  if (!SYMBOL_PATTERN.test(password)) {
    return "Password must include at least one symbol.";
  }

  return null;
}