import { useEffect, createContext, useState } from "react";
import { getMe } from "../apis/login.api";
import socket from "../../socket.js";

// Create and export the context so other components can consume it via useContext(AuthContext)
export const AuthContext = createContext();

export const AuthContextProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchUser() {
            try {
                const res = await getMe();
                if (res.data && res.data.success) {
                    setUser(res.data.data);
                } else {
                    setUser(null);
                }
            } catch (e) {
                console.log("Error while fetching user data:", e);
                setUser(null);
            } finally {
                setLoading(false);
            }
        }
        fetchUser();
    }, []);

    // Connect the socket once a user is logged in. The server authenticates it
    // from the auth cookie, so it must not connect before login.
    useEffect(() => {
        if (user && !socket.connected) {
            socket.connect();
        }
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, setUser, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
