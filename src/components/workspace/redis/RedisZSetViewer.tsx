import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Search, Plus, Trash2, Pencil, Check, X, Square, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
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

interface RedisZSetViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  data: any[]; // [member, score, member, score...]
  loading: boolean;
  hasMore: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onSearch: () => void;
  onScanMore: () => void;
  hasSearched: boolean;
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  sortOrder?: 'asc' | 'desc';
  onSortOrderChange?: (order: 'asc' | 'desc') => void;
  exactSearch?: boolean;
  onExactSearchChange?: (exact: boolean) => void;
}

export function RedisZSetViewer({
  connectionId,
  db,
  keyName,
  data,
  loading,
  hasMore,
  filter,
  onFilterChange,
  onSearch,
  onScanMore,
  hasSearched,
  onRefresh,
  observerTarget,
  sortOrder = 'desc',
  onSortOrderChange,
  exactSearch = false,
  onExactSearchChange,
}: RedisZSetViewerProps) {
  const { t } = useTranslation();
  const [inlineEditMember, setInlineEditMember] = useState<string | null>(null);
  const [editScore, setEditScore] = useState("");
  const [editMemberVal, setEditMemberVal] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({ member: "", score: "0" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse flat array
  const members = [];
  for (let i = 0; i < data.length; i += 2) {
    members.push({ member: String(data[i]), score: String(data[i + 1]) });
  }

  const showScanMore = !exactSearch && hasSearched && hasMore;

  const handleSave = async (member: string, score: string) => {
    try {
      setIsSubmitting(true);
      await invokeRedisCommand({
              connectionId,
              command: "ZADD",
              args: [keyName, score, member], // Correct order for ZADD: key score member
              db,
            });
      onRefresh();
      setInlineEditMember(null);
      setIsAddDialogOpen(false);
      setNewItem({ member: "", score: "0" });
      toast({ title: t('redis.savedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to save zset member", error);
      toast({ title: t('redis.saveFailed'), description: String(error), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (item: { member: string; score: string }) => {
    setInlineEditMember(item.member);
    setEditMemberVal(item.member);
    setEditScore(item.score);
  };

  const handleCancelEdit = () => {
    setInlineEditMember(null);
    setEditScore("");
    setEditMemberVal("");
  };

  const handleSaveEdit = async (oldMember: string) => {
    try {
      setIsSubmitting(true);
      // If member name changed, we need to remove old one
      if (oldMember !== editMemberVal) {
        await invokeRedisCommand({
                  connectionId,
                  command: "ZREM",
                  args: [keyName, oldMember],
                  db,
                });
      }
      // ZADD (update score or add new member)
      await invokeRedisCommand({
              connectionId,
              command: "ZADD",
              args: [keyName, editScore, editMemberVal],
              db,
            });

      onRefresh();
      handleCancelEdit();
      toast({ title: t('redis.savedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to update zset member", error);
      toast({ title: t('redis.saveFailed'), description: String(error), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (member: string) => {
    try {
      await invokeRedisCommand({
              connectionId,
              command: "ZREM",
              args: [keyName, member],
              db,
            });
      onRefresh();
      toast({ title: t('redis.deletedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to delete zset member", error);
      toast({ title: t('redis.deleteFailed'), description: String(error), variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b flex flex-col gap-2">
        <div className="flex justify-between items-center gap-2">
          <div className="relative flex-1 max-w-sm flex items-center">
            <button
              className={cn(
                "absolute left-1.5 top-1.5 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent z-10 transition-colors",
                exactSearch && "text-primary hover:text-primary bg-primary/10 hover:bg-primary/20"
              )}
              onClick={() => onExactSearchChange?.(!exactSearch)}
              title={t('redis.exactSearch')}
            >
              {exactSearch ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </button>
            <Input
              placeholder={t("redis.filterKeys")}
              className="pl-8 pr-9 h-9 w-full"
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
          <div className="flex items-center gap-2">
            {onSortOrderChange && (
              <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5 border">
                <Button
                  variant={sortOrder === 'asc' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => onSortOrderChange('asc')}
                  title={t('redis.sortAsc')}
                >
                  {t('redis.asc')}
                </Button>
                <Button
                  variant={sortOrder === 'desc' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => onSortOrderChange('desc')}
                  title={t('redis.sortDesc')}
                >
                  {t('redis.desc')}
                </Button>
              </div>
            )}
            <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-sm">
              <Plus className="h-4 w-4" /> {t("redis.addMember")}
            </Button>
          </div>
        </div>

        {showScanMore && (
          <div className="flex items-center px-1">
            <Button
              variant="outline"
              size="sm"
              className={`h-6 px-2 text-[11px] font-medium ${hasMore
                ? "text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                : "text-muted-foreground border-muted"
                }`}
              onClick={onScanMore}
              disabled={loading || !hasMore}
            >
              {loading ? t('common.scanning') : t('common.scanMore')}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/5">
        <Table>
          <TableHeader className="sticky top-0 bg-muted z-10">
            <TableRow>
              <TableHead className="w-1/2">{t("redis.member")}</TableHead>
              <TableHead className="w-1/3">{t("redis.score")}</TableHead>
              <TableHead className="w-[100px] text-right pr-8">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((item, i) => {
              const isEditing = inlineEditMember === item.member;
              return (
                <TableRow key={`${item.member}-${i}`} className="group hover:bg-muted/50">
                  {isEditing ? (
                    <TableCell className="font-mono text-xs align-top break-all whitespace-pre-wrap">
                      <Textarea
                        value={editMemberVal}
                        onChange={(e) => setEditMemberVal(e.target.value)}
                        className="min-h-[80px] font-mono text-xs"
                      />
                    </TableCell>
                  ) : (
                    <TextFormatterWrapper
                      content={item.member}
                      onEdit={() => handleStartEdit(item)}
                      onDelete={() => handleDelete(item.member)}
                      deleteConfirmPrompt={t('redis.deleteZSetMemberPrompt')}
                      deleteItemName={item.member}
                      readonly
                      title="View formatted"
                    >
                      <TableCell className="font-mono text-xs align-top break-all whitespace-pre-wrap cursor-context-menu">
                        {item.member}
                      </TableCell>
                    </TextFormatterWrapper>
                  )}
                  <TableCell className="font-mono text-xs align-top text-blue-600 dark:text-blue-400">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editScore}
                        onChange={(e) => setEditScore(e.target.value)}
                        className="h-8 w-32"
                      />
                    ) : (
                      item.score
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top pr-8">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleSaveEdit(item.member)}
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
                          onClick={() => handleStartEdit(item)}
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
                              {t('redis.deleteZSetMemberPrompt')}
                            </div>
                            <div className="px-2 pb-2 text-xs font-mono font-medium break-all">
                              {item.member}
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive cursor-pointer focus:bg-red-50"
                              onClick={() => handleDelete(item.member)}
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
            {members.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                  {t("redis.noMembers")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div ref={observerTarget} className="h-px w-full" />
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
            <DialogTitle>{t("redis.addMember")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="score">{t("redis.score")}</Label>
              <Input
                id="score"
                type="number"
                value={newItem.score}
                onChange={(e) => setNewItem({ ...newItem, score: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member">{t("redis.member")}</Label>
              <Textarea
                id="member"
                value={newItem.member}
                onChange={(e) => setNewItem({ ...newItem, member: e.target.value })}
                placeholder={t("redis.enterMember")}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => handleSave(newItem.member, newItem.score)}
              disabled={!newItem.member || !newItem.score || isSubmitting}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isSubmitting ? t("redis.adding") : t("redis.addMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
