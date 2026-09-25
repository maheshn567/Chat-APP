import { io } from "socket.io-client";

// Store socket on window so HMR never creates a second connection.
// Every time this module is re-executed by Vite, the existing socket is reused.
if (!window.__chatSocket) {
    window.__chatSocket = io("http://localhost:3000");
}

const socket = window.__chatSocket;

export default socket;
