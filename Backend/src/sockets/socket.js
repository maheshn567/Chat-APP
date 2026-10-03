import prisma from "../../db/index.js";
import socketAuth from "./socketAuth.js";

export default function initializeSockets(io) {
    const userSocket = new Map();

    io.use(socketAuth);

    io.on("connection", (socket) => {
        const me = socket.data.user.id;
        console.log("new connection:", socket.id, me);

        userSocket.set(me, socket.id);
        io.emit("userStatusChanged", { userId: me, status: "online" });
        socket.emit("onlineUsersList", Array.from(userSocket.keys()));

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
                const recipientSocketId = userSocket.get(userId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('newFile', payload);
                }
            }
        });

        socket.on("message", (msg) => {
            io.emit("message", { from: me, text: msg });
        });

        // Identity now comes from the handshake. `join` is kept as a no-op that
        // only re-sends the online list so older clients that still emit it keep working.
        socket.on("join", () => {
            socket.emit("onlineUsersList", Array.from(userSocket.keys()));
        });

        socket.on("logout", () => {
            if (userSocket.get(me) === socket.id) {
                userSocket.delete(me);
            }
        });

        socket.on("getOnlineUsers", () => {
            socket.emit("onlineUsersList", Array.from(userSocket.keys()));
        });

        socket.on('sendMessage', async ({ userId, message, chatId, messageId }) => {
            if (userId) {
                const recipientSocketId = userSocket.get(userId);
                if (recipientSocketId) {
                    if (messageId) {
                        await prisma.message.update({
                            where: { id: messageId },
                            data: { status: "delivered" }
                        }).catch(e => console.log(e));
                    }

                    io.to(recipientSocketId).emit('receiveMessage', {
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

        socket.on("disconnect", async () => {
            if (userSocket.get(me) !== socket.id) {
                return;
            }
            userSocket.delete(me);

            const lastSeenTime = new Date();
            try {
                await prisma.user.update({
                    where: { id: me },
                    data: { lastSeen: lastSeenTime }
                });
            } catch (e) {
                console.log("Error updating lastSeen for disconnected user:", e);
            }

            io.emit("userStatusChanged", {
                userId: me,
                status: "offline",
                lastSeen: lastSeenTime
            });
        });
    });
}
