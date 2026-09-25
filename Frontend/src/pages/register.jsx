import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../apis/login.api";
import { AuthContext } from "../context/Auth.context.jsx";
import Input from "../components/Input";
import Button from "../components/Button";

export default function Register() {
    const { setUser } = useContext(AuthContext);
    const navigate = useNavigate();
    const [user, setUserInput] = useState({ username: "", email: "", password: "" });
    const [error, setError] = useState({ status: false, message: "" });

    const handleChange = (e) => {
        setUserInput({ ...user, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await register(user);
            setUser(res.data.result);
            navigate("/");
        } catch (error) {
            setError({
                status: true,
                message: error?.response?.data?.message || error?.message || "Registration failed"
            });
        }
    };

    return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-brand-background px-4">
            <div className="w-full max-w-md bg-brand-surface border border-brand-outline-variant/10 rounded-brand-2xl p-8 shadow-2xl relative">
                {/* Atmospheric Glow behind card */}
                <div className="absolute -top-[10%] -left-[10%] w-[120%] h-[120%] bg-brand-primary/5 rounded-full blur-[100px] pointer-events-none z-0"></div>

                <div className="text-center mb-8 relative z-10">
                    <h1 className="text-3xl font-bold tracking-tight text-brand-on-surface">Create an account</h1>
                    <p className="text-sm text-brand-on-surface-variant mt-2">Connect and chat in a tranquil space</p>
                </div>

                {error.status && (
                    <div className="bg-red-900/25 border border-red-500/30 text-red-200 text-sm rounded-brand-md p-3 mb-6 relative z-10">
                        {error.message}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                    <Input
                        label="Username"
                        type="text"
                        name="username"
                        value={user.username}
                        onChange={handleChange}
                        placeholder="Choose a username"
                        required
                    />
                    <Input
                        label="Email Address"
                        type="email"
                        name="email"
                        value={user.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        required
                    />
                    <Input
                        label="Password"
                        type="password"
                        name="password"
                        value={user.password}
                        onChange={handleChange}
                        placeholder="••••••••"
                        required
                    />
                    <Button type="submit" variant="primary" className="w-full py-3">
                        Create Account
                    </Button>
                </form>

                <div className="text-center mt-6 relative z-10">
                    <p className="text-sm text-brand-on-surface-variant">
                        Already have an account?{" "}
                        <Link className="text-brand-primary font-semibold hover:underline" to="/login">
                            Login here
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
