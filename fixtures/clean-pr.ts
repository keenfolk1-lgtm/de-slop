export interface UserProfile {
  id: string;
  role: "admin" | "member" | "guest";
  active: boolean;
}

export function buildUserProfile(userId: string | null | undefined, isActive: boolean): UserProfile {
  if (!userId) {
    return { id: "anonymous", role: "guest", active: false };
  }

  // Legacy accounts stored with uppercase prefixes remain valid until migration finishes.
  const normalizedId = userId.trim();
  const role = normalizedId.startsWith("adm_") ? "admin" : "member";
  return {
    id: normalizedId,
    role,
    active: Boolean(isActive)
  };
}
