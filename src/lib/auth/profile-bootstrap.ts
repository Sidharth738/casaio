export type ProfileFailureCategory =
  | 'permission-denied'
  | 'unavailable'
  | 'unauthenticated'
  | 'deadline-exceeded'
  | 'not-found'
  | 'email-not-verified'
  | 'profile-missing'
  | 'profile-failed'
  | 'session-failed'
  | 'unknown';

const FIRESTORE_CATEGORIES = new Set([
  'permission-denied',
  'unavailable',
  'unauthenticated',
  'deadline-exceeded',
  'not-found',
]);

export function getProfileFailureCategory(
  error: unknown,
  fallback: ProfileFailureCategory = 'unknown',
): ProfileFailureCategory {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return fallback;
  const normalized = code.toLowerCase().split('/').at(-1);
  if (normalized && FIRESTORE_CATEGORIES.has(normalized)) return normalized as ProfileFailureCategory;
  if (normalized === 'email-not-verified') return 'email-not-verified';
  if (normalized === 'profile-missing' || normalized === 'profile-initialization-failed') return 'profile-missing';
  if (normalized === 'session-creation-failed') return 'session-failed';
  return fallback;
}

export function createProfileBootstrapLoader<TUser extends { uid: string }, TProfile>(
  establishServerSession: (user: TUser) => Promise<unknown>,
  readProfile: (user: TUser) => Promise<TProfile>,
): (user: TUser) => Promise<TProfile> {
  const inFlight = new Map<string, Promise<TProfile>>();

  return (user) => {
    const existing = inFlight.get(user.uid);
    if (existing) return existing;

    const load = (async () => {
      await establishServerSession(user);
      return readProfile(user);
    })();
    inFlight.set(user.uid, load);

    return load.finally(() => {
      if (inFlight.get(user.uid) === load) inFlight.delete(user.uid);
    });
  };
}
