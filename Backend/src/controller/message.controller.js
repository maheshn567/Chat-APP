import prisma from "../../db/index.js";

// Helper function to check chat access authorization
async function checkChatAccess(userId, chatId) {
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

// Get or create a default chat room
export async function getDefaultChat(req, res) {
    const userId = req.user.id;
    try {
        // Find any existing chat in the database that has no receiverId (Global Room)
        let chat = await prisma.chat.findFirst({
            where: {
                receiverId: null,
                isGroup: false
            }
        });
        if (!chat) {
            // If no global chat exists, create one created by the current user
            chat = await prisma.chat.create({
                data: {
                    userId: userId,
                    receiverId: null,
                    isGroup: false
                }
            });
        }
        return res.status(200).json({
            success: true,
            chat
        });
    } catch (error) {
        console.log(`error at getDefaultChat controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Get or create a private chat room between two users
export async function getOrCreatePrivateChat(req, res) {
    const userId = req.user.id;
    const { receiverId } = req.params;

    if (!receiverId) {
        return res.status(400).json({
            success: false,
            message: "receiverId is required in parameters"
        });
    }

    try {
        // Look for an existing chat between user A and user B
        let chat = await prisma.chat.findFirst({
            where: {
                isGroup: false,
                OR: [
                    { userId: userId, receiverId: receiverId },
                    { userId: receiverId, receiverId: userId }
                ]
            }
        });

        // If no private chat exists, create a new one
        if (!chat) {
            chat = await prisma.chat.create({
                data: {
                    userId: userId,
                    receiverId: receiverId,
                    isGroup: false
                }
            });
        }

        return res.status(200).json({
            success: true,
            chat
        });
    } catch (error) {
        console.log(`error at getOrCreatePrivateChat controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Retrieve messages for a specific chat (chatId passed in URL params)
export async function getAllMessages(req, res) {
    const userId = req.user.id;
    const { chatId } = req.params; // Get chatId from URL parameters

    if (!chatId) {
        return res.status(400).json({
            success: false,
            message: "chatId is required in the URL parameters"
        });
    }

    try {
        const access = await checkChatAccess(userId, chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message
            });
        }

        // Fetch messages belonging to this chat
        const result = await prisma.message.findMany({
            where: {
                chatId: chatId
            },
            include: {
                reactions: {
                    select: {
                        emoji: true,
                        userId: true,
                        user: {
                            select: {
                                username: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        return res.status(200).json({
            success: true,
            message: "messages retrieved successfully",
            data: result
        });
        
    } catch (error) {
        console.log(`error at getmessage controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Add a new message (requires text in body and chatId in URL params)
export async function addMessage(req, res) {
    const userId = req.user.id;
    const { chatId } = req.params; // Get chatId from URL parameters
    const { text } = req.body; // Get text from request body

    if (!text) {
        return res.status(400).json({
            success: false,
            message: "Message text is required in the request body"
        });
    }

    if (!chatId) {
        return res.status(400).json({
            success: false,
            message: "chatId is required in the URL parameters"
        });
    }

    try {
        const access = await checkChatAccess(userId, chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message
            });
        }

        const result = await prisma.message.create({
            data: {
                userId: userId,
                chatId: chatId,
                text: text
            }
        });

        return res.status(201).json({
            success: true,
            message: "message added successfully",
            data: result
        });
        
    } catch (error) {
        console.log(`error at add message controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Fetch details for a specific chat room
export async function getChatDetails(req, res) {
    const userId = req.user.id;
    const { chatId } = req.params;
    try {
        const access = await checkChatAccess(userId, chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message
            });
        }
        return res.status(200).json({
            success: true,
            chat: access.chat
        });
    } catch (error) {
        console.log(`error at getChatDetails controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Create a new group chat
export async function createGroupChat(req, res) {
    const userId = req.user.id;
    const { name, memberIds } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            message: "Group name is required"
        });
    }

    try {
        // Prepare list of members to connect: current user + specified members
        const connectUsers = [{ id: userId }];
        if (Array.isArray(memberIds)) {
            memberIds.forEach(id => {
                if (id !== userId) {
                    connectUsers.push({ id });
                }
            });
        }

        const chat = await prisma.chat.create({
            data: {
                isGroup: true,
                name: name,
                userId: userId, // admin
                members: {
                    connect: connectUsers
                }
            },
            include: {
                members: true
            }
        });

        return res.status(201).json({
            success: true,
            message: "Group chat created successfully",
            chat
        });
    } catch (error) {
        console.log(`error at createGroupChat controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Get all group chats the user belongs to
export async function getUserGroups(req, res) {
    const userId = req.user.id;
    try {
        const groups = await prisma.chat.findMany({
            where: {
                isGroup: true,
                OR: [
                    { userId: userId }, // Created by user
                    {
                        members: {
                            some: {
                                id: userId
                            }
                        }
                    } // User is member
                ]
            },
            include: {
                members: {
                    select: {
                        id: true,
                        username: true
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        return res.status(200).json({
            success: true,
            groups
        });
    } catch (error) {
        console.log(`error at getUserGroups controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Add a new member to an existing group chat
export async function addGroupMember(req, res) {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { memberId } = req.body;

    if (!memberId) {
        return res.status(400).json({
            success: false,
            message: "memberId is required in request body"
        });
    }

    try {
        const access = await checkChatAccess(userId, chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message
            });
        }

        const chat = access.chat;
        if (!chat.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This chat is not a group chat"
            });
        }

        // Add the member to the group
        const updatedChat = await prisma.chat.update({
            where: { id: chatId },
            data: {
                members: {
                    connect: { id: memberId }
                }
            },
            include: {
                members: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        createdAt: true
                    }
                }
            }
        });

        return res.status(200).json({
            success: true,
            message: "Member added to group successfully",
            members: updatedChat.members
        });
    } catch (error) {
        console.log(`error at addGroupMember controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Delete a chat room and all its messages
export async function deleteChat(req, res) {
    const userId = req.user.id;
    const { chatId } = req.params;

    try {
        const access = await checkChatAccess(userId, chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message
            });
        }

        const chat = access.chat;
        
        // Authorization check: only group admin can delete a group chat
        if (chat.isGroup && chat.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: Only the group admin can delete this group"
            });
        }

        // Delete messages
        await prisma.message.deleteMany({
            where: { chatId: chatId }
        });

        // Delete chat
        await prisma.chat.delete({
            where: { id: chatId }
        });

        return res.status(200).json({
            success: true,
            message: "Chat deleted successfully"
        });
    } catch (error) {
        console.log(`error at deleteChat controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Remove a member from a group chat (Admin only)
export async function removeGroupMember(req, res) {
    const userId = req.user.id;
    const { chatId, memberId } = req.params;

    if (!memberId) {
        return res.status(400).json({
            success: false,
            message: "memberId is required"
        });
    }

    try {
        const access = await checkChatAccess(userId, chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message
            });
        }

        const chat = access.chat;
        if (!chat.isGroup) {
            return res.status(400).json({
                success: false,
                message: "This chat is not a group chat"
            });
        }

        // Only group admin can remove members
        if (chat.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: Only the group admin can remove members"
            });
        }

        // Cannot remove the admin themselves
        if (memberId === chat.userId) {
            return res.status(400).json({
                success: false,
                message: "Cannot remove the group admin from the group"
            });
        }

        // Disconnect user
        const updatedChat = await prisma.chat.update({
            where: { id: chatId },
            data: {
                members: {
                    disconnect: { id: memberId }
                }
            },
            include: {
                members: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        createdAt: true
                    }
                }
            }
        });

        return res.status(200).json({
            success: true,
            message: "Member removed from group successfully",
            members: updatedChat.members
        });
    } catch (error) {
        console.log(`error at removeGroupMember controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Delete a single message (Chat participant only)
export async function deleteMessage(req, res) {
    const userId = req.user.id;
    const { messageId } = req.params;

    if (!messageId) {
        return res.status(400).json({
            success: false,
            message: "messageId is required"
        });
    }

    try {
        const message = await prisma.message.findUnique({
            where: { id: messageId }
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found"
            });
        }

        // Authorization: any participant of the chat can delete the message
        const access = await checkChatAccess(userId, message.chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message || "Forbidden: You are not authorized to delete messages in this chat"
            });
        }

        await prisma.message.delete({
            where: { id: messageId }
        });

        return res.status(200).json({
            success: true,
            message: "Message deleted successfully"
        });
    } catch (error) {
        console.log(`error at deleteMessage controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Edit a message (Sender only)
export async function editMessage(req, res) {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({
            success: false,
            message: "Text is required to edit the message"
        });
    }

    try {
        const message = await prisma.message.findUnique({
            where: { id: messageId }
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found"
            });
        }

        // Authorization check: only the sender of the message can edit it
        if (message.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: You can only edit your own messages"
            });
        }

        const updatedMessage = await prisma.message.update({
            where: { id: messageId },
            data: { text: text.trim() }
        });

        return res.status(200).json({
            success: true,
            message: "Message updated successfully",
            data: updatedMessage
        });
    } catch (error) {
        console.log(`error at editMessage controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Toggle reaction on a message
export async function toggleMessageReaction(req, res) {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
        return res.status(400).json({
            success: false,
            message: "Emoji is required"
        });
    }

    try {
        const message = await prisma.message.findUnique({
            where: { id: messageId }
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found"
            });
        }

        // Check if user has access to the chat room containing the message
        const access = await checkChatAccess(userId, message.chatId);
        if (!access.authorized) {
            return res.status(access.status).json({
                success: false,
                message: access.message || "Forbidden: You are not authorized to react in this chat"
            });
        }

        // Check if user already has this specific reaction on this message
        const existingReaction = await prisma.reaction.findUnique({
            where: {
                messageId_userId_emoji: {
                    messageId,
                    userId,
                    emoji
                }
            }
        });

        if (existingReaction) {
            // Remove the reaction
            await prisma.reaction.delete({
                where: { id: existingReaction.id }
            });
            return res.status(200).json({
                success: true,
                action: "removed",
                message: "Reaction removed successfully"
            });
        } else {
            // Add the reaction
            const newReaction = await prisma.reaction.create({
                data: {
                    emoji,
                    messageId,
                    userId
                },
                include: {
                    user: {
                        select: {
                            username: true
                        }
                    }
                }
            });
            return res.status(201).json({
                success: true,
                action: "added",
                message: "Reaction added successfully",
                data: newReaction
            });
        }
    } catch (error) {
        console.log(`error at toggleMessageReaction controller ${error}`);
        return res.status(500).json({
            success: false,
            message: error.message || "internal server error"
        });
    }
}

// Get counts of unread messages for DMs and groups
export async function getUnreadCounts(req, res) {
    const userId = req.user.id;

    try {
        // Find all chats the user belongs to
        const chats = await prisma.chat.findMany({
            where: {
                OR: [
                    { userId: userId },
                    { receiverId: userId },
                    {
                        members: {
                            some: { id: userId }
                        }
                    }
                ]
            },
            select: {
                id: true,
                isGroup: true
            }
        });

        const chatIds = chats.map((c) => c.id);

        // Fetch unread messages in those chats that were NOT sent by the current user
        const unreadMessages = await prisma.message.findMany({
            where: {
                chatId: { in: chatIds },
                userId: { not: userId },
                status: { not: "read" }
            },
            select: {
                id: true,
                chatId: true,
                userId: true,
                chat: {
                    select: {
                        isGroup: true
                    }
                }
            }
        });

        // Tally counts
        const dms = {};
        const groups = {};

        unreadMessages.forEach((msg) => {
            if (msg.chat.isGroup) {
                groups[msg.chatId] = (groups[msg.chatId] || 0) + 1;
            } else {
                // For DM, group by the sender's userId
                dms[msg.userId] = (dms[msg.userId] || 0) + 1;
            }
        });

        return res.status(200).json({
            success: true,
            dms,
            groups
        });
    } catch (error) {
        console.log("Error inside getUnreadCounts controller:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
}
