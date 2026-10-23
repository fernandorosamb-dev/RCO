export type Role = "supervisor" | "engenheiro" | "eletrica" | "hidraulica" | "refrigeracao" | "civil";
export const roles: Role[] = ["supervisor", "engenheiro", "eletrica", "hidraulica", "refrigeracao", "civil"];
export function isOverviewRole(role: Role | null | undefined) { return role === "supervisor" || role === "engenheiro"; }
export function loginRole(username: unknown): Role | null {
 if (typeof username !== "string") return null;
 if (username.trim().toLowerCase() === "eng_luis_gimenes") return "engenheiro";
 return ["supervisor", "eletrica", "hidraulica", "refrigeracao", "civil"].includes(username) ? username as Role : null;
}
