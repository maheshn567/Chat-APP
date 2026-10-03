import prisma from "../../db/index.js";

// Helper function to check chat access authorization
export async function checkChatAccess(userId, chatId) {
    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
            members: {
                select: { id: true, username: true, email: true, createdAt: true }
            }
        }
    });

    if (!chat) {
        return { authorized: false, status: 404, message: "Chat room not found" };
    }

    // If it's a group chat, the user must be the creator OR a member
    if (chat.isGroup) {
        const isCreator = chat.userId === userId;
        const isMember = chat.members.some(m => m.id === userId);
        if (!isCreator && !isMember) {
            return { authorized: false, status: 403, message: "Forbidden: You are not a member of this group" };
        }
    } else if (chat.receiverId !== null) {
        // If it's a private DM, the user must be the creator OR the receiver
        if (chat.userId !== userId && chat.receiverId !== userId) {
            return { authorized: false, status: 403, message: "Forbidden: You are not authorized to access this chat" };
        }
    }
    
    // Otherwise, it's either public (global room) or authorized
    return { authorized: true, chat };
}
