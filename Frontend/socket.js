import { io } from "socket.io-client";

// Store socket on window so HMR never creates a second connection.
// Every time this module is re-executed by Vite, the existing socket is reused.
// The socket is created disconnected and opened after login (see Auth.context.jsx);
// withCredentials sends the HTTP-only auth cookie with the handshake.
if (!window.__chatSocket) {
    window.__chatSocket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000", {
        withCredentials: true,
        autoConnect: false
    });
}

const socket = window.__chatSocket;

export default socket;
