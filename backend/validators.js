// Small input validators for auth routes.

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt ignores everything after 72 bytes

// Deliberately simple: one "@", no spaces, a dot in the domain, and no
// characters that could be used to inject markup.
const EMAIL_RE = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= EMAIL_MAX && EMAIL_RE.test(value);
}

function isValidPassword(value) {
  return (
    typeof value === 'string' &&
    value.length >= PASSWORD_MIN &&
    Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX
  );
}

module.exports = { normalizeEmail, isValidEmail, isValidPassword, EMAIL_MAX, PASSWORD_MIN, PASSWORD_MAX };
