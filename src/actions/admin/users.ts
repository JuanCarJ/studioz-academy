"use server"

export async function getUsers(filters?: { search?: string; role?: string }) {
  // TODO: Query users with filters and pagination
  console.log("admin.getUsers", filters)
  return []
}

export async function getUserDetail(userId: string) {
  // TODO: Query user profile + enrollments + orders
  console.log("admin.getUserDetail", userId)
  return null
}
