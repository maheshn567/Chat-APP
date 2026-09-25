import api from "./axios";

export async function getDefaultChat() {
    try {
        const response = await api.get("/chats/default");
        return response.data;
    } catch (error) {
        console.log(`error at getDefaultChat api ${error}`);
        throw error;
    }
}

export async function getOrCreatePrivateChat(receiverId) {
    try {
        const response = await api.post(`/chats/private/${receiverId}`);
        return response.data;
    } catch (error) {
        console.log(`error at getOrCreatePrivateChat api ${error}`);
        throw error;
    }
}

export async function getChatDetails(chatId) {
    try {
        const response = await api.get(`/chats/${chatId}`);
        return response.data;
    } catch (error) {
        console.log(`error at getChatDetails api ${error}`);
        throw error;
    }
}

export async function getAllMessages(chatId) {
    try {
        const response = await api.get(`/chats/${chatId}/messages`);
        return response.data;
    } catch (error) {
        console.log(`error at getmessage api ${error}`);
        throw error;
    }
}

export async function addMessage(chatId, text) {
    try {
        const response = await api.post(`/chats/${chatId}/messages`, { text });
        return response.data;
    } catch (error) {
        console.log(`error at add message api ${error}`);
        throw error;
    }
}

export async function createGroupChat(name, memberIds) {
    try {
        const response = await api.post("/chats/group", { name, memberIds });
        return response.data;
    } catch (error) {
        console.log(`error at createGroupChat api ${error}`);
        throw error;
    }
}

export async function getUserGroups() {
    try {
        const response = await api.get("/chats/groups");
        return response.data;
    } catch (error) {
        console.log(`error at getUserGroups api ${error}`);
        throw error;
    }
}

export async function addGroupMember(chatId, memberId) {
    try {
        const response = await api.post(`/chats/${chatId}/members`, { memberId });
        return response.data;
    } catch (error) {
        console.log(`error at addGroupMember api ${error}`);
        throw error;
    }
}

export async function deleteChat(chatId) {
    try {
        const response = await api.delete(`/chats/${chatId}`);
        return response.data;
    } catch (error) {
        console.log(`error at deleteChat api ${error}`);
        throw error;
    }
}

export async function removeGroupMember(chatId, memberId) {
    try {
        const response = await api.delete(`/chats/${chatId}/members/${memberId}`);
        return response.data;
    } catch (error) {
        console.log(`error at removeGroupMember api ${error}`);
        throw error;
    }
}

export async function deleteMessage(messageId) {
    try {
        const response = await api.delete(`/messages/${messageId}`);
        return response.data;
    } catch (error) {
        console.log(`error at deleteMessage api ${error}`);
        throw error;
    }
}

export async function editMessage(messageId, text) {
    try {
        const response = await api.put(`/messages/${messageId}`, { text });
        return response.data;
    } catch (error) {
        console.log(`error at editMessage api ${error}`);
        throw error;
    }
}

export async function toggleMessageReaction(messageId, emoji) {
    try {
        const response = await api.post(`/messages/${messageId}/react`, { emoji });
        return response.data;
    } catch (error) {
        console.log(`error at toggleMessageReaction api ${error}`);
        throw error;
    }
}

export async function getUnreadCounts() {
    try {
        const response = await api.get("/chats/unread-counts");
        return response.data;
    } catch (error) {
        console.log(`error at getUnreadCounts api ${error}`);
        throw error;
    }
}

export async function uploadFile(formData) {
    try {
        const response = await api.post("/upload", formData, {
            headers: {
                "Content-Type": "multipart/form-data"
            }
        });
        return response.data;
    } catch (error) {
        console.log(`error at uploadFile api ${error}`);
        throw error;
    }
}