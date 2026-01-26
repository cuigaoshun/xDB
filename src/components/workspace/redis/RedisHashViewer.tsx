import { useState } from "react";

import { confirm } from "@/hooks/use-toast.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Search, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { TextFormatterWrapper } from "@/components/common/TextFormatterWrapper.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { addCommandToConsole } from "@/components/ui/CommandConsole.tsx";

interface RedisHashViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  data: any[]; // [field, value, field, value...]
  loading: boolean;
  hasMore: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
}

export function RedisHashViewer({
  connectionId,
  db,
  keyName,
  data,
  loading,
  hasMore,
  filter,
  onFilterChange,
  onRefresh,
  observerTarget,
}: RedisHashViewerProps) {
  const { t } = useTranslation();
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newField, setNewField] = useState({ field: "", value: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse flat array into objects for easier rendering
  const pairs = [];
  for (let i = 0; i < data.length; i += 2) {
    pairs.push({ field: String(data[i]), value: String(data[i + 1]) });
  }

  const handleSave = async (field: string, value: string) => {
    const startTime = Date.now();
    const commandStr = `HSET ${keyName} ${field} "${value.length > 30 ? value.substring(0, 30) + '...' : value}"`;
    try {
      setIsSubmitting(true);
      await invoke("execute_redis_command", {
        connectionId,
        command: "HSET",
        args: [keyName, field, value],
        db,
      });

      addCommandToConsole({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: true
      });

      onRefresh();
      setInlineEditField(null);
      setEditValue("");
      setIsAddDialogOpen(false);
      setNewField({ field: "", value: "" });
    } catch (error) {
      console.error("Failed to save hash field", error);
      addCommandToConsole({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (pair: { field: string; value: string }) => {
    setInlineEditField(pair.field);
    setEditValue(pair.value);
  };

  const handleCancelEdit = () => {
    setInlineEditField(null);
    setEditValue("");
  };

  const handleDelete = async (field: string) => {
    const confirmed = await confirm({
      title: t('common.confirmDeletion'),
      description: t('redis.deleteConfirm'),
      variant: 'destructive'
    });
    if (!confirmed) return;

    const startTime = Date.now();
    const commandStr = `HDEL ${keyName} ${field}`;
    try {
      await invoke("execute_redis_command", {
        connectionId,
        command: "HDEL",
        args: [keyName, field],
        db,
      });

      addCommandToConsole({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: true
      });

      onRefresh();
    } catch (error) {
      console.error("Failed to delete hash field", error);
      addCommandToConsole({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b flex justify-between items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('redis.filterKeys')}
            className="pl-8 h-9"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {t('redis.total')}: {pairs.length}{hasMore ? "+" : ""}
        </div>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-sm">
          <Plus className="h-4 w-4" /> {t('redis.addField')}
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/5">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-1/3">{t('redis.field')}</TableHead>
              <TableHead className="w-1/2">{t('redis.value')}</TableHead>
              <TableHead className="w-[100px] text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pairs.map((pair, i) => {
              const isEditing = inlineEditField === pair.field;
              return (
                <TableRow key={`${pair.field} -${i} `} className="group hover:bg-muted/50">
                  <TableCell className="font-mono text-xs align-top font-medium text-blue-600 dark:text-blue-400">
                    {pair.field}
                  </TableCell>
                  <TableCell className="font-mono text-xs align-top break-all whitespace-pre-wrap">
                    {isEditing ? (
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="min-h-[80px] font-mono text-xs"
                        autoFocus
                      />
                    ) : (
                      <TextFormatterWrapper
                        content={pair.value}
                        onSave={async (newValue) => {
                          await handleSave(pair.field, newValue);
                        }}
                        title="Format value"
                      >
                        <div className="flex items-start gap-2 cursor-context-menu">
                          <span className="flex-1">{pair.value}</span>
                        </div>
                      </TextFormatterWrapper>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleSave(pair.field, editValue)}
                          disabled={isSubmitting}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={handleCancelEdit}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleStartEdit(pair)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(pair.field)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {pairs.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                  {t('redis.noFields')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div ref={observerTarget} className="h-px w-full" />

        {loading && (
          <div className="p-4 text-center text-muted-foreground text-xs">
            {t('redis.loading')}
          </div>
        )}
      </div>

      {/* Add Field Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('redis.addField')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="field">{t('redis.field')}</Label>
              <Input
                id="field"
                value={newField.field}
                onChange={(e) => setNewField({ ...newField, field: e.target.value })}
                placeholder={t('redis.enterField')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="value">{t('redis.value')}</Label>
              <Textarea
                id="value"
                value={newField.value}
                onChange={(e) => setNewField({ ...newField, value: e.target.value })}
                placeholder={t('redis.enterValue')}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => handleSave(newField.field, newField.value)}
              disabled={!newField.field || isSubmitting}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isSubmitting ? t('redis.saving') : t('redis.addField')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
