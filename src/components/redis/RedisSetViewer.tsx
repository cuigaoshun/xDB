import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Trash2, Pencil, Check, X } from "lucide-react";
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
import { useTranslation } from "react-i18next";

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
    try {
      setIsSubmitting(true);
      await invoke("execute_redis_command", {
        connectionId,
        command: "SADD",
        args: [keyName, newMember],
        db,
      });
      
      onRefresh();
      setIsAddDialogOpen(false);
      setNewMember("");
    } catch (error) {
      console.error("Failed to add set member", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (member: string) => {
    if (!confirm(t('redis.deleteConfirm'))) return;
    
    try {
      await invoke("execute_redis_command", {
        connectionId,
        command: "SREM",
        args: [keyName, member],
        db,
      });
      onRefresh();
    } catch (error) {
      console.error("Failed to delete set member", error);
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
      
      onRefresh();
      handleCancelEdit();
    } catch (error) {
      console.error("Failed to update set member", error);
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
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1">
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
                      memberStr
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
            >
              {isSubmitting ? t('redis.adding') : t('redis.addMember')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
