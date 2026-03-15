import { useState } from "react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useTranslation } from "react-i18next";
import { invokeRedisCommand } from "@/lib/api.ts";
import { toast } from "@/hooks/useToast.ts";

interface RedisSetViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  data: any[]; // [member1, member2...]
  loading: boolean;
  hasMore: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onSearch: () => void;
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
}

export function RedisSetViewer({
  connectionId,
  db,
  keyName,
  data,
  loading,
  filter,
  onFilterChange,
  onSearch,
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
      await invokeRedisCommand({
              connectionId,
              command: "SADD",
              args: [keyName, newMember],
              db,
            });
      onRefresh();
      setIsAddDialogOpen(false);
      setNewMember("");
      toast({ title: t('redis.addedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to add set member", error);
      toast({ title: t('redis.addFailed'), description: String(error), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (member: string) => {
    try {
      await invokeRedisCommand({
              connectionId,
              command: "SREM",
              args: [keyName, member],
              db,
            });
      onRefresh();
      toast({ title: t('redis.deletedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to delete set member", error);
      toast({ title: t('redis.deleteFailed'), description: String(error), variant: 'destructive' });
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
      await invokeRedisCommand({
              connectionId,
              command: "SREM",
              args: [keyName, oldMember],
              db,
            });
      // SADD new
      await invokeRedisCommand({
              connectionId,
              command: "SADD",
              args: [keyName, newMemberVal],
              db,
            });
      onRefresh();
      handleCancelEdit();
      toast({ title: t('redis.savedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to update set member", error);
      toast({ title: t('redis.saveFailed'), description: String(error), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b flex justify-between items-center gap-2">
        <div className="relative flex-1 max-w-sm flex items-center">
          <Input
            placeholder={t('redis.filterKeys')}
            className="pr-9 h-9"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearch();
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0.5 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onSearch}
            title={t('redis.search', 'Search')}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-sm">
          <Plus className="h-4 w-4" /> {t('redis.addMember')}
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/5">
        <Table>
          <TableHeader className="sticky top-0 bg-muted z-10">
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>{t('common.confirmDeletion')}</DropdownMenuLabel>
                            <div className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground">
                              {t('redis.deleteSetMemberPrompt')}
                            </div>
                            <div className="px-2 pb-2 text-xs font-mono font-medium break-all">
                              {memberStr}
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive cursor-pointer focus:bg-red-50"
                              onClick={() => handleDelete(memberStr)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('common.delete', 'Delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
