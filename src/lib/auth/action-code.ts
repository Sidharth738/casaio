export function getActionErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
    return 'This link has expired, is invalid, or has already been used. Request a new link to continue.';
  }
  if (code === 'auth/weak-password') {
    return 'Choose a stronger password with at least 6 characters.';
  }
  if (code === 'auth/network-request-failed') {
    return 'We could not reach Casaio securely. Check your connection and try again.';
  }
  return 'We could not complete this request. Request a new email link and try again.';
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 6) return 'Your password must be at least 6 characters long.';
  if (password !== confirmation) return 'Your passwords do not match.';
  return null;
}
