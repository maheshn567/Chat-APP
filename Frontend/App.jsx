import React, { useContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./src/pages/Login.jsx";
import Register from "./src/pages/register.jsx";
import Chat from "./src/pages/Chat/Chat.jsx";
import SideBar from "./src/components/SideBar.jsx";
import { AuthContext } from "./src/context/Auth.context.jsx";

const ProtectedRoute = ({ children }) => {
    const { user } = useContext(AuthContext);
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

const AuthRoute = ({ children }) => {
    const { user } = useContext(AuthContext);
    if (user) {
        return <Navigate to="/" replace />;
    }
    return children;
};

function App() {
    const { loading } = useContext(AuthContext);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-brand-background text-brand-on-surface">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-primary flex items-center justify-center text-brand-on-primary shadow-[0_0_15px_rgba(37,99,235,0.5)] animate-pulse">
                        <span className="text-[20px] font-bold">C</span>
                    </div>
                    <span className="text-xs text-brand-on-surface-variant/70 animate-pulse font-semibold tracking-wider uppercase">Loading Clarity...</span>
                </div>
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/" element={<ProtectedRoute><SideBar /></ProtectedRoute>}> 
                <Route path="/" element={<Chat />} />
                <Route path="/chats/:chatId" element={<Chat />} />
            </Route>
            <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
            <Route path="/register" element={<AuthRoute><Register /></AuthRoute>} />
        </Routes>
    );
}

export default App;
