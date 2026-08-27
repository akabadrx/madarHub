// Kept apart from password.ts, which imports node:crypto and therefore cannot
// be pulled into a client component. The signup form needs this value for its
// minLength attribute, so it lives in a module both sides can import.
export const MIN_PASSWORD_LENGTH = 10;
