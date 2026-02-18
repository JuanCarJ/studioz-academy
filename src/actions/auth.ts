"use server"

export async function login(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  // TODO: Supabase auth.signInWithPassword
  console.log("login", email, password)
}

export async function register(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const name = formData.get("name") as string
  // TODO: Supabase auth.signUp + insert profile
  console.log("register", email, password, name)
}

export async function logout() {
  // TODO: Supabase auth.signOut + redirect
}

export async function resetPassword(formData: FormData) {
  const email = formData.get("email") as string
  // TODO: Supabase auth.resetPasswordForEmail
  console.log("resetPassword", email)
}
