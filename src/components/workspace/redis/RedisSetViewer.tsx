import { useState } from "react";

import { confirm } from "@/hooks/use-toast.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Search, Plus, Trash2, Pencil, Check, X } from "lucide-react";
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

interface RedisSetViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  data: any[]; // [member1, member2...]
  loading: boolean;
  hasMore: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
}

export function RedisSetViewer({
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
}: RedisSetViewerProps) {
  const { t } = useTranslation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newMember, setNewMember] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline edit state
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleAdd = async () => {
    const startTime = Date.now();
    const commandStr = `SADD ${keyName} "${newMember.length > 30 ? newMember.substring(0, 30) + '...' : newMember}"`;
    try {
      setIsSubmitting(true);
      await invoke("execute_redis_command", {
        connectionId,
        command: "SADD",
        args: [keyName, newMember],
        db,
      });

      addCommandToConsole({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: true
      });

      onRefresh();
      setIsAddDialogOpen(false);
      setNewMember("");
    } catch (error) {
      console.error("Failed to add set member", error);
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

  const handleDelete = async (member: string) => {
    const confirmed = await confirm({
      title: t('common.confirmDeletion'),
      description: t('redis.deleteConfirm'),
      variant: 'destructive'
    });
    if (!confirmed) return;

    const startTime = Date.now();
    const commandStr = `SREM ${keyName} "${member.length > 30 ? member.substring(0, 30) + '...' : member}"`;
    try {
      await invoke("execute_redis_command", {
        connectionId,
        command: "SREM",
        args: [keyName, member],
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
      console.error("Failed to delete set member", error);
      addCommandToConsole({
        databaseType: 'redis',
        command: commandStr,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const handleStartEdit = (member: string) => {
    setEditingMember(member);
    setEditValue(member);
  };

  const handleCancelEdit = () => {
    setEditingMember(null);
    setEditValue("");
  };

  const handleSaveEdit = async (oldMember: string, newMemberVal: string) => {
    if (oldMember === newMemberVal) {
      handleCancelEdit();
      return;
    }

    const startTime = Date.now();
    try {
      setIsSubmitting(true);
      // SREM old
      await invoke("execute_redis_command", {
        connectionId,
        command: "SREM",
        args: [keyName, oldMember],
        db,
      });
      // SADD new
      await invoke("execute_redis_command", {
        connectionId,
        command: "SADD",
        args: [keyName, newMemberVal],
        db,
      });

      addCommandToConsole({
        databaseType: 'redis',
        command: `SREM ${keyName} "${oldMember}" + SADD ${keyName} "${newMemberVal}"`,
        duration: Date.now() - startTime,
        success: true
      });

      onRefresh();
      handleCancelEdit();
    } catch (error) {
      console.error("Failed to update set member", error);
      addCommandToConsole({
        databaseType: 'redis',
        command: `SREM + SADD ${keyName}`,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsSubmitting(false);
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
          {t('redis.total')}: {data.length}{hasMore ? "+" : ""}
        </div>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-sm">
          <Plus className="h-4 w-4" /> {t('redis.addMember')}
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/5">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>{t('redis.member')}</TableHead>
              <TableHead className="w-[100px] text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((member, i) => {
              const memberStr = String(member);
              const isEditing = editingMember === memberStr;
              return (
                <TableRow key={`${memberStr}-${i}`} className="group hover:bg-muted/50">
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
                        content={memberStr}
                        readonly
                        title="View formatted"
                      >
                        <div className="flex items-start gap-2 cursor-context-menu">
                          <span className="flex-1">{memberStr}</span>
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
                          onClick={() => handleSaveEdit(memberStr, editValue)}
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
                          onClick={() => handleStartEdit(memberStr)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(memberStr)}
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
                <TableCell colSpan={2} className="text-center text-muted-foreground h-24">
                  {t('redis.noMembers')}
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

      {/* Add Member Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('redis.addMember')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="member">{t('redis.member')}</Label>
              <Textarea
                id="member"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder={t('redis.enterMember')}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!newMember || isSubmitting}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isSubmitting ? t('redis.adding') : t('redis.addMember')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
