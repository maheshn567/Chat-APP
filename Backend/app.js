import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors"
import cookieParser from "cookie-parser";
import loginRouter from './src/routes/login.route.js'
import getMeRouter from './src/routes/getMe.route.js'
import messageRouter from './src/routes/message.route.js'
import authMiddleware from "./src/middleware/authMiddleware.js";
import { upload, handleUpload } from "./src/services/cloudinary.services.js";
import initializeSockets from "./src/sockets/socket.js";

const app = express();
app.use(cors({
    origin:"http://localhost:5173",
    credentials:true
}))
app.use(express.json());              // parse application/json bodies
app.use(express.urlencoded({ extended: true })); // parse form bodies
app.use(cookieParser())
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        credentials: true
    },maxHttpBufferSize:1e8
});

app.post("/api/upload", authMiddleware, upload.single('file'), handleUpload);

initializeSockets(io);


app.use('/api',loginRouter)
app.use('/api',getMeRouter)
app.use('/api',messageRouter)



app.use((req, res) => {
    res.status(404).send("page not found");
});

export default httpServer;