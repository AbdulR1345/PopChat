import "dotenv/config"

export const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173"

export const verifyRequestOrigin = (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("Origin")
    if (origin && origin !== allowedOrigin) return res.status(403).json({ message: "origin not allowed" })
    if (process.env.NODE_ENV === "production" && !origin) return res.status(403).json({ message: "origin required" })
  }
  next()
}

export const verifyLegacyLogoutOrigin = (req, res, next) => {
  let origin = req.get("Origin")
  if (!origin && req.get("Referer")) {
    try {
      origin = new URL(req.get("Referer")).origin
    } catch {
      return res.status(403).json({ message: "origin not allowed" })
    }
  }
  if (origin && origin !== allowedOrigin) return res.status(403).json({ message: "origin not allowed" })
  if (process.env.NODE_ENV === "production" && !origin) {
    return res.status(403).json({ message: "origin required" })
  }
  next()
}
