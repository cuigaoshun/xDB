import { create } from 'zustand';

// Toast 通知类型
export interface ToastNotification {
    id: string;
    title?: string;
    description?: string;
    variant?: 'default' | 'destructive' | 'success' | 'subtle';
    duration?: number;
    persistent?: boolean;
    actions?: Array<{
        label: string;
        onClick: (() => void) | 'dismiss';
    }>;
}

// 确认对话框类型
export interface ConfirmDialog {
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
    onConfirm?: () => void;
    onCancel?: () => void;
}

interface NotificationStore {
    // Toast 状态
    toasts: ToastNotification[];
    addToast: (toast: Omit<ToastNotification, 'id'>) => string;
    removeToast: (id: string) => void;

    // 确认对话框状态
    confirmDialog: ConfirmDialog;
    openConfirm: (options: Omit<ConfirmDialog, 'isOpen'>) => void;
    closeConfirm: () => void;
    confirmAction: () => void;
    cancelAction: () => void;
}

let toastCount = 0;
const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
    // Toast 相关
    toasts: [],

    addToast: (toast) => {
        const id = `toast-${++toastCount}`;
        const newToast: ToastNotification = {
            id,
            duration: toast.persistent ? undefined : TOAST_REMOVE_DELAY,
            ...toast,
        };

        set((state) => ({
            toasts: [newToast, ...state.toasts].slice(0, TOAST_LIMIT),
        }));

        // 自动移除（persistent toast 不自动移除）
        if (!newToast.persistent && newToast.duration && newToast.duration > 0) {
            setTimeout(() => {
                get().removeToast(id);
            }, newToast.duration);
        }

        return id;
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },

    // 确认对话框相关
    confirmDialog: {
        isOpen: false,
        title: '',
        description: '',
    },

    openConfirm: (options) => {
        set({
            confirmDialog: {
                isOpen: true,
                ...options,
            },
        });
    },

    closeConfirm: () => {
        set({
            confirmDialog: {
                isOpen: false,
                title: '',
                description: '',
            },
        });
    },

    confirmAction: () => {
        const { confirmDialog } = get();
        if (confirmDialog.onConfirm) {
            confirmDialog.onConfirm();
        }
        get().closeConfirm();
    },

    cancelAction: () => {
        const { confirmDialog } = get();
        if (confirmDialog.onCancel) {
            confirmDialog.onCancel();
        }
        get().closeConfirm();
    },
}));

// 便捷函数
export const toast = (options: Omit<ToastNotification, 'id'>) => {
    return useNotificationStore.getState().addToast(options);
};

export const confirm = (options: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
}): Promise<boolean> => {
    return new Promise((resolve) => {
        useNotificationStore.getState().openConfirm({
            ...options,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
};
