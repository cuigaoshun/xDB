import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Connection, DbType } from "@/store/useAppStore";
import { useTranslation } from "react-i18next";

interface ConnectionFormProps {
    initialData?: Partial<Connection>;
    onSubmit: (data: Omit<Connection, 'id' | 'created_at'>) => void;
    onCancel: () => void;
    submitLabel?: string;
}

export function ConnectionForm({ initialData, onSubmit, onCancel, submitLabel }: ConnectionFormProps) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        name: initialData?.name || "",
        db_type: initialData?.db_type || "mysql",
        host: initialData?.host || "localhost",
        port: initialData?.port || 3306,
        username: initialData?.username || "",
        password: initialData?.password || "",
        database: initialData?.database || "",
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

        if (formData.db_type !== 'sqlite') {
            if (!formData.host.trim()) {
                setError(t('common.host_required'));
                return;
            }
            if (!formData.port || Number(formData.port) <= 0) {
                setError(t('common.port_invalid'));
                return;
            }
        } else {
            if (!formData.database.trim()) {
                setError(t('common.path_required'));
                return;
            }
        }

        onSubmit(formData as any);
    };

    useEffect(() => {
        // Set default port when type changes if not manually modified? 
        // For simplicity, we just set it if it matches default of other type
        if (formData.db_type === 'mysql' && formData.port === 6379) {
             handleChange('port', 3306);
        } else if (formData.db_type === 'redis' && formData.port === 3306) {
             handleChange('port', 6379);
        } else if (formData.db_type === 'memcached' && formData.port === 3306) {
             handleChange('port', 11211);
        }
    }, [formData.db_type]);

    return (
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">{t('common.name')}</label>
                <Input
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="col-span-3"
                    placeholder="My Connection"
                />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">{t('common.type')}</label>
                <div className="col-span-3 flex gap-2">
                    {(['mysql', 'redis', 'memcached', 'postgres', 'sqlite'] as DbType[]).map((type) => (
                        <Button
                            key={type}
                            type="button"
                            variant={formData.db_type === type ? 'default' : 'outline'}
                            onClick={() => handleChange('db_type', type)}
                            size="sm"
                            className="capitalize"
                        >
                            {type}
                        </Button>
                    ))}
                </div>
            </div>

            {formData.db_type !== 'sqlite' && (
                <>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm font-medium">{t('common.host')}</label>
                        <Input
                            value={formData.host}
                            onChange={(e) => handleChange('host', e.target.value)}
                            className="col-span-3"
                            placeholder="localhost"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm font-medium">{t('common.port')}</label>
                        <Input
                            type="number"
                            value={formData.port}
                            onChange={(e) => handleChange('port', parseInt(e.target.value) || 0)}
                            className="col-span-3"
                            placeholder="3306"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm font-medium">{t('common.username')}</label>
                        <Input
                            value={formData.username}
                            onChange={(e) => handleChange('username', e.target.value)}
                            className="col-span-3"
                            placeholder="root"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label className="text-right text-sm font-medium">{t('common.password')}</label>
                        <Input
                            type="password"
                            value={formData.password}
                            onChange={(e) => handleChange('password', e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                </>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">{t('common.database')}</label>
                <Input
                    value={formData.database}
                    onChange={(e) => handleChange('database', e.target.value)}
                    className="col-span-3"
                    placeholder={formData.db_type === 'sqlite' ? "/path/to/db.sqlite" : "default_db"}
                />
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
