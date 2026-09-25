import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../../context/Auth.context.jsx";
import socket from "../../../socket.js";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { getAllMessages, addMessage, getChatDetails, addGroupMember, removeGroupMember, deleteMessage, editMessage, toggleMessageReaction, uploadFile } from "../../apis/message.api.js";
import { getAllUser } from "../../apis/login.api.js";
import Avatar from "../../components/Avatar";
import Input from "../../components/Input";
import Button from "../../components/Button";
import Modal from "../../components/Modal";

const formatLastSeen = (dateString) => {
    if (!dateString) return "recently";
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return "just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (e) {
        return "recently";
    }
};

export default function Chat() {
    const { chatId } = useParams();
    const navigate = useNavigate();
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([]);
    const { user } = useContext(AuthContext);
    const { 
        selectedUserId, 
        setSelectedUserId, 
        allUser, 
        setAllUser, 
        error, 
        setError 
    } = useOutletContext();

    const [isGroup, setIsGroup] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [isRecipientProfileOpen, setIsRecipientProfileOpen] = useState(false);
    const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
    const [groupMembers, setGroupMembers] = useState([]);
    const [groupAdminId, setGroupAdminId] = useState("");
    const [typingUsers, setTypingUsers] = useState({});
    const [isTyping, setIsTyping] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState("");
    const [editText, setEditText] = useState("");
    const [isFileUploading, setIsFileUploading] = useState(false);

    const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

    useEffect(() => {
        setIsRecipientProfileOpen(false);
        setIsGroupInfoOpen(false);
    }, [chatId]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => {
                setError(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [error, setError]);

    const handleAddGroupMemberDirect = async (memberId) => {
        if (!memberId || !chatId) return;
        try {
            const res = await addGroupMember(chatId, memberId);
            if (res.success && res.members) {
                setGroupMembers(res.members);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to add member to group");
        }
    };

    const handleRemoveGroupMember = async (memberId) => {
        if (!memberId || !chatId) return;
        const memberName = groupMembers.find(m => m.id === memberId)?.username || "this user";
        if (!window.confirm(`Are you sure you want to remove ${memberName} from this group?`)) return;

        try {
            const res = await removeGroupMember(chatId, memberId);
            if (res.success && res.members) {
                setGroupMembers(res.members);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to remove member from group");
        }
    };

    const nonGroupUsers = allUser.filter(
        (u) => u.id !== user?.id && !groupMembers.some((m) => m.id === u.id)
    );

    useEffect(() => {
        async function loadMessages() {
            if (chatId) {
                try {
                    const res = await getAllMessages(chatId);
                    if (res.success) {
                        setMessages(res.data);
                        socket.emit("readAllMessages", { chatId });
                    }

                    const chatRes = await getChatDetails(chatId);
                    if (chatRes.success && chatRes.chat) {
                        const { userId: creatorId, receiverId, isGroup: groupFlag, name, members } = chatRes.chat;
                        setIsGroup(groupFlag);
                        setGroupName(name || "");
                        setGroupAdminId(creatorId || "");
                        setGroupMembers(members || []);
                        if (groupFlag) {
                            setSelectedUserId(chatId);
                        } else if (receiverId) {
                            const otherUser = creatorId === user?.id ? receiverId : creatorId;
                            setSelectedUserId(otherUser);
                        } else {
                            setSelectedUserId("");
                        }
                    }
                } catch (err) {
                    setError(err.response?.data?.message || "Failed to fetch messages");
                }
            } else {
                setSelectedUserId("");
                setIsGroup(false);
                setGroupName("");
                setGroupAdminId("");
                setGroupMembers([]);
                setMessages([]);
            }
        }
        async function getAllUsers() {
            try {
                const res = await getAllUser();
                if (res.data && res.data.success) {
                    setAllUser(res.data.data);
                }
            } catch(err) {
                setError("Failed to load users");
            }
        }
        loadMessages();
        getAllUsers();
    }, [chatId, user, navigate]);

    useEffect(() => {
        socket.on("connect", () => {
            console.log("socket connected:", socket.id);
        });

        socket.on("message", (message) => {
            if (chatId && !selectedUserId && !isGroup) {
                setMessages((prev) => [...prev, message]);
            }
        });

        socket.on("receiveMessage", (data) => {
            if (chatId && chatId === data.chatId) {
                setMessages((prev) => {
                    if (prev.some((m) => m.id === data.id)) return prev;
                    return [...prev, data];
                });
                // Automatically mark as read if viewing this chat
                socket.emit("readMessageSingle", { messageId: data.id, chatId: data.chatId });
            } else {
                // If not viewing this chat, mark as delivered
                socket.emit("deliverMessageSingle", { messageId: data.id, chatId: data.chatId });
            }
        });

        socket.on("messageDeleted", (data) => {
            if (chatId && chatId === data.chatId) {
                setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
            }
        });

        socket.on("typing", ({ chatId: eventChatId, userId, isTyping }) => {
            if (chatId && chatId === eventChatId) {
                setTypingUsers((prev) => ({
                    ...prev,
                    [userId]: isTyping
                }));
            }
        });

        socket.on("messagesRead", (data) => {
            if (chatId && chatId === data.chatId) {
                setMessages((prev) =>
                    prev.map((m) => {
                        const senderId = m.userId || m.from;
                        if (senderId === user?.id) {
                            return { ...m, status: "read" };
                        }
                        return m;
                    })
                );
            }
        });

        socket.on("messageStatusUpdated", (data) => {
            if (chatId && chatId === data.chatId) {
                setMessages((prev) =>
                    prev.map((m) => (m.id === data.messageId ? { ...m, status: data.status } : m))
                );
            }
        });

        socket.on("messageReactionUpdated", (data) => {
            if (chatId && chatId === data.chatId) {
                setMessages((prev) =>
                    prev.map((m) => {
                        if (m.id === data.messageId) {
                            const reactions = m.reactions || [];
                            if (data.action === "removed") {
                                return {
                                    ...m,
                                    reactions: reactions.filter(
                                        (r) => !(r.userId === data.userId && r.emoji === data.emoji)
                                    )
                                };
                            } else {
                                return {
                                    ...m,
                                    reactions: [
                                        ...reactions,
                                        {
                                            emoji: data.emoji,
                                            userId: data.userId,
                                            user: { username: data.username }
                                        }
                                    ]
                                };
                            }
                        }
                        return m;
                    })
                );
            }
        });

        socket.on("messageEdited", (data) => {
            if (chatId && chatId === data.chatId) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === data.messageId
                            ? { ...m, text: data.text, updatedAt: new Date() }
                            : m
                    )
                );
            }
        });

        socket.on("newFile", (data) => {
            const isForCurrentChat = isGroup 
                ? (data.chatId === chatId) 
                : (data.from === selectedUserId);

            if (isForCurrentChat) {
                const textContent = JSON.stringify({
                    type: "file",
                    fileUrl: data.fileUrl,
                    fileType: data.fileType,
                    filename: data.filename
                });

                const fileMessage = {
                    id: data.id || `temp-${new Date().getTime()}`,
                    text: textContent,
                    chatId: data.chatId || chatId,
                    userId: data.from,
                    status: "delivered",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                setMessages((prev) => {
                    if (prev.some((m) => m.id === fileMessage.id)) return prev;
                    return [...prev, fileMessage];
                });
                if (fileMessage.id && !fileMessage.id.startsWith("temp-")) {
                    socket.emit("readMessageSingle", { messageId: fileMessage.id, chatId: chatId });
                }
            }
        });

        if (user) {
            socket.emit("join", user);
        }

        if (chatId) {
            socket.emit("joinRoom", chatId);
        }

        return () => {
            socket.off("connect");
            socket.off("message");
            socket.off("receiveMessage");
            socket.off("messageDeleted");
            socket.off("typing");
            socket.off("messagesRead");
            socket.off("messageStatusUpdated");
            socket.off("messageReactionUpdated");
            socket.off("messageEdited");
            socket.off("newFile");
            if (chatId) {
                socket.emit("leaveRoom", chatId);
            }
        };
    }, [user, chatId, selectedUserId, isGroup]);

    useEffect(() => {
        if (!input.trim() || !chatId) {
            if (isTyping) {
                setIsTyping(false);
                socket.emit("typing", { chatId, isTyping: false });
            }
            return;
        }

        if (!isTyping) {
            setIsTyping(true);
            socket.emit("typing", { chatId, isTyping: true });
        }

        const timer = setTimeout(() => {
            setIsTyping(false);
            socket.emit("typing", { chatId, isTyping: false });
        }, 3000);

        return () => clearTimeout(timer);
    }, [input, chatId]);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file || !chatId) return;

        e.target.value = null;
        setIsFileUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const uploadRes = await uploadFile(formData);
            if (uploadRes.success) {
                const { url, type, filename } = uploadRes;
                
                const fileMessageText = JSON.stringify({
                    type: "file",
                    fileUrl: url,
                    fileType: type,
                    filename: filename
                });

                const res = await addMessage(chatId, fileMessageText);
                if (res.success && res.data) {
                    const savedMsg = res.data;
                    setMessages((prev) => [...prev, savedMsg]);

                    if (selectedUserId && !isGroup) {
                        socket.emit("sendFile", '', selectedUserId, url, type, filename, savedMsg.id);
                    } else if (isGroup) {
                        socket.emit("sendFile", chatId, '', url, type, filename, savedMsg.id);
                    }
                } else {
                    setError(res.message || "Failed to send file message");
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to upload file");
        } finally {
            setIsFileUploading(false);
        }
    };

    async function handleSubmit(e) {
        e.preventDefault();
        if (!input.trim() || !chatId) return;

        const currentInput = input;
        setInput("");

        try {
            const res = await addMessage(chatId, currentInput);
            if (res.success && res.data) {
                const savedMsg = res.data;
                setMessages((prev) => [...prev, savedMsg]);

                if (selectedUserId && !isGroup) {
                    socket.emit("sendMessage", { 
                        userId: selectedUserId, 
                        message: currentInput, 
                        chatId: chatId, 
                        messageId: savedMsg.id 
                    });
                } else if (isGroup) {
                    socket.emit("sendMessage", { 
                        message: currentInput, 
                        chatId: chatId, 
                        messageId: savedMsg.id 
                    });
                } else {
                    socket.emit("message", currentInput);
                }
            } else {
                setError(res.message || "Failed to send message");
            }
        } catch (err) {
            setError("Failed to send message");
        }
    }

    const handleDeleteMessage = async (messageId) => {
        if (!messageId) return;
        if (!window.confirm("Are you sure you want to delete this message?")) return;

        try {
            const res = await deleteMessage(messageId);
            if (res.success) {
                setMessages((prev) => prev.filter((m) => m.id !== messageId));
                socket.emit("deleteMessage", { messageId, chatId });
            } else {
                setError(res.message || "Failed to delete message");
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete message");
        }
    };

    const handleEditSubmit = async (e, messageId) => {
        e.preventDefault();
        if (!editText.trim() || !messageId) return;

        try {
            const res = await editMessage(messageId, editText.trim());
            if (res.success) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === messageId ? { ...m, text: editText.trim(), updatedAt: new Date() } : m
                    )
                );
                
                socket.emit("messageEdited", {
                    messageId,
                    text: editText.trim(),
                    chatId
                });

                setEditingMessageId("");
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to edit message");
        }
    };

    const handleToggleReaction = async (messageId, emoji) => {
        if (!messageId || !emoji) return;

        try {
            const res = await toggleMessageReaction(messageId, emoji);
            if (res.success) {
                setMessages((prev) =>
                    prev.map((m) => {
                        if (m.id === messageId) {
                            const reactions = m.reactions || [];
                            if (res.action === "removed") {
                                return {
                                    ...m,
                                    reactions: reactions.filter(
                                        (r) => !(r.userId === user.id && r.emoji === emoji)
                                    )
                                };
                            } else {
                                return {
                                    ...m,
                                    reactions: [
                                        ...reactions,
                                        {
                                            emoji,
                                            userId: user.id,
                                            user: { username: user.username }
                                        }
                                    ]
                                };
                            }
                        }
                        return m;
                    })
                );

                socket.emit("messageReaction", {
                    messageId,
                    userId: user.id,
                    username: user.username,
                    emoji,
                    action: res.action,
                    chatId
                });
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to update reaction");
        }
    };

    const getUsernameById = (id) => {
        if (!id) return "System";
        if (id === user?.id) return user.username;
        const found = allUser.find((u) => u.id === id);
        return found ? found.username : "User";
    };

    return (
        <section className="flex-1 flex flex-col bg-brand-background overflow-hidden relative">
            {error && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-900/80 border border-red-500 text-red-100 text-sm px-4 py-2 rounded-brand-md shadow-lg z-50 backdrop-blur-sm">
                    {error}
                </div>
            )}

            {chatId ? (
                <>
                    {/* Header */}
                    <header className="h-16 border-b border-brand-outline-variant/10 bg-brand-surface px-6 flex items-center justify-between shrink-0">
                        <div 
                            onClick={() => {
                                if (selectedUserId && !isGroup) {
                                    setIsRecipientProfileOpen(true);
                                } else if (isGroup) {
                                    setIsGroupInfoOpen(true);
                                }
                            }}
                            className={`flex items-center gap-3 ${((selectedUserId && !isGroup) || isGroup) ? "cursor-pointer hover:opacity-85 select-none active:scale-98 transition-all" : ""}`}
                        >
                            {isGroup
                                ? (
                                    <div className="w-10 h-10 rounded-full bg-brand-surface-container flex items-center justify-center font-bold text-brand-primary border border-brand-outline-variant/20">
                                        G
                                    </div>
                                )
                                : selectedUserId && allUser.find(u => u.id === selectedUserId)
                                ? <Avatar name={allUser.find(u => u.id === selectedUserId)?.username} size="md" />
                                : (
                                    <div className="w-10 h-10 rounded-full bg-brand-surface-container flex items-center justify-center font-bold text-brand-primary border border-brand-outline-variant/20">
                                        #
                                    </div>
                                )
                            }
                            <div>
                                <h2 className="font-semibold text-brand-on-surface">
                                    {isGroup
                                        ? groupName
                                        : selectedUserId && allUser.find(u => u.id === selectedUserId)
                                        ? allUser.find(u => u.id === selectedUserId)?.username 
                                        : "Global Room"
                                    }
                                </h2>
                                <p className="text-xs text-brand-on-surface-variant font-medium flex items-center gap-1.5">
                                    {isGroup ? (
                                        "Private Group Chat"
                                    ) : selectedUserId && allUser.find(u => u.id === selectedUserId) ? (
                                        (() => {
                                            const chatUser = allUser.find(u => u.id === selectedUserId);
                                            if (chatUser?.status === "online") {
                                                return (
                                                    <>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse"></span>
                                                        <span className="text-green-500 font-semibold">Online</span>
                                                    </>
                                                );
                                            } else {
                                                return `Last seen ${formatLastSeen(chatUser?.lastSeen)}`;
                                            }
                                        })()
                                    ) : (
                                        "Open discussion channel"
                                    )}
                                </p>
                            </div>
                        </div>
                    </header>

                    {/* Messages Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col bg-brand-background custom-scrollbar">
                        {messages.map((message, index) => {
                            const senderId = message.userId || message.from;
                            const isMe = senderId === user?.id;
                            const senderName = getUsernameById(senderId);
                            const textContent = message.text || message.message || (typeof message === 'string' ? message : '');
                            
                            let isFileMessage = false;
                            let fileData = null;
                            if (textContent && textContent.startsWith('{') && textContent.endsWith('}')) {
                                try {
                                    const parsed = JSON.parse(textContent);
                                    if (parsed.type === "file" && parsed.fileUrl) {
                                        isFileMessage = true;
                                        fileData = parsed;
                                    }
                                } catch (e) {
                                    // Ignore JSON parsing errors
                                }
                            }

                            return (
                                <div key={message.id || index} className={`flex gap-3 max-w-[70%] group ${isMe ? "self-end flex-row-reverse" : "self-start"}`}>
                                    {!isMe && <Avatar name={senderName} size="md" />}
                                    <div className="flex flex-col relative">
                                        <span className={`text-[10px] font-semibold tracking-wider text-brand-on-surface-variant mb-1 px-1 ${isMe ? "text-right" : "text-left"}`}>
                                            {senderName}
                                        </span>
                                        <div className={`flex items-center gap-2 relative group/bubble ${isMe ? "flex-row-reverse" : ""}`}>
                                            {/* Emoji Picker Bar (on hover of the bubble) */}
                                            {message.id && editingMessageId !== message.id && (
                                                <div className={`absolute -top-7 ${isMe ? "left-0" : "right-0"} bg-brand-surface-container border border-brand-outline-variant/30 rounded-full px-2 py-0.5 flex gap-1 shadow-lg opacity-0 group-hover/bubble:opacity-100 transition-all duration-200 z-30 select-none`}>
                                                    {EMOJIS.map((emoji) => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => handleToggleReaction(message.id, emoji)}
                                                            className="hover:scale-125 transition-transform duration-100 p-0.5 cursor-pointer text-xs"
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Asymmetric Rounded Message Bubbles */}
                                            <div className={`px-4 py-3 text-sm leading-relaxed ${
                                                isMe 
                                                ? "bg-brand-primary text-white rounded-brand-lg rounded-tr-brand-sm shadow-md shadow-brand-primary/5" 
                                                : "bg-brand-surface-container text-brand-on-surface rounded-brand-lg rounded-tl-brand-sm border border-brand-outline-variant/20"
                                            }`}>
                                                <div className="flex flex-col gap-1">
                                                    {editingMessageId === message.id ? (
                                                        <form onSubmit={(e) => handleEditSubmit(e, message.id)} className="flex flex-col gap-2 min-w-[200px] py-1 select-none">
                                                            <input
                                                                type="text"
                                                                value={editText}
                                                                onChange={(e) => setEditText(e.target.value)}
                                                                className="w-full bg-black/10 border border-white/20 text-white text-sm px-2.5 py-1.5 rounded focus:outline-none focus:border-white/50"
                                                                autoFocus
                                                            />
                                                            <div className="flex justify-end gap-1.5 text-xs">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingMessageId("")}
                                                                    className="px-2 py-1 rounded text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    type="submit"
                                                                    className="px-2.5 py-1 rounded bg-white text-brand-primary hover:bg-white/95 font-semibold cursor-pointer transition-colors"
                                                                >
                                                                    Save
                                                                </button>
                                                            </div>
                                                        </form>
                                                    ) : (
                                                        <>
                                                            {isFileMessage && fileData ? (
                                                                fileData.fileType.startsWith("image/") || fileData.fileType === "image" ? (
                                                                    <div className="max-w-xs overflow-hidden rounded-brand-md border border-white/10 mt-1 cursor-pointer select-none">
                                                                        <img 
                                                                            src={fileData.fileUrl} 
                                                                            alt={fileData.filename || "Image"} 
                                                                            className="w-full h-auto object-cover max-h-60 hover:scale-[1.02] transition-transform duration-200" 
                                                                            onClick={() => window.open(fileData.fileUrl, '_blank')} 
                                                                        />
                                                                        <span className="text-[10px] text-brand-on-surface-variant/80 mt-1.5 block px-1 truncate">{fileData.filename}</span>
                                                                    </div>
                                                                ) : (
                                                                    <a 
                                                                        href={fileData.fileUrl} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                        className={`flex items-center gap-3 border rounded-brand-lg p-3 mt-1 max-w-xs transition-all no-underline text-brand-on-surface hover:text-white ${
                                                                            isMe 
                                                                            ? "bg-black/10 hover:bg-black/20 border-white/10" 
                                                                            : "bg-brand-surface-container/60 hover:bg-brand-surface-container border-brand-outline-variant/30"
                                                                        }`}
                                                                    >
                                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isMe ? "bg-white/10 text-white" : "bg-brand-primary/10 text-brand-primary"}`}>
                                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                            </svg>
                                                                        </div>
                                                                        <div className="overflow-hidden flex-1">
                                                                            <div className="text-xs font-semibold truncate">{fileData.filename}</div>
                                                                            <div className="text-[10px] opacity-65 uppercase font-bold tracking-wider mt-0.5">{fileData.fileType || "FILE"}</div>
                                                                        </div>
                                                                    </a>
                                                                )
                                                            ) : (
                                                                <div>{textContent}</div>
                                                            )}
                                                            <div className={`flex items-center gap-1.5 text-[9px] select-none mt-1 ${isMe ? "justify-end text-white/60" : "justify-end text-brand-on-surface-variant/65"}`}>
                                                                {message.updatedAt && (new Date(message.updatedAt) - new Date(message.createdAt) > 1000) && (
                                                                    <span className="font-medium italic opacity-75">(edited)</span>
                                                                )}
                                                                <span>
                                                                    {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                                                                </span>
                                                                {isMe && message.id && (
                                                                    <span>
                                                                        {message.status === "read" ? (
                                                                            <svg className="w-3.5 h-3.5 text-blue-200 fill-current" viewBox="0 0 24 24">
                                                                                <path d="M0.282 12.282c-0.376-0.376-0.376-0.985 0-1.361l1.361-1.361c0.376-0.376 0.985-0.376 1.361 0l4.382 4.382 10.972-10.972c0.376-0.376 0.985-0.376 1.361 0l1.361 1.361c0.376 0.376 0.376 0.985 0 1.361l-13 13c-0.376 0.376-0.985 0.376-1.361 0l-5.782-5.782z M7.782 16.361l3.3-3.3-1.361-1.361-3.3 3.3 1.361 1.361z" />
                                                                            </svg>
                                                                        ) : message.status === "delivered" ? (
                                                                            <svg className="w-3.5 h-3.5 opacity-80 fill-current" viewBox="0 0 24 24">
                                                                                <path d="M0.282 12.282c-0.376-0.376-0.376-0.985 0-1.361l1.361-1.361c0.376-0.376 0.985-0.376 1.361 0l4.382 4.382 10.972-10.972c0.376-0.376 0.985-0.376 1.361 0l1.361 1.361c0.376 0.376 0.376 0.985 0 1.361l-13 13c-0.376 0.376-0.985 0.376-1.361 0l-5.782-5.782z" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg className="w-3.5 h-3.5 opacity-80 fill-current" viewBox="0 0 24 24">
                                                                                <path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z" />
                                                                            </svg>
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {isMe && message.id && editingMessageId !== message.id && !isFileMessage && (
                                                <button
                                                    onClick={() => {
                                                        setEditingMessageId(message.id);
                                                        setEditText(textContent);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-brand-surface-container-high text-brand-on-surface-variant hover:text-brand-primary transition-all duration-200 cursor-pointer shrink-0"
                                                    title="Edit message"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                            )}

                                            {message.id && (
                                                <button
                                                    onClick={() => handleDeleteMessage(message.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-brand-surface-container-high text-brand-on-surface-variant hover:text-red-400 transition-all duration-200 cursor-pointer shrink-0"
                                                    title="Delete message"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>

                                        {/* Reactions Badges */}
                                        {(() => {
                                            const grouped = (message.reactions || []).reduce((acc, curr) => {
                                                if (!acc[curr.emoji]) acc[curr.emoji] = [];
                                                acc[curr.emoji].push(curr);
                                                return acc;
                                            }, {});

                                            if (Object.keys(grouped).length === 0) return null;

                                            return (
                                                <div className={`flex flex-wrap gap-1 mt-1 z-10 ${isMe ? "justify-end" : "justify-start"}`}>
                                                    {Object.entries(grouped).map(([emoji, list]) => {
                                                        const hasReacted = list.some((r) => r.userId === user?.id);
                                                        const userList = list.map((r) => r.user?.username || "User").join(", ");
                                                        return (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => handleToggleReaction(message.id, emoji)}
                                                                title={`Reacted by: ${userList}`}
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all cursor-pointer select-none ${
                                                                    hasReacted
                                                                    ? "bg-brand-primary/15 border-brand-primary text-brand-primary"
                                                                    : "bg-brand-surface-container/60 border-brand-outline-variant/30 text-brand-on-surface-variant hover:border-brand-outline"
                                                                }`}
                                                            >
                                                                <span>{emoji}</span>
                                                                <span>{list.length}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Typing indicator line */}
                    {(() => {
                        const activeTypers = Object.entries(typingUsers)
                            .filter(([id, typing]) => typing && id !== user?.id)
                            .map(([id]) => getUsernameById(id));
                        
                        if (activeTypers.length === 0) return null;
                        
                        return (
                            <div className="px-6 py-1.5 text-xs text-brand-on-surface-variant italic flex items-center gap-1.5 bg-brand-surface border-t border-brand-outline-variant/10 select-none">
                                <span className="flex gap-1 items-center justify-center py-0.5">
                                    <span className="w-1.5 h-1.5 bg-brand-on-surface-variant/70 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                    <span className="w-1.5 h-1.5 bg-brand-on-surface-variant/70 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                    <span className="w-1.5 h-1.5 bg-brand-on-surface-variant/70 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                                </span>
                                <span>{activeTypers.join(", ")} {activeTypers.length === 1 ? "is" : "are"} typing...</span>
                            </div>
                        );
                    })()}

                    {/* Message Input Footer */}
                    {isFileUploading && (
                        <div className="px-6 py-2.5 text-xs text-brand-primary flex items-center gap-2 bg-brand-surface border-t border-brand-outline-variant/10 select-none animate-pulse">
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="font-semibold">Uploading file, please wait...</span>
                        </div>
                    )}
                    <footer className="p-4 bg-brand-surface border-t border-brand-outline-variant/10 shrink-0">
                        <form onSubmit={handleSubmit} className="flex items-center gap-3">
                            <input
                                type="file"
                                id="chat-file-input"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <button
                                type="button"
                                onClick={() => document.getElementById("chat-file-input").click()}
                                className="p-3 rounded-full bg-brand-surface-container hover:bg-brand-surface-container-high text-brand-on-surface-variant hover:text-brand-primary transition-all cursor-pointer shrink-0"
                                title="Attach file"
                            >
                                <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                            </button>
                            <Input
                                className="flex-1"
                                type="text"
                                placeholder={
                                    isGroup 
                                        ? `Message ${groupName}...` 
                                        : selectedUserId && allUser.find(u => u.id === selectedUserId)
                                        ? `Message ${allUser.find(u => u.id === selectedUserId)?.username}...` 
                                        : "Send a message to global room..."
                                }
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                            />
                            <Button type="submit" className="flex items-center justify-center p-3 rounded-full shrink-0">
                                <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </Button>
                        </form>
                    </footer>
                </>
            ) : (
                /* Placeholder Empty State */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-brand-background">
                    <div className="w-16 h-16 rounded-full bg-brand-surface flex items-center justify-center text-brand-primary mb-4 border border-brand-outline-variant/25 shadow-xl shadow-brand-primary/5">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-brand-on-surface">Select a conversation</h2>
                    <p className="text-sm text-brand-on-surface-variant max-w-sm mt-2">
                        Pick a direct message thread or join a group to start communicating with friends.
                    </p>
                </div>
            )}

            {/* Recipient Profile Modal */}
            <Modal
                isOpen={isRecipientProfileOpen}
                onClose={() => setIsRecipientProfileOpen(false)}
                title="User Profile"
            >
                {(() => {
                    const recipient = allUser.find((u) => u.id === selectedUserId);
                    if (!recipient) return <p className="text-sm text-brand-on-surface-variant text-center py-4">Loading profile details...</p>;
                    
                    return (
                        <div className="flex flex-col items-center text-center p-4">
                            <div className="relative mb-6">
                                <Avatar name={recipient.username} size="xl" />
                            </div>

                            <h2 className="text-2xl font-bold tracking-tight text-brand-on-surface mb-6">
                                {recipient.username}
                            </h2>

                            <div className="w-full space-y-4 text-left border-t border-brand-outline-variant/30 pt-6">
                                <div>
                                    <span className="block text-[10px] font-semibold text-brand-on-surface-variant/60 uppercase tracking-widest mb-1">
                                        Email Address
                                    </span>
                                    <span className="text-sm font-semibold text-brand-on-surface bg-brand-background/40 border border-brand-outline-variant/10 px-3 py-2.5 rounded-lg block truncate">
                                        {recipient.email || "N/A"}
                                    </span>
                                </div>

                                <div>
                                    <span className="block text-[10px] font-semibold text-brand-on-surface-variant/60 uppercase tracking-widest mb-1">
                                        Member Since
                                    </span>
                                    <span className="text-sm font-semibold text-brand-on-surface bg-brand-background/40 border border-brand-outline-variant/10 px-3 py-2.5 rounded-lg block">
                                        {recipient.createdAt ? new Date(recipient.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : "N/A"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })()}
                <div className="flex justify-end mt-6 border-t border-brand-outline-variant/20 pt-4">
                    <Button variant="primary" onClick={() => setIsRecipientProfileOpen(false)} className="w-full">Close</Button>
                </div>
            </Modal>

            {/* Group Info Modal */}
            <Modal
                isOpen={isGroupInfoOpen}
                onClose={() => setIsGroupInfoOpen(false)}
                title="Group Details"
            >
                <div className="p-2 space-y-6">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center font-bold text-3xl text-brand-primary border border-brand-primary/20 mb-4 shadow-lg shadow-brand-primary/5">
                            G
                        </div>
                        <h2 className="text-xl font-bold text-brand-on-surface">{groupName}</h2>
                        <p className="text-xs text-brand-on-surface-variant font-medium mt-1">
                            Admin: {allUser.find((u) => u.id === groupAdminId)?.username || "System"}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <span className="block text-[10px] font-semibold text-brand-on-surface-variant/60 uppercase tracking-widest ml-1">
                            Group Members ({groupMembers.length})
                        </span>
                        <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            {groupMembers.map((m) => (
                                <div
                                    key={m.id}
                                    className="flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-background border border-brand-outline-variant/10"
                                >
                                    <Avatar name={m.username} size="sm" />
                                    <div className="flex-1 overflow-hidden">
                                        <span className="text-sm font-semibold text-brand-on-surface block truncate">
                                            {m.username}
                                        </span>
                                        <span className="text-[10px] text-brand-on-surface-variant block truncate">
                                            {m.email}
                                        </span>
                                    </div>
                                    {m.id === groupAdminId ? (
                                        <span className="text-[9px] font-bold text-brand-primary bg-brand-primary/10 border border-brand-primary/25 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                            Admin
                                        </span>
                                    ) : (
                                        user?.id === groupAdminId && (
                                            <button 
                                                onClick={() => handleRemoveGroupMember(m.id)}
                                                className="text-[11px] font-bold text-red-500 hover:text-white hover:bg-red-500/90 border border-red-500/25 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                                                title="Remove Member"
                                            >
                                                Remove
                                            </button>
                                        )
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-brand-outline-variant/30 pt-4 space-y-3">
                        {nonGroupUsers.length > 0 ? (
                            <div className="space-y-2">
                                <span className="block text-[10px] font-semibold text-brand-on-surface-variant/60 uppercase tracking-widest ml-1 mb-2">
                                    Add New Members
                                </span>
                                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {nonGroupUsers.map((u) => (
                                        <label 
                                            key={u.id}
                                            className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-brand-background hover:bg-brand-surface-container/60 cursor-pointer transition-all select-none border border-brand-outline-variant/10"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar name={u.username} size="sm" />
                                                <div className="overflow-hidden">
                                                    <span className="text-sm font-semibold text-brand-on-surface block truncate">{u.username}</span>
                                                    <span className="text-[10px] text-brand-on-surface-variant block truncate">{u.email}</span>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={false}
                                                onChange={() => handleAddGroupMemberDirect(u.id)}
                                                className="rounded border-brand-outline text-brand-primary focus:ring-0 w-4.5 h-4.5 bg-brand-surface cursor-pointer"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-brand-on-surface-variant/50 text-center py-2">
                                All registered users are already members of this group.
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex justify-end mt-6 border-t border-brand-outline-variant/20 pt-4">
                    <Button variant="primary" onClick={() => setIsGroupInfoOpen(false)} className="w-full">Close</Button>
                </div>
            </Modal>
        </section>
    );
}
