// src/utils/validation.ts

export const validateEmail = (v: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const validatePassword = (v: string): string | null => {
  if (v.length < 8) return 'Must be at least 8 characters';
  if (!/[A-Z]/.test(v)) return 'Must include an uppercase letter';
  if (!/[a-z]/.test(v)) return 'Must include a lowercase letter';
  if (!/[0-9]/.test(v)) return 'Must include a number';
  if (!/[^A-Za-z0-9]/.test(v)) return 'Must include a special character';
  return null;
};

export const validateDob = (d: string, m: string, y: string): string | null => {
  const day = parseInt(d, 10);
  const mon = parseInt(m, 10);
  const yr = parseInt(y, 10);
  if (!day || !mon || !yr) return 'Enter a valid date';
  if (mon < 1 || mon > 12) return 'Month must be 1–12';
  if (day < 1 || day > 31) return 'Day must be 1–31';
  if (yr < 1900 || yr > new Date().getFullYear()) return 'Enter a valid year';
  if (new Date().getFullYear() - yr < 16) return 'You must be at least 16';
  return null;
};

export const validatePhone = (v: string): string | null => {
  if (!v.trim()) return 'Phone number is required';
  const digitsOnly = v.replace(/[\s\-()+ ]/g, '');
  if (digitsOnly.length < 10) return 'Phone number must be at least 10 digits';
  if (!/^\+?[\d\s\-()]{10,}$/.test(v.trim())) return 'Enter a valid phone number';
  return null;
};

export const validateRequired = (v: string, fieldName: string): string | null => {
  if (!v.trim()) return `${fieldName} is required`;
  return null;
};

export interface PasswordRule {
  key: string;
  label: string;
  test: (v: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: 'At least 8 characters', test: v => v.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: v => /[A-Z]/.test(v) },
  { key: 'lowercase', label: 'One lowercase letter', test: v => /[a-z]/.test(v) },
  { key: 'number', label: 'One number', test: v => /[0-9]/.test(v) },
  { key: 'special', label: 'One special character', test: v => /[^A-Za-z0-9]/.test(v) },
];

export const getPasswordStrength = (password: string) => {
  const metCount = PASSWORD_RULES.filter(rule => rule.test(password)).length;
  const strong = metCount === PASSWORD_RULES.length;
  const medium = !strong && password.length >= 8 && metCount >= 3;
  const width = strong ? '100%' : medium ? '66%' : password.length >= 4 ? '33%' : '10%';
  const color = strong ? '#34C759' : medium ? '#FF9500' : '#FF3B30';
  const label = strong ? 'Strong' : medium ? 'Medium' : 'Weak';
  return { width, color, label };
};
