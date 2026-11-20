'use client';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';

export interface NotificationData {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
    duration?: number;
}

export interface ConfirmDialogData {
    id: string;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger';
    /** The user has to type exactly this text before the confirm button works (for irreversible actions) */
    requireText?: string;
    /** Sentence shown above the input, defaults to a generic one */
    requireTextPrompt?: string;
    onConfirm: () => void;
    onCancel?: () => void;
}

interface NotificationContextType {
    notifications: NotificationData[];
    confirmDialog: ConfirmDialogData | null;
    showNotification: (notification: Omit<NotificationData, 'id'>) => void;
    removeNotification: (id: string) => void;
    showConfirmDialog: (dialog: Omit<ConfirmDialogData, 'id'>) => void;
    hideConfirmDialog: () => void;
}

const MAX_VISIBLE_NOTIFICATIONS = 4;

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<NotificationData[]>([]);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogData | null>(null);

    const nextId = useRef(0);
    // Maps a notification's content to the id currently on screen so repeats are not stacked
    const activeNotifications = useRef(new Map<string, string>());

    const removeNotification = useCallback((id: string) => {
        for (const [key, activeId] of activeNotifications.current) {
            if (activeId === id) activeNotifications.current.delete(key);
        }
        setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, []);

    const showNotification = useCallback((notification: Omit<NotificationData, 'id'>) => {
        const key = `${notification.type}|${notification.title ?? ''}|${notification.message}`;
        if (activeNotifications.current.has(key)) {
            return;
        }

        const id = `notification-${Date.now().toString(36)}-${nextId.current++}`;
        const newNotification: NotificationData = {
            ...notification,
            id,
            duration: notification.duration ?? 5000,
        };

        activeNotifications.current.set(key, id);
        setNotifications(prev => {
            const next = [...prev, newNotification];
            // Keep the stack short: drop the oldest ones first
            for (const dropped of next.slice(0, Math.max(0, next.length - MAX_VISIBLE_NOTIFICATIONS))) {
                for (const [activeKey, activeId] of activeNotifications.current) {
                    if (activeId === dropped.id) activeNotifications.current.delete(activeKey);
                }
            }
            return next.slice(-MAX_VISIBLE_NOTIFICATIONS);
        });

        // Auto-remove notification
        if (newNotification.duration && newNotification.duration > 0) {
            setTimeout(() => {
                removeNotification(id);
            }, newNotification.duration);
        }
    }, [removeNotification]);

    const showConfirmDialog = useCallback((dialog: Omit<ConfirmDialogData, 'id'>) => {
        const id = `confirm-${Date.now().toString(36)}-${nextId.current++}`;
        setConfirmDialog({
            ...dialog,
            id,
            confirmText: dialog.confirmText ?? 'Confirm',
            cancelText: dialog.cancelText ?? 'Cancel',
            variant: dialog.variant ?? 'default',
        });
    }, []);

    const hideConfirmDialog = useCallback(() => {
        setConfirmDialog(null);
    }, []);

    // Keep the context value stable so consumers (and their effects) do not re-run on every provider render
    const value = useMemo(() => ({
        notifications,
        confirmDialog,
        showNotification,
        removeNotification,
        showConfirmDialog,
        hideConfirmDialog,
    }), [notifications, confirmDialog, showNotification, removeNotification, showConfirmDialog, hideConfirmDialog]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
