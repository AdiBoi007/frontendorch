const ACTIVE_PROJECT_KEY = "orchestra_active_project_id";

export function getRememberedProjectId(): string | null {
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function setRememberedProjectId(projectId: string | null) {
  if (projectId) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    return;
  }
  localStorage.removeItem(ACTIVE_PROJECT_KEY);
}
