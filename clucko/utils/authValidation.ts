/**
 * Authentication Validation & Security Utilities for Clucko
 * Standardized across Login & Signup screens.
 */

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: '8 or more characters', test: (pw) => pw.length >= 8 },
  { id: 'uppercase', label: 'At least 1 uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lowercase', label: 'At least 1 lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'At least 1 number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'At least 1 special character (@#$%!)', test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
];

export interface PasswordStrength {
  score: number; // 0 to 3
  label: 'Empty' | 'Weak' | 'Fair' | 'Strong';
  color: string;
  passedCount: number;
  totalCount: number;
  passedIds: string[];
}

/**
 * Calculates password strength based on the 5 core rules.
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: 'Empty',
      color: '#E0E0E0',
      passedCount: 0,
      totalCount: PASSWORD_RULES.length,
      passedIds: [],
    };
  }

  const passedIds = PASSWORD_RULES.filter((r) => r.test(password)).map((r) => r.id);
  const count = passedIds.length;

  if (count <= 2) {
    return {
      score: 1,
      label: 'Weak',
      color: '#E53935',
      passedCount: count,
      totalCount: PASSWORD_RULES.length,
      passedIds,
    };
  }

  if (count <= 4) {
    return {
      score: 2,
      label: 'Fair',
      color: '#FB8C00',
      passedCount: count,
      totalCount: PASSWORD_RULES.length,
      passedIds,
    };
  }

  return {
    score: 3,
    label: 'Strong',
    color: '#2E7D32',
    passedCount: count,
    totalCount: PASSWORD_RULES.length,
    passedIds,
  };
}

/**
 * Validates email format using standard RFC pattern.
 */
export function isValidEmail(email: string): boolean {
  if (!email || !email.trim()) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim().toLowerCase());
}

/**
 * Detects common typos in popular email domains and returns a suggested fix.
 * E.g., user@gmai.com -> user@gmail.com
 */
const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmai.co': 'gmail.com',
  'gmail.co': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'iclud.com': 'icloud.com',
  'icoud.com': 'icloud.com',
};

export function suggestEmailTypo(email: string): string | null {
  if (!email || !email.includes('@')) return null;
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return null;
  const [localPart, domain] = parts;
  if (COMMON_DOMAIN_TYPOS[domain]) {
    return `${localPart}@${COMMON_DOMAIN_TYPOS[domain]}`;
  }
  return null;
}

/**
 * Formats a phone number cleanly as typed.
 * Supports PH mobile numbers (e.g., 0917 123 4567 or +63 917 123 4567).
 */
export function formatPhoneNumber(input: string): string {
  if (!input) return '';
  // Strip all characters except digits and leading +
  const cleaned = input.replace(/[^\d+]/g, '');
  
  if (cleaned.startsWith('+63')) {
    const digits = cleaned.slice(3).replace(/\D/g, '');
    if (digits.length <= 3) return `+63 ${digits}`;
    if (digits.length <= 6) return `+63 ${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  }

  if (cleaned.startsWith('09')) {
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
  }

  return input;
}
