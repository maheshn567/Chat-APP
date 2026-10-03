import jwt from "jsonwebtoken";
import { parseCookie } from "cookie";
import getJwtSecret from "../../utilities/jwtSecret.js";

// Socket.IO handshake middleware. Mirrors authMiddleware.js for REST: reads the
// same HTTP-only JWT cookie and rejects the connection if it is missing or invalid.
export default function socketAuth(socket, next) {
    try {
        const cookies = parseCookie(socket.handshake.headers.cookie || "");
        const token = cookies.token || cookies.jwt;
        if (!token) {
            return next(new Error("unauthorized"));
        }
        const { id, name, email } = jwt.verify(token, getJwtSecret());
        if (!id) {
            return next(new Error("unauthorized"));
        }
        socket.data.user = { id, name, email };
        next();
    } catch (error) {
        next(new Error("unauthorized"));
    }
}
