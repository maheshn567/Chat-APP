import React from "react";

export default function Avatar({ name, size = "md", isOnline = false, className = "" }) {
    const firstLetter = name ? name.charAt(0).toUpperCase() : "?";
    
    // Smooth dark-theme palette
    const colors = ["bg-blue-600", "bg-purple-600", "bg-pink-600", "bg-indigo-600", "bg-teal-600", "bg-orange-600"];
    const hash = name ? name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    const colorClass = colors[hash % colors.length];

    const sizeClasses = {
        sm: "w-8 h-8 text-xs font-bold",
        md: "w-10 h-10 text-sm font-bold",
        lg: "w-12 h-12 text-base font-bold",
        xl: "w-14 h-14 text-lg font-bold"
    };

    return (
        <div className={`relative shrink-0 select-none ${className}`}>
            <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white border border-brand-outline-variant/20 shadow-inner ${colorClass}`}>
                {firstLetter}
            </div>
            {isOnline && (
                <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-brand-surface rounded-full"></span>
            )}
        </div>
    );
}
