import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Pencil, Trash2, Check, X } from "lucide-react";
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

interface RedisZSetViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  data: any[]; // [member, score, member, score...]
  loading: boolean;
  hasMore: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
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
  onRefresh,
  observerTarget,
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

  const handleSave = async (member: string, score: string) => {
    try {
      setIsSubmitting(true);
      await invoke("execute_redis_command", {
        connectionId,
        command: "ZADD",
        args: [keyName, score, member],
        db,
      });
      onRefresh();
      setInlineEditMember(null);
      setIsAddDialogOpen(false);
      setNewItem({ member: "", score: "0" });
    } catch (error) {
      console.error("Failed to save zset member", error);
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
        await invoke("execute_redis_command", {
          connectionId,
          command: "ZREM",
          args: [keyName, oldMember],
          db,
        });
      }
      // ZADD (update score or add new member)
      await invoke("execute_redis_command", {
        connectionId,
        command: "ZADD",
        args: [keyName, editScore, editMemberVal],
        db,
      });
      onRefresh();
      handleCancelEdit();
    } catch (error) {
      console.error("Failed to update zset member", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (member: string) => {
    if (!confirm(t("redis.deleteConfirm"))) return;
    try {
      await invoke("execute_redis_command", {
        connectionId,
        command: "ZREM",
        args: [keyName, member],
        db,
      });
      onRefresh();
    } catch (error) {
      console.error("Failed to delete zset member", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b flex justify-between items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("redis.filterKeys")}
            className="pl-8 h-9"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {t("redis.total")}: {members.length}
          {hasMore ? "+" : ""}
        </div>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> {t("redis.addMember")}
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/5">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-1/2">{t("redis.member")}</TableHead>
              <TableHead className="w-1/3">{t("redis.score")}</TableHead>
              <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((item, i) => {
              const isEditing = inlineEditMember === item.member;
              return (
                <TableRow key={`${item.member}-${i}`} className="group hover:bg-muted/50">
                  <TableCell className="font-mono text-xs align-top break-all whitespace-pre-wrap">
                    {isEditing ? (
                      <Textarea
                        value={editMemberVal}
                        onChange={(e) => setEditMemberVal(e.target.value)}
                        className="min-h-[80px] font-mono text-xs"
                      />
                    ) : (
                      item.member
                    )}
                  </TableCell>
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
                  <TableCell className="text-right align-top">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(item.member)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
            >
              {isSubmitting ? t("redis.adding") : t("redis.addMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
