import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConnectionGroup } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ConnectionGroupDialogProps {
    initialData?: Partial<ConnectionGroup>;
    onSubmit: (data: Omit<ConnectionGroup, 'id' | 'created_at'>) => void;
    onCancel: () => void;
    submitLabel?: string;
}

const PRESET_COLORS = [
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Yellow', value: '#f59e0b' },
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Gray', value: '#6b7280' },
    { name: 'Cyan', value: '#06b6d4' },
];

export function ConnectionGroupDialog({ initialData, onSubmit, onCancel, submitLabel }: ConnectionGroupDialogProps) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        name: initialData?.name || "",
        description: initialData?.description || "",
        color: initialData?.color || "#3b82f6",
        sort_order: initialData?.sort_order || 0,
    });

    const [error, setError] = useState<string | null>(null);

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (error) setError(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            setError(t('common.name_required'));
            return;
        }

        onSubmit(formData as any);
    };

    return (
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">{t('common.name')}</label>
                <Input
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="col-span-3"
                    placeholder={t('common.connectionGroupPlaceholder', 'e.g. Development')}
                />
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
                <label className="text-right text-sm font-medium pt-2">{t('common.groupDescription')}</label>
                <Textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    className="col-span-3"
                    placeholder={t('common.groupDescription')}
                    rows={3}
                />
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
                <label className="text-right text-sm font-medium pt-2">{t('common.color', 'Color')}</label>
                <div className="col-span-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {PRESET_COLORS.map((preset) => (
                            <button
                                key={preset.value}
                                type="button"
                                onClick={() => handleChange('color', preset.value)}
                                className={cn(
                                    "w-10 h-10 rounded-md border-2 transition-all hover:scale-110",
                                    formData.color === preset.value
                                        ? "border-foreground ring-2 ring-offset-2 ring-foreground"
                                        : "border-border"
                                )}
                                style={{ backgroundColor: preset.value }}
                                title={preset.name}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            type="color"
                            value={formData.color}
                            onChange={(e) => handleChange('color', e.target.value)}
                            className="w-20 h-10 cursor-pointer"
                        />
                        <Input
                            type="text"
                            value={formData.color}
                            onChange={(e) => handleChange('color', e.target.value)}
                            className="flex-1 font-mono"
                            placeholder="#3b82f6"
                        />
                    </div>
                </div>
            </div>

            {error && (
                <div className="text-destructive text-sm text-center">{error}</div>
            )}

            <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
                <Button type="submit">{submitLabel || t('common.save')}</Button>
            </div>
        </form>
    );
}
