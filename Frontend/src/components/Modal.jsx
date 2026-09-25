import React from "react";

export default function Modal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-brand-surface border border-brand-outline-variant/20 rounded-brand-2xl w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                {title && <h3 className="text-lg font-semibold text-brand-on-surface mb-4 tracking-tight">{title}</h3>}
                <div className="space-y-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
