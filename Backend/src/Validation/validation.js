import z from 'zod';

// Schema for registration payload
export const registerSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters long").trim(),
    email: z.string().email("Invalid email format").trim(),
    password: z.string().min(6, "Password must be at least 6 characters long")
});

// Schema for login payload
export const loginSchema = z.object({
    email: z.string().email("Invalid email format").trim(),
    password: z.string().min(1, "Password is required")
});

// Schema for group creation payload
export const createGroupSchema = z.object({
    name: z.string().min(1, "Group name is required").trim(),
    memberIds: z.array(z.string().uuid("Invalid member user ID format")).optional()
});

// Schema for adding message payload
export const addMessageSchema = z.object({
    text: z.string().min(1, "Message text is required")
});

// Schema for editing message payload
export const editMessageSchema = z.object({
    text: z.string().min(1, "Text is required to edit the message")
});

// Schema for toggling reaction payload
export const toggleReactionSchema = z.object({
    emoji: z.string().min(1, "Emoji is required")
});

// Schema for adding group member payload
export const addMemberSchema = z.object({
    memberId: z.string().uuid("Invalid user ID format")
});

// Parameter Validation Schemas (UUID checks)
export const chatIdParamSchema = z.object({
    chatId: z.string().uuid("Invalid chat ID format")
});

export const messageIdParamSchema = z.object({
    messageId: z.string().uuid("Invalid message ID format")
});

export const receiverIdParamSchema = z.object({
    receiverId: z.string().uuid("Invalid receiver ID format")
});

export const memberParamSchema = z.object({
    chatId: z.string().uuid("Invalid chat ID format"),
    memberId: z.string().uuid("Invalid member ID format")
});

// Express validation middleware
export const validate = (schemas) => {
    return (req, res, next) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query);
            }
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                const errorMessages = error.errors.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: errorMessages
                });
            }
            next(error);
        }
    };
};
