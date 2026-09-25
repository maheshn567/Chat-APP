import prisma from "../../db/index.js";

export default function initializeSockets(io) {
    const userSocket = new Map();

    io.on("connection", (socket) => {
        console.log("new connection:", socket.id);

        socket.on("sendFile", (groupId = '', userId = '', fileUrl, fileType, filename, messageId = null) => {
            const payload = {
                id: messageId,
                from: socket.userId,
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
            io.emit("message", { from: socket.userId, text: msg });
        });

        let joinedUserId = null;

        socket.on("join", (user) => {
            if (user && user.id) {
                if (socket.userId && socket.userId !== user.id) {
                    userSocket.delete(socket.userId);
                }
                joinedUserId = user.id;
                socket.userId = user.id;
                userSocket.set(user.id, socket.id);
                console.log(`User mapped: ${user.username} (${user.id}) => ${socket.id}`);

                io.emit("userStatusChanged", {
                    userId: user.id,
                    status: "online"
                });

                socket.emit("onlineUsersList", Array.from(userSocket.keys()));
            }
        });

        socket.on("logout", () => {
            if (socket.userId) {
                userSocket.delete(socket.userId);
                console.log(`User logged out and unmapped: ${socket.userId}`);
                socket.userId = null;
            }
            joinedUserId = null;
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
                        from: socket.userId,
                        message,
                        chatId,
                        id: messageId,
                        status: "delivered"
                    });
                }
            } else if (chatId) {
                socket.to(chatId).emit('receiveMessage', {
                    from: socket.userId,
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
            if (chatId && socket.userId) {
                socket.to(chatId).emit('typing', {
                    chatId,
                    userId: socket.userId,
                    isTyping
                });
            }
        });

        socket.on('readAllMessages', async ({ chatId }) => {
            if (chatId && socket.userId) {
                try {
                    await prisma.message.updateMany({
                        where: {
                            chatId: chatId,
                            userId: { not: socket.userId },
                            status: { not: "read" }
                        },
                        data: {
                            status: "read"
                        }
                    });
                    io.to(chatId).emit('messagesRead', { chatId, userId: socket.userId });
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
            if (joinedUserId) {
                userSocket.delete(joinedUserId);
                console.log(`User unmapped: ${joinedUserId}`);

                const lastSeenTime = new Date();
                try {
                    await prisma.user.update({
                        where: { id: joinedUserId },
                        data: { lastSeen: lastSeenTime }
                    });
                } catch (e) {
                    console.log("Error updating lastSeen for disconnected user:", e);
                }

                io.emit("userStatusChanged", {
                    userId: joinedUserId,
                    status: "offline",
                    lastSeen: lastSeenTime
                });
            } else {
                console.log("disconnected:", socket.id);
            }
        });
    });
}
