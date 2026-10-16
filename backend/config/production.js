const required = [
  "MONGODB_URL", "JWT_SECRET", "FRONTEND_ORIGIN", "PORT",
  "CLOUD_NAME", "API_KEY", "API_SECRET",
]

export const validateProductionEnvironment = (env = process.env) => {
  if (env.NODE_ENV !== "production") return
  const missing = required.filter(name => !env[name]?.trim())
  if (missing.length) throw new Error(`missing production environment variables: ${missing.join(", ")}`)
  if (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535) {
    throw new Error("PORT must be a valid TCP port")
  }

  let origin
  try { origin = new URL(env.FRONTEND_ORIGIN) } catch { /* reported below */ }
  if (!origin || origin.protocol !== "https:" || origin.origin !== env.FRONTEND_ORIGIN ||
      origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("FRONTEND_ORIGIN must be an HTTPS origin without a path")
  }
}
