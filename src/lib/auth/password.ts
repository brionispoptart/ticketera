import { randomInt } from "crypto";
import { hash, compare } from "bcryptjs";
import { MIN_PASSWORD_LENGTH, validatePasswordStrength } from "@/lib/auth/password-policy";

const LOWERCASE_CHARACTERS = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT_CHARACTERS = "23456789";
const SYMBOL_CHARACTERS = "!@#$%^&*-_=+?";
const ALL_PASSWORD_CHARACTERS = `${LOWERCASE_CHARACTERS}${UPPERCASE_CHARACTERS}${DIGIT_CHARACTERS}${SYMBOL_CHARACTERS}`;

function randomCharacter(characters: string) {
  return characters[randomInt(0, characters.length)];
}

function shuffleCharacters(characters: string[]) {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    const current = characters[index];
    characters[index] = characters[swapIndex];
    characters[swapIndex] = current;
  }

  return characters;
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export function generateTemporaryPassword(length = 20) {
  const passwordLength = Math.max(length, MIN_PASSWORD_LENGTH);
  const characters = [
    randomCharacter(LOWERCASE_CHARACTERS),
    randomCharacter(UPPERCASE_CHARACTERS),
    randomCharacter(DIGIT_CHARACTERS),
    randomCharacter(SYMBOL_CHARACTERS),
  ];

  while (characters.length < passwordLength) {
    characters.push(randomCharacter(ALL_PASSWORD_CHARACTERS));
  }

  return shuffleCharacters(characters).join("");
}

export { validatePasswordStrength };
export { MIN_PASSWORD_LENGTH };
