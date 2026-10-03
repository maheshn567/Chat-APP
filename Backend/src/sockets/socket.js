import prisma from "../../db/index.js";
import socketAuth from "./socketAuth.js";

export default function initializeSockets(io) {
    // userId -> Set of socket ids, so several tabs/devices count as one online user
    const presence = new Map();

    const onlineUserIds = () => Array.from(presence.keys());

    // Removes this socket from presence. Returns true if it was the user's last one.
    const removePresence = (userId, socketId) => {
        const sockets = presence.get(userId);
        if (!sockets || !sockets.delete(socketId)) {
            return false;
        }
        if (sockets.size === 0) {
            presence.delete(userId);
            return true;
        }
        return false;
    };

    const markOffline = async (userId) => {
        const lastSeenTime = new Date();
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { lastSeen: lastSeenTime }
            });
        } catch (e) {
            console.log("Error updating lastSeen for disconnected user:", e);
        }
        io.emit("userStatusChanged", {
            userId,
            status: "offline",
            lastSeen: lastSeenTime
        });
    };

    io.use(socketAuth);

    io.on("connection", (socket) => {
        const me = socket.data.user.id;
        console.log("new connection:", socket.id, me);

        // Private room reaching every tab of this user (DMs, file notifications).
        socket.join(`user:${me}`);

        const isFirstSocket = !presence.has(me);
        if (isFirstSocket) {
            presence.set(me, new Set());
        }
        presence.get(me).add(socket.id);
        if (isFirstSocket) {
            io.emit("userStatusChanged", { userId: me, status: "online" });
        }
        socket.emit("onlineUsersList", onlineUserIds());

        socket.on("sendFile", (groupId = '', userId = '', fileUrl, fileType, filename, messageId = null) => {
            const payload = {
                id: messageId,
                from: me,
                chatId: groupId || null,
                fileUrl,
                fileType,
                filename
            };

            if (groupId) {
                socket.to(groupId).emit('newFile', payload);
            } else if (userId) {
                io.to(`user:${userId}`).emit('newFile', payload);
            }
        });

        socket.on("message", (msg) => {
            io.emit("message", { from: me, text: msg });
        });

        // Identity now comes from the handshake. `join` is kept as a no-op that
        // only re-sends the online list so older clients that still emit it keep working.
        socket.on("join", () => {
            socket.emit("onlineUsersList", onlineUserIds());
        });

        socket.on("logout", () => {
            if (removePresence(me, socket.id)) {
                markOffline(me);
            }
            socket.disconnect(true);
        });

        socket.on("getOnlineUsers", () => {
            socket.emit("onlineUsersList", onlineUserIds());
        });

        socket.on('sendMessage', async ({ userId, message, chatId, messageId }) => {
            if (userId) {
                if (presence.has(userId)) {
                    if (messageId) {
                        await prisma.message.update({
                            where: { id: messageId },
                            data: { status: "delivered" }
                        }).catch(e => console.log(e));
                    }

                    io.to(`user:${userId}`).emit('receiveMessage', {
                        from: me,
                        message,
                        chatId,
                        id: messageId,
                        status: "delivered"
                    });
                }
            } else if (chatId) {
                socket.to(chatId).emit('receiveMessage', {
                    from: me,
                    message,
                    chatId,
                    id: messageId,
                    status: "sent"
                });
            }
        });

        socket.on('deleteMessage', ({ messageId, chatId }) => {
            if (chatId) {
                socket.to(chatId).emit('messageDeleted', {
                    messageId,
                    chatId
                });
            }
        });

        socket.on('messageReaction', ({ messageId, userId, username, emoji, action, chatId }) => {
            if (chatId) {
                socket.to(chatId).emit('messageReactionUpdated', {
                    messageId,
                    userId,
                    username,
                    emoji,
                    action,
                    chatId
                });
            }
        });

        socket.on('messageEdited', ({ messageId, text, chatId }) => {
            if (chatId) {
                socket.to(chatId).emit('messageEdited', {
                    messageId,
                    text,
                    chatId
                });
            }
        });

        socket.on('typing', ({ chatId, isTyping }) => {
            if (chatId && me) {
                socket.to(chatId).emit('typing', {
                    chatId,
                    userId: me,
                    isTyping
                });
            }
        });

        socket.on('readAllMessages', async ({ chatId }) => {
            if (chatId && me) {
                try {
                    await prisma.message.updateMany({
                        where: {
                            chatId: chatId,
                            userId: { not: me },
                            status: { not: "read" }
                        },
                        data: {
                            status: "read"
                        }
                    });
                    io.to(chatId).emit('messagesRead', { chatId, userId: me });
                } catch (err) {
                    console.log("Error in readAllMessages:", err);
                }
            }
        });

        socket.on('readMessageSingle', async ({ messageId, chatId }) => {
            if (messageId && chatId) {
                try {
                    await prisma.message.update({
                        where: { id: messageId },
                        data: { status: "read" }
                    });
                    io.to(chatId).emit('messageStatusUpdated', { messageId, chatId, status: "read" });
                } catch (err) {
                    console.log("Error in readMessageSingle:", err);
                }
            }
        });

        socket.on('deliverMessageSingle', async ({ messageId, chatId }) => {
            if (messageId && chatId) {
                try {
                    await prisma.message.update({
                        where: { id: messageId },
                        data: { status: "delivered" }
                    });
                    io.to(chatId).emit('messageStatusUpdated', { messageId, chatId, status: "delivered" });
                } catch (err) {
                    console.log("Error in deliverMessageSingle:", err);
                }
            }
        });

        socket.on('joinRoom', (chatId) => {
            if (chatId) {
                socket.join(chatId);
                console.log(`Socket ${socket.id} joined room: ${chatId}`);
            }
        });

        socket.on('leaveRoom', (chatId) => {
            if (chatId) {
                socket.leave(chatId);
                console.log(`Socket ${socket.id} left room: ${chatId}`);
            }
        });

        socket.on("disconnect", () => {
            if (removePresence(me, socket.id)) {
                markOffline(me);
            }
        });
    });
}
