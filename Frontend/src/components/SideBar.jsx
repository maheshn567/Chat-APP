import { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/Auth.context.jsx";
import { useNavigate, Outlet } from "react-router-dom";
import { logOut, getAllUser } from "../apis/login.api.js";
import { getOrCreatePrivateChat, getDefaultChat, createGroupChat, getUserGroups, deleteChat, getUnreadCounts } from "../apis/message.api.js";
import Avatar from "./Avatar";
import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";
import socket from "../../socket.js";

export default function SideBar() {
    const { user, setUser } = useContext(AuthContext);
    const navigate = useNavigate();
    const [error, setError] = useState(null); 
    const [allUser, setAllUser] = useState([]);
    const [chattedUserIds, setChattedUserIds] = useState(new Set());
    const [selectedUserId, setSelectedUserId] = useState("");
    const [filter, setFilter] = useState("all"); // Filter state: 'all', 'groups', 'dms'
    const [unreadCounts, setUnreadCounts] = useState({ dms: {}, groups: {} });

    // Group-related state
    const [groups, setGroups] = useState([]);
    const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [groupError, setGroupError] = useState("");
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const fetchUnreadCounts = async () => {
        try {
            const res = await getUnreadCounts();
            if (res.success) {
                setUnreadCounts({
                    dms: res.dms || {},
                    groups: res.groups || {}
                });
            }
        } catch (err) {
            console.log("Failed to fetch unread counts", err);
        }
    };

    const filteredGroups = groups.filter((group) =>
        group.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredUsers = allUser
        .filter((u) => u.id !== user?.id)
        .filter((u) => {
            if (u.id === selectedUserId) return true;
            const hasChatted = chattedUserIds.has(u.id);
            if (!searchQuery) {
                return hasChatted;
            }
            return u.email.toLowerCase().includes(searchQuery.toLowerCase());
        });

    const fetchGroups = async () => {
        try {
            const res = await getUserGroups();
            if (res.success && res.groups) {
                setGroups(res.groups);
            }
        } catch (err) {
            console.log("Failed to fetch groups", err);
        }
    };

    useEffect(() => {
        async function fetchUsers() {
            try {
                const res = await getAllUser();
                if (res.data && res.data.success) {
                    setAllUser(res.data.data);
                    if (res.data.chattedUserIds) {
                        setChattedUserIds(new Set(res.data.chattedUserIds));
                    }
                }
            } catch (err) {
                setError("Failed to load users");
            }
        }
        fetchUsers();
        fetchGroups();
        fetchUnreadCounts();
    }, []);

    useEffect(() => {
        const handleUserStatusChanged = (data) => {
            setAllUser((prev) =>
                prev.map((u) =>
                    u.id === data.userId
                        ? { ...u, status: data.status, lastSeen: data.lastSeen || u.lastSeen }
                        : u
                )
            );
        };

        const handleOnlineUsersList = (onlineIds) => {
            setAllUser((prev) =>
                prev.map((u) => ({
                    ...u,
                    status: onlineIds.includes(u.id) ? "online" : "offline"
                }))
            );
        };

        socket.on("userStatusChanged", handleUserStatusChanged);
        socket.on("onlineUsersList", handleOnlineUsersList);

        if (user) {
            socket.emit("getOnlineUsers");
        }

        return () => {
            socket.off("userStatusChanged", handleUserStatusChanged);
            socket.off("onlineUsersList", handleOnlineUsersList);
        };
    }, [user]);

    useEffect(() => {
        const handleReceiveMessage = (data) => {
            if (data.from === user?.id) return;

            const isChatActive = window.location.pathname.endsWith(data.chatId);
            if (isChatActive) return;

            const isGroupChat = groups.some(g => g.id === data.chatId);

            if (isGroupChat) {
                setUnreadCounts((prev) => ({
                    ...prev,
                    groups: {
                        ...prev.groups,
                        [data.chatId]: (prev.groups[data.chatId] || 0) + 1
                    }
                }));
            } else {
                setUnreadCounts((prev) => ({
                    ...prev,
                    dms: {
                        ...prev.dms,
                        [data.from]: (prev.dms[data.from] || 0) + 1
                    }
                }));
                setChattedUserIds((prev) => {
                    const next = new Set(prev);
                    next.add(data.from);
                    return next;
                });
            }
        };

        const handleMessagesRead = (data) => {
            if (data.userId === user?.id) {
                fetchUnreadCounts();
            }
        };

        socket.on("receiveMessage", handleReceiveMessage);
        socket.on("messagesRead", handleMessagesRead);

        return () => {
            socket.off("receiveMessage", handleReceiveMessage);
            socket.off("messagesRead", handleMessagesRead);
        };
    }, [user, groups]);

    useEffect(() => {
        if (selectedUserId) {
            const isGroupChat = groups.some(g => g.id === selectedUserId);
            if (isGroupChat) {
                setUnreadCounts(prev => {
                    if (!prev.groups[selectedUserId]) return prev;
                    return {
                        ...prev,
                        groups: { ...prev.groups, [selectedUserId]: 0 }
                    };
                });
            } else {
                setUnreadCounts(prev => {
                    if (!prev.dms[selectedUserId]) return prev;
                    return {
                        ...prev,
                        dms: { ...prev.dms, [selectedUserId]: 0 }
                    };
                });
            }
        }
    }, [selectedUserId, groups]);

    const handleLogOut = async () => {
        await logOut();
        socket.emit("logout");
        setUser(null);
        navigate('/login');
    };

    const handleSelectRecipient = async (recipientId) => {
        setSelectedUserId(recipientId);
        if (recipientId) {
            try {
                const res = await getOrCreatePrivateChat(recipientId);
                if (res.success && res.chat) {
                    setChattedUserIds((prev) => {
                        const next = new Set(prev);
                        next.add(recipientId);
                        return next;
                    });
                    navigate(`/chats/${res.chat.id}`);
                }
            } catch (err) {
                setError("Failed to start private chat");
            }
        } else {
            try {
                const res = await getDefaultChat();
                if (res.success && res.chat) {
                    navigate(`/chats/${res.chat.id}`);
                }
            } catch (err) {
                setError("Failed to load global chat");
            }
        }
    };

    const handleSelectGroup = (groupId) => {
        setSelectedUserId(groupId);
        navigate(`/chats/${groupId}`);
    };

    const handleToggleMember = (userId) => {
        setSelectedMembers((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) {
            setGroupError("Group name is required");
            return;
        }
        try {
            const res = await createGroupChat(groupName.trim(), selectedMembers);
            if (res.success && res.chat) {
                setGroupName("");
                setSelectedMembers([]);
                setGroupError("");
                setIsCreateGroupOpen(false);
                fetchGroups();
                handleSelectGroup(res.chat.id);
            }
        } catch (err) {
            setGroupError(err.response?.data?.message || "Failed to create group");
        }
    };

    const handleCloseGroupModal = () => {
        setIsCreateGroupOpen(false);
        setGroupName("");
        setSelectedMembers([]);
        setGroupError("");
    };

    const handleDeleteChat = async (e, chatId, isGroupChat) => {
        e.stopPropagation();
        const confirmMsg = isGroupChat 
            ? "Are you sure you want to delete this group chat? This will remove it for all members and delete all messages." 
            : "Are you sure you want to clear your conversation history for this direct message?";
        
        if (!window.confirm(confirmMsg)) return;

        try {
            const res = await deleteChat(chatId);
            if (res.success) {
                if (isGroupChat) {
                    fetchGroups();
                }
                if (window.location.pathname.endsWith(chatId)) {
                    setSelectedUserId("");
                    navigate("/");
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete chat");
        }
    };

    const handleDeletePrivateChat = async (e, recipientId) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to clear your conversation history for this direct message?")) return;

        try {
            const resChat = await getOrCreatePrivateChat(recipientId);
            if (resChat.success && resChat.chat) {
                const resDel = await deleteChat(resChat.chat.id);
                if (resDel.success) {
                    setChattedUserIds((prev) => {
                        const next = new Set(prev);
                        next.delete(recipientId);
                        return next;
                    });
                    if (window.location.pathname.endsWith(resChat.chat.id)) {
                        setSelectedUserId("");
                        navigate("/");
                    }
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to clear chat history");
        }
    };

    return (
        <div className="flex h-screen w-screen bg-brand-background text-brand-on-surface overflow-hidden font-sans">
            
            {/* PANE 1: Left Mini-Nav Sidebar (80px fixed) */}
            <aside className="h-screen w-20 flex-shrink-0 bg-brand-background border-r border-brand-outline-variant flex flex-col items-center py-6 gap-8 z-50">
                {/* Brand Logo */}
                <div className="w-12 h-12 rounded-xl bg-brand-primary flex items-center justify-center text-brand-on-primary cursor-pointer shadow-[0_0_15px_rgba(37,99,235,0.5)] active:scale-95 transition-all">
                    <span className="text-[20px] font-bold">C</span>
                </div>
                
                {/* Navigation Tabs */}
                <nav className="flex flex-col gap-6">
                    <button className="w-12 h-12 flex items-center justify-center rounded-xl text-brand-primary bg-brand-primary/10 transition-transform active:scale-95">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </button>
                    <button 
                        onClick={() => setIsCreateGroupOpen(true)}
                        className="w-12 h-12 flex items-center justify-center rounded-xl text-brand-on-surface-variant hover:bg-brand-surface-container transition-all active:scale-95"
                        title="Create Group"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H2v-2a5 5 0 015-5h4a5 5 0 015 5v2h-7zM15 4.13a4 4 0 010 7.74M12.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
                        </svg>
                    </button>
                </nav>
                
                {/* Bottom Profile and Logout */}
                <div className="flex flex-col items-center gap-6 mt-auto">
                    <button 
                        onClick={handleLogOut} 
                        className="w-12 h-12 flex items-center justify-center rounded-xl text-brand-on-surface-variant hover:bg-brand-surface-container hover:text-red-500 transition-all active:scale-95"
                        title="Logout"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                    <div 
                        onClick={() => setIsProfileOpen(true)}
                        className="relative group cursor-pointer active:scale-95 transition-all"
                    >
                        <Avatar name={user?.username} size="sm" isOnline={true} />
                    </div>
                </div>
            </aside>

            {/* PANE 2: Lists / Channels Pane (320px fixed) */}
            <aside className="w-80 border-r border-brand-outline-variant bg-brand-surface flex flex-col justify-between shrink-0">
                {/* Header Section */}
                <div className="p-5 flex flex-col gap-5 border-b border-brand-outline-variant/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 cursor-pointer select-none active:scale-98 transition-all" onClick={() => { setSelectedUserId(""); navigate("/"); }}>
                            <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <span className="text-lg font-bold tracking-tight text-brand-on-surface hover:text-brand-primary transition-colors">Clarity</span>
                        </div>
                    </div>
                    
                    {/* Search Field */}
                    <div className="relative">
                        <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-brand-on-surface-variant/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-12 pl-12 pr-4 bg-brand-background border border-brand-outline-variant rounded-xl focus:outline-none focus:border-brand-primary text-sm placeholder:text-brand-on-surface-variant/30 text-brand-on-surface transition-all" 
                            placeholder="Search by email or group name..." 
                            type="text"
                        />
                    </div>

                    {/* Segmented Filter Chips */}
                    <div className="flex bg-brand-background p-1 rounded-xl border border-brand-outline-variant/50 overflow-x-auto no-scrollbar">
                        <button 
                            onClick={() => setFilter("all")}
                            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                                filter === "all" ? "bg-brand-surface text-brand-on-surface shadow-sm" : "text-brand-on-surface-variant/80 hover:text-brand-on-surface"
                            }`}
                        >
                            All
                        </button>
                        <button 
                            onClick={() => setFilter("groups")}
                            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                                filter === "groups" ? "bg-brand-surface text-brand-on-surface shadow-sm" : "text-brand-on-surface-variant/80 hover:text-brand-on-surface"
                            }`}
                        >
                            Groups
                        </button>
                        <button 
                            onClick={() => setFilter("dms")}
                            className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                                filter === "dms" ? "bg-brand-surface text-brand-on-surface shadow-sm" : "text-brand-on-surface-variant/80 hover:text-brand-on-surface"
                            }`}
                        >
                            DMs
                        </button>
                    </div>
                </div>

                {/* Lists Scrollable Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">

                    {/* Group Chats */}
                    {(filter === "all" || filter === "groups") && (
                        <div className="space-y-1">
                            {filteredGroups.map((group) => (
                                <div key={group.id} className="relative group/item flex items-center justify-between rounded-xl hover:bg-brand-surface-container transition-all">
                                    <button
                                        onClick={() => handleSelectGroup(group.id)}
                                        className={`flex-1 flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-left transition-all cursor-pointer ${
                                            selectedUserId === group.id 
                                            ? "bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-medium shadow-sm" 
                                            : "text-brand-on-surface-variant hover:text-brand-on-surface"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-10 h-10 rounded-full bg-brand-surface-container flex items-center justify-center font-bold text-brand-primary">
                                                G
                                            </div>
                                            <div className="overflow-hidden">
                                                <div className="text-sm font-semibold text-brand-on-surface truncate max-w-[140px]">{group.name}</div>
                                                <div className="text-xs text-brand-on-surface-variant truncate max-w-[140px]">
                                                    {group.members.length} members
                                                </div>
                                            </div>
                                        </div>
                                        {(unreadCounts.groups[group.id] || 0) > 0 && (
                                            <span className="w-5 h-5 flex items-center justify-center bg-brand-primary text-brand-on-primary text-[10px] font-bold rounded-full shrink-0 shadow-sm animate-pulse group-hover/item:opacity-0 transition-opacity duration-200">
                                                {unreadCounts.groups[group.id]}
                                            </span>
                                        )}
                                    </button>
                                    
                                    {group.userId === user?.id && (
                                        <button 
                                            onClick={(e) => handleDeleteChat(e, group.id, true)}
                                            className="opacity-0 group-hover/item:opacity-100 p-2 text-brand-on-surface-variant/40 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-all absolute right-2 z-10 cursor-pointer"
                                            title="Delete Group"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Direct Messages */}
                    {(filter === "all" || filter === "dms") && (
                        <div className="space-y-1">
                            {filteredUsers.map((u) => (
                                <div key={u.id} className="relative group/item flex items-center justify-between rounded-xl hover:bg-brand-surface-container transition-all">
                                    <button
                                        onClick={() => handleSelectRecipient(u.id)}
                                        className={`flex-1 flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-left transition-all cursor-pointer ${
                                            selectedUserId === u.id 
                                            ? "bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-medium shadow-sm" 
                                            : "text-brand-on-surface-variant hover:bg-brand-surface-container"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <Avatar name={u.username} size="md" isOnline={u.status === "online"} />
                                            <div className="overflow-hidden">
                                                <div className="text-sm font-semibold text-brand-on-surface truncate">{u.username}</div>
                                                <div className="text-[11px] text-brand-on-surface-variant/75 truncate">{u.email}</div>
                                                <div className="text-[10px] text-brand-on-surface-variant flex items-center gap-1">
                                                    {u.status === "online" ? (
                                                        <span className="text-green-500 font-medium">Online</span>
                                                    ) : (
                                                        <span>Offline</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {(unreadCounts.dms[u.id] || 0) > 0 && (
                                            <span className="w-5 h-5 flex items-center justify-center bg-brand-primary text-brand-on-primary text-[10px] font-bold rounded-full shrink-0 shadow-sm animate-pulse group-hover/item:opacity-0 transition-opacity duration-200">
                                                {unreadCounts.dms[u.id]}
                                            </span>
                                        )}
                                    </button>
                                    
                                    <button 
                                        onClick={(e) => handleDeletePrivateChat(e, u.id)}
                                        className="opacity-0 group-hover/item:opacity-100 p-2 text-brand-on-surface-variant/40 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-all absolute right-2 z-10 cursor-pointer"
                                        title="Clear History"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </aside>
            
            {/* PANE 3: Flexible Chat Window pane */}
            <Outlet context={{ selectedUserId, setSelectedUserId, allUser, setAllUser, error, setError, fetchGroups }} />

            {/* Create Group Modal */}
            <Modal isOpen={isCreateGroupOpen} onClose={handleCloseGroupModal} title="Create Private Group">
                {groupError && <p className="text-red-500 text-xs mb-3">{groupError}</p>}
                <div className="space-y-4">
                    <Input
                        label="Group Name"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="e.g. Creative Minds"
                    />
                    <div>
                        <label className="block text-xs font-semibold text-brand-on-surface-variant/70 uppercase tracking-widest ml-1 mb-2">
                            Select Members
                        </label>
                        <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            {allUser
                                .filter((u) => u.id !== user?.id)
                                .map((u) => {
                                    const isChecked = selectedMembers.includes(u.id);
                                    return (
                                        <label 
                                            key={u.id}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-brand-background hover:bg-brand-surface-container-high/45 cursor-pointer transition-all select-none border border-brand-outline-variant/10"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleMember(u.id)}
                                                className="rounded border-brand-outline text-brand-primary focus:ring-0 w-4 h-4 bg-brand-surface"
                                            />
                                            <span className="text-sm font-semibold text-brand-on-surface">{u.username}</span>
                                        </label>
                                    );
                                })
                            }
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6 border-t border-brand-outline-variant/20 pt-4">
                    <Button variant="ghost" onClick={handleCloseGroupModal}>Cancel</Button>
                    <Button variant="primary" onClick={handleCreateGroup}>Create Group</Button>
                </div>
            </Modal>

            {/* User Profile Modal */}
            <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="My Profile">
                <div className="flex flex-col items-center text-center p-4">
                    <div className="relative mb-6">
                        <Avatar name={user?.username} size="xl" />
                        <span className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-4 border-brand-surface rounded-full"></span>
                    </div>

                    <h2 className="text-2xl font-bold tracking-tight text-brand-on-surface mb-1">
                        {user?.username}
                    </h2>
                    <p className="text-xs text-brand-primary font-semibold uppercase tracking-wider mb-6 bg-brand-primary/10 px-2.5 py-1 rounded-full border border-brand-primary/20">
                        Online
                    </p>

                    <div className="w-full space-y-4 text-left border-t border-brand-outline-variant/30 pt-6">
                        <div>
                            <span className="block text-[10px] font-semibold text-brand-on-surface-variant/60 uppercase tracking-widest mb-1">
                                Email Address
                            </span>
                            <span className="text-sm font-semibold text-brand-on-surface bg-brand-background/40 border border-brand-outline-variant/10 px-3 py-2.5 rounded-lg block truncate">
                                {user?.email || "N/A"}
                            </span>
                        </div>

                        <div>
                            <span className="block text-[10px] font-semibold text-brand-on-surface-variant/60 uppercase tracking-widest mb-1">
                                Member Since
                            </span>
                            <span className="text-sm font-semibold text-brand-on-surface bg-brand-background/40 border border-brand-outline-variant/10 px-3 py-2.5 rounded-lg block">
                                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : "N/A"}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end mt-6 border-t border-brand-outline-variant/20 pt-4">
                    <Button variant="primary" onClick={() => setIsProfileOpen(false)} className="w-full">Close</Button>
                </div>
            </Modal>
        </div>
    );
}
