import multer from "multer"

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 },
})

export const imageFormat = buffer => {
  if (!Buffer.isBuffer(buffer)) return null
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg"
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
  if (buffer.length >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(buffer.toString("ascii", 12, 16))) return "image/webp"
  return null
}

export const uploadImage = (req, res, next) => {
  upload.single("image")(req, res, error => {
    if (error) {
      if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "image exceeds 5 MB" })
      return res.status(400).json({ message: "invalid image upload" })
    }
    if (req.file) {
      const format = imageFormat(req.file.buffer)
      if (!format || format !== req.file.mimetype) {
        return res.status(400).json({ message: "unsupported image format" })
      }
    }
    next()
  })
}
