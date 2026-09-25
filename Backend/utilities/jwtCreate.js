import jwt from "jsonwebtoken";
import getJwtSecret from "./jwtSecret.js";

export default function createJWT(data, res){
    try{
        const token = jwt.sign(data, getJwtSecret(), { expiresIn: "7d" });
        
        // Set the token as a cookie
        res.cookie("token", token, {
            httpOnly: true, // Prevents client-side JS from reading the cookie
            secure: process.env.NODE_ENV === "production", // HTTPS-only in production
            sameSite: "strict", // Protects against CSRF
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
        });

        return token;
    }
    catch(e){
        console.log("Error in createJWT:", e);
    }
}
