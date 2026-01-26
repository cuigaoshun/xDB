import { useState } from "react";
import { addCommandToConsole } from "@/components/ui/CommandConsole";
import { confirm } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { TextFormatterWrapper } from "@/components/common/TextFormatterWrapper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@tauri-apps/api/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

interface RedisListViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  data: any[]; // [val1, val2...]
  loading: boolean;
  onRefresh: () => void;
}

export function RedisListViewer({
  connectionId,
  db,
  keyName,
  data,
  loading,
  onRefresh,
}: RedisListViewerProps) {
  const { t } = useTranslation();
  const [inlineEditIndex, setInlineEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({ position: "tail", value: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (index: number, value: string) => {
    try {
      setIsSubmitting(true);
      await invoke("execute_redis_command", {
        connectionId,
        command: "LSET",
        args: [keyName, index.toString(), value],
        db,
      });
      addCommandToConsole({ command: `LSET ${keyName} ${index} "${value}"`, databaseType: "redis" });

      onRefresh();
      handleCancelEdit();
    } catch (error) {
      console.error("Failed to update list item", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (index: number, value: string) => {
    setInlineEditIndex(index);
    setEditValue(value);
  };

  const handleCancelEdit = () => {
    setInlineEditIndex(null);
    setEditValue("");
  };

  const handleAdd = async () => {
    try {
      setIsSubmitting(true);
      const command = newItem.position === "head" ? "LPUSH" : "RPUSH";
      await invoke("execute_redis_command", {
        connectionId,
        command,
        args: [keyName, newItem.value],
        db,
      });
      addCommandToConsole({ command: `${command} ${keyName} "${newItem.value}"`, databaseType: "redis" });

      onRefresh();
      setIsAddDialogOpen(false);
      setNewItem({ position: "tail", value: "" });
    } catch (error) {
      console.error("Failed to add list item", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (index: number) => {
    const confirmed = await confirm({
      title: t('common.confirmDeletion'),
      description: t("redis.deleteConfirm"),
      variant: 'destructive'
    });
    if (!confirmed) return;

    const startTime = Date.now();
    const valueToDelete = data[index];
    const commandStr = `LREM ${keyName} 1 "${String(valueToDelete).length > 30 ? String(valueToDelete).substring(0, 30) + '...' : valueToDelete}"`;

    try {
      await invoke("execute_redis_command", {
        connectionId,
        command: "LREM",
        args: [keyName, "1", String(valueToDelete)],
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
      console.error("Failed to delete list item", error);
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
        <div className="text-xs text-muted-foreground px-2">
          {t("redis.total")}: {data.length}
        </div>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-sm">
          <Plus className="h-4 w-4" /> {t("redis.addItem")}
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/5">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[80px]">{t("redis.index")}</TableHead>
              <TableHead>{t("redis.value")}</TableHead>
              <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((val, i) => {
              const isEditing = inlineEditIndex === i;
              return (
                <TableRow key={i} className="group hover:bg-muted/50">
                  <TableCell className="font-mono text-xs align-top text-muted-foreground">
                    {i}
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
                        content={String(val)}
                        onSave={async (newValue) => {
                          await handleSave(i, newValue);
                        }}
                        title="Format value"
                      >
                        <div className="flex items-start gap-2 cursor-context-menu">
                          <span className="flex-1">{String(val)}</span>
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
                          onClick={() => handleSave(i, editValue)}
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
                          onClick={() => handleStartEdit(i, String(val))}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {data.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                  {t("redis.listEmpty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {loading && (
          <div className="p-4 text-center text-muted-foreground text-xs">
            {t("redis.loading")}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("redis.addItem")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("redis.position")}</Label>
              <Select
                value={newItem.position}
                onValueChange={(val) => setNewItem({ ...newItem, position: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="head">{t("redis.head")}</SelectItem>
                  <SelectItem value="tail">{t("redis.tail")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="value">{t("redis.value")}</Label>
              <Textarea
                id="value"
                value={newItem.value}
                onChange={(e) => setNewItem({ ...newItem, value: e.target.value })}
                placeholder={t("redis.enterValue")}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!newItem.value || isSubmitting}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isSubmitting ? t("redis.adding") : t("redis.addItem")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
