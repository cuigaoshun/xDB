import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/hooks/useToast.ts';
import {
    Toast,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
} from '@/components/ui/toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function Toaster() {
    const { t } = useTranslation();
    const { toasts, confirmDialog, confirmAction, cancelAction, closeConfirm } = useNotificationStore();

    return (
        <>
            {/* Toast 通知 */}
            <ToastProvider>
                {toasts.map(({ id, title, description, variant, actions }) => (
                    <Toast key={id} variant={variant}>
                        <div className="grid gap-2 w-full">
                            <div className="grid gap-1">
                                {title && <ToastTitle>{title}</ToastTitle>}
                                {description && <ToastDescription>{description}</ToastDescription>}
                            </div>
                            {actions && actions.length > 0 && (
                                <div className="flex gap-2 mt-1">
                                    {actions.map((action, index) => (
                                        <Button
                                            key={index}
                                            size="sm"
                                            variant={index === 0 ? "default" : "outline"}
                                            onClick={() => {
                                                if (action.onClick === 'dismiss') {
                                                    useNotificationStore.getState().removeToast(id);
                                                } else {
                                                    action.onClick();
                                                }
                                            }}
                                        >
                                            {action.label}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <ToastClose />
                    </Toast>
                ))}
                <ToastViewport />
            </ToastProvider>

            {/* 确认对话框 */}
            <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => !open && closeConfirm()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmDialog.title}</DialogTitle>
                        <DialogDescription>{confirmDialog.description}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={cancelAction}>
                            {confirmDialog.cancelText || t('common.cancel')}
                        </Button>
                        <Button
                            variant={confirmDialog.variant === 'destructive' ? 'destructive' : 'default'}
                            onClick={confirmAction}
                        >
                            {confirmDialog.confirmText || t('common.delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
