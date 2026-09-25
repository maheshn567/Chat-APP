import React from "react";

export default function Button({ children, onClick, type = "button", variant = "primary", className = "", ...props }) {
    const baseStyle = "h-12 px-6 rounded-brand-lg font-semibold text-sm transition-all duration-250 active:scale-95 cursor-pointer flex items-center justify-center gap-2 select-none";
    const variants = {
        primary: "bg-brand-primary hover:bg-blue-600 text-brand-on-primary shadow-lg hover:shadow-brand-primary/20",
        secondary: "bg-brand-surface-container hover:bg-brand-surface-container-high text-brand-on-surface border border-brand-outline/10",
        danger: "bg-red-650 hover:bg-red-650 text-white shadow-lg shadow-red-650/10",
        ghost: "bg-transparent hover:bg-brand-surface-container text-brand-on-surface-variant hover:text-brand-on-surface"
    };

    return (
        <button
            type={type}
            onClick={onClick}
            className={`${baseStyle} ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
