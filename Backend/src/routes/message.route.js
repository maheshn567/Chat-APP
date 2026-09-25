import { Router } from "express";
import { 
    getAllMessages, 
    addMessage, 
    getDefaultChat, 
    getOrCreatePrivateChat, 
    getChatDetails,
    createGroupChat,
    getUserGroups,
    addGroupMember,
    deleteChat,
    removeGroupMember,
    deleteMessage,
    editMessage,
    toggleMessageReaction,
    getUnreadCounts
} from "../controller/message.controller.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { 
    validate, 
    createGroupSchema, 
    addMessageSchema, 
    editMessageSchema, 
    toggleReactionSchema, 
    addMemberSchema, 
    chatIdParamSchema, 
    messageIdParamSchema, 
    receiverIdParamSchema, 
    memberParamSchema 
} from "../Validation/validation.js";

const router = Router();

// Routes for chats and messages
router.get("/chats/default", authMiddleware, getDefaultChat);
router.post("/chats/group", authMiddleware, validate({ body: createGroupSchema }), createGroupChat);
router.get("/chats/groups", authMiddleware, getUserGroups);
router.get("/chats/unread-counts", authMiddleware, getUnreadCounts);
router.post("/chats/private/:receiverId", authMiddleware, validate({ params: receiverIdParamSchema }), getOrCreatePrivateChat);
router.get("/chats/:chatId", authMiddleware, validate({ params: chatIdParamSchema }), getChatDetails);
router.get("/chats/:chatId/messages", authMiddleware, validate({ params: chatIdParamSchema }), getAllMessages);
router.post("/chats/:chatId/messages", authMiddleware, validate({ body: addMessageSchema, params: chatIdParamSchema }), addMessage);
router.post("/chats/:chatId/members", authMiddleware, validate({ body: addMemberSchema, params: chatIdParamSchema }), addGroupMember);
router.delete("/chats/:chatId", authMiddleware, validate({ params: chatIdParamSchema }), deleteChat);
router.delete("/chats/:chatId/members/:memberId", authMiddleware, validate({ params: memberParamSchema }), removeGroupMember);
router.delete("/messages/:messageId", authMiddleware, validate({ params: messageIdParamSchema }), deleteMessage);
router.put("/messages/:messageId", authMiddleware, validate({ body: editMessageSchema, params: messageIdParamSchema }), editMessage);
router.post("/messages/:messageId/react", authMiddleware, validate({ body: toggleReactionSchema, params: messageIdParamSchema }), toggleMessageReaction);

export default router;
