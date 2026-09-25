import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_secret: process.env.API_SECRECT || process.env.API_SECRET,
    api_key: process.env.API_KEY
});

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 10 } // 10MB limit
});

export async function handleUpload(req, res) {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        const fileName = `${new Date().getTime()}-${file.originalname}`;
        
        // Convert buffer to data URI
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = `data:${file.mimetype};base64,${b64}`;
        
        const result = await cloudinary.uploader.upload(dataURI, {
            public_id: fileName,
            resource_type: "auto",
            folder: "chat-files"
        });

        res.json({
            success: true,
            message: "file uploaded successfully",
            url: result.secure_url,
            type: result.resource_type, 
            filename: result.original_filename
        });
    } catch (err) {
        console.error("Cloudinary upload error:", err);
        res.status(500).json({ error: "something went wrong" });
    }
}
