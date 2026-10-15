import { v2 as cloudinary } from "cloudinary"
import { Readable } from "node:stream"

const uploadOnCloudinary = buffer => {
  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
  })

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
      if (error) return reject(error)
      if (!result?.secure_url) return reject(new Error("Cloudinary returned no URL"))
      resolve(result.secure_url)
    })
    stream.on("error", reject)
    Readable.from([buffer]).on("error", reject).pipe(stream)
  })
}

export default uploadOnCloudinary
