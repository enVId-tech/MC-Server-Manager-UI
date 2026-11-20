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

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, []);

    const showNotification = useCallback((notification: Omit<NotificationData, 'id'>) => {
        const id = `notification-${Date.now().toString(36)}-${nextId.current++}`;
        const newNotification: NotificationData = {
            ...notification,
            id,
            duration: notification.duration ?? 5000,
        };

        setNotifications(prev => [...prev, newNotification]);

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
