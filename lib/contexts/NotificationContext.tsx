'use client';
import React, { createContext, useContext, useState, ReactNode } from 'react';

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

    const showNotification = (notification: Omit<NotificationData, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
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
    };

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(notification => notification.id !== id));
    };

    const showConfirmDialog = (dialog: Omit<ConfirmDialogData, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
        setConfirmDialog({
            ...dialog,
            id,
            confirmText: dialog.confirmText ?? 'Confirm',
            cancelText: dialog.cancelText ?? 'Cancel',
            variant: dialog.variant ?? 'default',
        });
    };

    const hideConfirmDialog = () => {
        setConfirmDialog(null);
    };

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                confirmDialog,
                showNotification,
                removeNotification,
                showConfirmDialog,
                hideConfirmDialog,
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
};
