import prisma from "../../db/index.js";
import socketAuth from "./socketAuth.js";
import { checkChatAccess } from "../services/chatAccess.js";

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

        // ---- room authorisation -------------------------------------------------
        // A chat room is joined only through joinRoom, which checks membership in
        // the database. Every other chat event then just checks socket.rooms.
        let attemptSeq = 0;
        const latestAttempt = new Map(); // chatId -> id of the newest join/leave
        const pendingJoins = new Map();  // chatId -> promise of the join in flight

        const forbid = (event) => {
            socket.emit("socket_error", { event, message: "forbidden" });
        };

        const isChatRoomName = (chatId) =>
            typeof chatId === "string" &&
            chatId.length > 0 &&
            chatId !== socket.id &&
            !chatId.startsWith("user:");

        // Waits for an in-flight joinRoom for this chat, then checks the socket is in the room.
        const requireRoom = async (chatId, event) => {
            if (isChatRoomName(chatId)) {
                const pending = pendingJoins.get(chatId);
                if (pending) {
                    await pending;
                }
                if (socket.rooms.has(chatId)) {
                    return true;
                }
            }
            forbid(event);
            return false;
        };

        // Runs an async handler and keeps a failure from becoming an unhandled rejection.
        const guarded = (event, handler) => async (...args) => {
            try {
                await handler(...args);
            } catch (err) {
                console.log(`Error in ${event}:`, err);
            }
        };

        // A message that exists, belongs to this chat and was written by this user.
        const findOwnMessage = (messageId, chatId) => {
            if (typeof messageId !== "string") return null;
            return prisma.message.findFirst({
                where: { id: messageId, chatId, userId: me },
                select: { id: true, text: true }
            });
        };

        socket.on("joinRoom", (chatId, ack) => {
            const reply = typeof ack === "function" ? ack : () => {};
            if (!isChatRoomName(chatId)) {
                return reply({ ok: false, error: "invalid chat" });
            }

            const attempt = ++attemptSeq;
            latestAttempt.set(chatId, attempt);

            const join = (async () => {
                const access = await checkChatAccess(me, chatId);
                // A leaveRoom or newer joinRoom arrived while we were checking.
                if (latestAttempt.get(chatId) !== attempt) {
                    return { ok: false, error: "superseded" };
                }
                if (!access.authorized) {
                    return { ok: false, error: access.message };
                }
                socket.join(chatId);
                return { ok: true };
            })().catch((err) => {
                console.log("Error in joinRoom:", err);
                return { ok: false, error: "Internal server error" };
            });

            pendingJoins.set(chatId, join);
            join.then((result) => {
                if (pendingJoins.get(chatId) === join) {
                    pendingJoins.delete(chatId);
                }
                reply(result);
            });
        });

        socket.on("leaveRoom", (chatId) => {
            if (!isChatRoomName(chatId)) return;
            latestAttempt.set(chatId, ++attemptSeq);
            socket.leave(chatId);
        });

        // ---- messages -----------------------------------------------------------
        socket.on("sendMessage", guarded("sendMessage", async ({ message, chatId, messageId } = {}) => {
            if (!(await requireRoom(chatId, "sendMessage"))) return;

            const saved = await findOwnMessage(messageId, chatId);
            if (!saved) return forbid("sendMessage");

            const chat = await prisma.chat.findUnique({
                where: { id: chatId },
                select: { isGroup: true, userId: true, receiverId: true }
            });
            if (!chat) return forbid("sendMessage");

            if (!chat.isGroup && chat.receiverId) {
                // Direct message: the recipient is the other participant of the chat,
                // never a user id supplied by the client.
                const recipientId = chat.userId === me ? chat.receiverId : chat.userId;
                if (presence.has(recipientId)) {
                    await prisma.message.update({
                        where: { id: saved.id },
                        data: { status: "delivered" }
                    });
                    io.to(`user:${recipientId}`).emit("receiveMessage", {
                        from: me,
                        message: saved.text,
                        chatId,
                        id: saved.id,
                        status: "delivered"
                    });
                }
            } else {
                socket.to(chatId).emit("receiveMessage", {
                    from: me,
                    message: saved.text,
                    chatId,
                    id: saved.id,
                    status: "sent"
                });
            }
        }));

        // The client passes the chat id as the first argument for both groups and
        // DMs. The second argument (a recipient id) is ignored.
        socket.on("sendFile", guarded("sendFile", async (chatId, _ignoredUserId, _fileUrl, _fileType, _filename, messageId) => {
            if (!(await requireRoom(chatId, "sendFile"))) return;

            const saved = await findOwnMessage(messageId, chatId);
            if (!saved) return forbid("sendFile");

            // Take the file details from the stored message, not from the client.
            let file;
            try {
                file = JSON.parse(saved.text);
            } catch {
                return forbid("sendFile");
            }
            if (!file || file.type !== "file") return forbid("sendFile");

            const chat = await prisma.chat.findUnique({
                where: { id: chatId },
                select: { isGroup: true, userId: true, receiverId: true }
            });
            if (!chat) return forbid("sendFile");

            const payload = {
                id: saved.id,
                from: me,
                chatId,
                fileUrl: file.fileUrl,
                fileType: file.fileType,
                filename: file.filename
            };

            if (!chat.isGroup && chat.receiverId) {
                const recipientId = chat.userId === me ? chat.receiverId : chat.userId;
                io.to(`user:${recipientId}`).emit("newFile", payload);
            } else {
                socket.to(chatId).emit("newFile", payload);
            }
        }));

        // Global room chat. The payload is { chatId, text }; the sender is always
        // the authenticated user.
        socket.on("message", guarded("message", async (payload) => {
            const { chatId, text } = payload && typeof payload === "object" ? payload : {};
            if (!(await requireRoom(chatId, "message"))) return;
            if (typeof text !== "string" || !text.trim()) return;

            const chat = await prisma.chat.findUnique({
                where: { id: chatId },
                select: { isGroup: true, receiverId: true }
            });
            // Only the global room (not a group, no receiver) uses this event.
            if (!chat || chat.isGroup || chat.receiverId !== null) return forbid("message");

            io.to(chatId).emit("message", { from: me, text });
        }));

        socket.on("deleteMessage", guarded("deleteMessage", async ({ messageId, chatId } = {}) => {
            if (!(await requireRoom(chatId, "deleteMessage"))) return;
            if (typeof messageId !== "string") return;

            // The REST route deletes the row first, so a missing row proves it was
            // really deleted through the authorised route.
            const stillThere = await prisma.message.findUnique({ where: { id: messageId } });
            if (stillThere) return forbid("deleteMessage");

            socket.to(chatId).emit("messageDeleted", { messageId, chatId });
        }));

        socket.on("messageReaction", guarded("messageReaction", async ({ messageId, emoji, action, chatId } = {}) => {
            if (!(await requireRoom(chatId, "messageReaction"))) return;
            if (typeof messageId !== "string") return;

            const inChat = await prisma.message.findFirst({
                where: { id: messageId, chatId },
                select: { id: true }
            });
            if (!inChat) return forbid("messageReaction");

            const { id, name } = socket.data.user;
            socket.to(chatId).emit("messageReactionUpdated", {
                messageId,
                userId: id,
                username: name,
                emoji,
                action,
                chatId
            });
        }));

        socket.on("messageEdited", guarded("messageEdited", async ({ messageId, chatId } = {}) => {
            if (!(await requireRoom(chatId, "messageEdited"))) return;

            const saved = await findOwnMessage(messageId, chatId);
            if (!saved) return forbid("messageEdited");

            // Broadcast what is stored, not what the client claims it edited to.
            socket.to(chatId).emit("messageEdited", {
                messageId,
                text: saved.text,
                chatId
            });
        }));

        socket.on("typing", guarded("typing", async ({ chatId, isTyping } = {}) => {
            if (!(await requireRoom(chatId, "typing"))) return;
            socket.to(chatId).emit("typing", { chatId, userId: me, isTyping });
        }));

        // ---- message status -----------------------------------------------------
        socket.on("readAllMessages", guarded("readAllMessages", async ({ chatId } = {}) => {
            if (!(await requireRoom(chatId, "readAllMessages"))) return;

            await prisma.message.updateMany({
                where: {
                    chatId,
                    userId: { not: me },
                    status: { not: "read" }
                },
                data: { status: "read" }
            });
            io.to(chatId).emit("messagesRead", { chatId, userId: me });
        }));

        socket.on("readMessageSingle", guarded("readMessageSingle", async ({ messageId, chatId } = {}) => {
            if (!(await requireRoom(chatId, "readMessageSingle"))) return;
            if (typeof messageId !== "string") return;

            const { count } = await prisma.message.updateMany({
                where: { id: messageId, chatId, userId: { not: me } },
                data: { status: "read" }
            });
            if (count > 0) {
                io.to(chatId).emit("messageStatusUpdated", { messageId, chatId, status: "read" });
            }
        }));

        // The client emits this for messages arriving in a chat it is not currently
        // viewing, so it has not joined that chat's room. Access is checked against
        // the database instead of the room, with the same rules as joinRoom.
        socket.on("deliverMessageSingle", guarded("deliverMessageSingle", async ({ messageId, chatId } = {}) => {
            if (!isChatRoomName(chatId) || typeof messageId !== "string") return forbid("deliverMessageSingle");
            if (!socket.rooms.has(chatId)) {
                const access = await checkChatAccess(me, chatId);
                if (!access.authorized) return forbid("deliverMessageSingle");
            }

            const { count } = await prisma.message.updateMany({
                where: { id: messageId, chatId, userId: { not: me } },
                data: { status: "delivered" }
            });
            if (count > 0) {
                io.to(chatId).emit("messageStatusUpdated", { messageId, chatId, status: "delivered" });
            }
        }));

        // ---- presence -----------------------------------------------------------
        // Identity comes from the handshake. `join` is kept as a no-op that only
        // re-sends the online list so older clients that still emit it keep working.
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

        socket.on("disconnect", () => {
            if (removePresence(me, socket.id)) {
                markOffline(me);
            }
        });
    });
}
