type AccessUser = {
  role: string;
  technicianLevel: string;
};

export function isLeadOrAdmin(user: AccessUser) {
  return user.role === "ADMIN" || user.technicianLevel === "LEAD";
}