export const cookieOptions = () => ({
  httpOnly: true,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: process.env.NODE_ENV === "production" ? "Lax" : "Strict",
  secure: process.env.NODE_ENV === "production",
})

export const clearCookieOptions = () => ({
  httpOnly: true,
  path: "/",
  sameSite: process.env.NODE_ENV === "production" ? "Lax" : "Strict",
  secure: process.env.NODE_ENV === "production",
})
