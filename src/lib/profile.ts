import prisma from "./prisma";

export const WORKSPACE_PROFILE_ID = "local";

export type WorkspaceProfileView = {
  id: string;
  displayName: string;
  studentId: string;
  avatarLabel: string;
};

function deriveAvatarLabel(displayName: string) {
  const normalized = displayName.trim();
  if (!normalized) {
    return "U";
  }

  return normalized.slice(0, 1).toUpperCase();
}

export function buildProfileFallback(): WorkspaceProfileView {
  return {
    id: WORKSPACE_PROFILE_ID,
    displayName: "사용자",
    studentId: "",
    avatarLabel: "U",
  };
}

export async function fetchWorkspaceProfile(): Promise<WorkspaceProfileView> {
  try {
    const profile = await prisma.workspaceProfile.findUnique({
      where: { id: WORKSPACE_PROFILE_ID },
    });

    if (!profile) {
      return buildProfileFallback();
    }

    return {
      id: profile.id,
      displayName: profile.displayName,
      studentId: profile.studentId ?? "",
      avatarLabel: profile.avatarLabel?.trim() || deriveAvatarLabel(profile.displayName),
    };
  } catch {
    return buildProfileFallback();
  }
}
