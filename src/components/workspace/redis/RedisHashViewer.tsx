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

interface RedisHashViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  data: any[]; // [field, value, field, value...]
  loading: boolean;
  hasMore: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onSearch: () => void;
  onRefresh: () => void;
  observerTarget: React.RefObject<HTMLDivElement | null>;
  exactSearch?: boolean;
  onExactSearchChange?: (exact: boolean) => void;
}

export function RedisHashViewer({
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
  exactSearch = false,
  onExactSearchChange,
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
    try {
      setIsSubmitting(true);
      await invokeRedisCommand({
              connectionId,
              command: "HSET",
              args: [keyName, field, value],
              db,
            });
      onRefresh();
      setInlineEditField(null);
      setEditValue("");
      setIsAddDialogOpen(false);
      setNewField({ field: "", value: "" });
      toast({ title: t('redis.savedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to save hash field", error);
      toast({ title: t('redis.saveFailed'), description: String(error), variant: 'destructive' });
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
    try {
      await invokeRedisCommand({
              connectionId,
              command: "HDEL",
              args: [keyName, field],
              db,
            });
      onRefresh();
      toast({ title: t('redis.deletedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to delete hash field", error);
      toast({ title: t('redis.deleteFailed'), description: String(error), variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b flex justify-between items-center gap-2">
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
            placeholder={t('redis.filterKeys')}
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
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-sm">
          <Plus className="h-4 w-4" /> {t('redis.addField')}
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-muted/5">
        <Table>
          <TableHeader className="sticky top-0 bg-muted z-10">
            <TableRow>
              <TableHead className="w-1/3">{t('redis.field')}</TableHead>
              <TableHead className="w-1/2">{t('redis.value')}</TableHead>
              <TableHead className="w-[100px] text-right pr-8">{t('common.actions')}</TableHead>
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
                  <TableCell className="text-right align-top pr-8">
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
                              {t('redis.deleteHashFieldPrompt')}
                            </div>
                            <div className="px-2 pb-2 text-xs font-mono font-medium break-all">
                              {pair.field}
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive cursor-pointer focus:bg-red-50"
                              onClick={() => handleDelete(pair.field)}
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
