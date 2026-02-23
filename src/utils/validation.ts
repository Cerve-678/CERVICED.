// src/utils/validation.ts

export const validateEmail = (v: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const validatePassword = (v: string): string | null => {
  if (v.length < 8) return 'Must be at least 8 characters';
  if (!/[A-Z]/.test(v)) return 'Must include an uppercase letter';
  if (!/[0-9]/.test(v)) return 'Must include a number';
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

export const getPasswordStrength = (password: string) => {
  const strong = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
  const medium = password.length >= 8;
  const width = strong ? '100%' : medium ? '66%' : password.length >= 4 ? '33%' : '10%';
  const color = strong ? '#34C759' : medium ? '#FF9500' : '#FF3B30';
  const label = strong ? 'Strong' : medium ? 'Medium' : 'Weak';
  return { width, color, label };
};
