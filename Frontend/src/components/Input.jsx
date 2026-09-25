import React from "react";

export default function Input({ label, error, className = "", ...props }) {
    return (
        <div className="w-full space-y-2">
            {label && (
                <label className="block text-xs font-semibold text-brand-on-surface-variant/70 uppercase tracking-widest ml-1">
                    {label}
                </label>
            )}
            <input
                className={`w-full h-14 px-4 bg-brand-surface-container-high/40 border border-brand-outline-variant/10 text-brand-on-surface rounded-brand-lg focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary text-sm placeholder:text-brand-on-surface-variant/30 transition-all duration-200 ${
                    error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
                } ${className}`}
                {...props}
            />
            {error && <p className="text-red-500 text-xs mt-1.5 ml-1">{error}</p>}
        </div>
    );
}
