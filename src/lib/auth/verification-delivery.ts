export type VerificationDelivery = 'email' | 'emulator' | 'failed';

const emulatorInstructions =
  'The Firebase Auth Emulator does not send email. Retrieve this account’s VERIFY_EMAIL link from the Auth Emulator terminal, or inspect the local OOB codes at http://127.0.0.1:9099/emulator/v1/projects/demo-casaio-rules/oobCodes. Open the matching oobLink in your browser, then return here to sign in.';

export function getVerificationDeliveryMessage(delivery: VerificationDelivery): string {
  if (delivery === 'emulator') return emulatorInstructions;
  if (delivery === 'failed') return 'We could not create a verification link. Please try again shortly.';
  return 'A verification email has been sent. Check your inbox and spam folder.';
}

export function getVerificationPendingInstructions(emulatorMode: boolean): string {
  return emulatorMode
    ? emulatorInstructions
    : 'Open the verification email before signing in. If you need another link, we can send one to this account.';
}

export function getVerificationActionLabel(emulatorMode: boolean): string {
  return emulatorMode ? 'Create another verification link' : 'Resend verification email';
}
