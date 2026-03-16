import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TextFormatterWrapper } from "@/components/common/TextFormatterWrapper.tsx";
import Editor from "@monaco-editor/react";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  detectFormats,
  applyFormat,
  getFormatLabel,
  type FormatType,
} from "@/lib/formatters.ts";
import { invokeRedisCommand } from "@/lib/api.ts";
import { toast } from "@/hooks/useToast.ts";

interface RedisStringViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  value: any;
  loading?: boolean;
  onRefresh: () => void;
}

export function RedisStringViewer({
  connectionId,
  db,
  keyName,
  value,
  loading = false,
  onRefresh,
}: RedisStringViewerProps) {
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const [content, setContent] = useState("");
  const [displayedContent, setDisplayedContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableFormats, setAvailableFormats] = useState<FormatType[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>("raw");

  useEffect(() => {
    if (value === null || value === undefined) {
      setContent("");
      setDisplayedContent("");
      setAvailableFormats(['raw']);
      return;
    }
    const valStr = String(value);
    setContent(valStr);
    setDisplayedContent(valStr);
    setAvailableFormats(detectFormats(valStr));
    setSelectedFormat("raw");
  }, [value]);

  const handleApplyFormat = (format: string) => {
    setSelectedFormat(format);
    if (format === "raw") {
      setDisplayedContent(content);
      return;
    }

    const result = applyFormat(content, format as FormatType);
    if (result.success) {
      setDisplayedContent(result.content);
    }
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);

      await invokeRedisCommand({
              connectionId,
              command: "SET",
              args: [keyName, displayedContent],
              db,
            });
      onRefresh();
      toast({ title: t('redis.savedSuccess'), variant: 'subtle' });
    } catch (error) {
      console.error("Failed to save string value", error);
      toast({ title: t('redis.saveFailed'), description: String(error), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="flex flex-col h-full bg-background">
      <div className="p-2 border-b flex justify-between items-center bg-muted/5 shrink-0">
        <div className="flex gap-2 items-center">
          <Select
            value={selectedFormat}
            onValueChange={handleApplyFormat}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Format / Transform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raw" className="text-xs font-semibold">
                {t('common.originalData', 'Original Data')}
              </SelectItem>
              {availableFormats.filter(f => f !== 'raw').map((format) => (
                <SelectItem key={format} value={format} className="text-xs">
                  {getFormatLabel(format)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSubmitting} className="h-8 gap-1 bg-blue-600 hover:bg-blue-500 text-white shadow-sm">
          <Save className="h-4 w-4" />
          {isSubmitting ? t('redis.saving') : t('redis.saveChanges')}
        </Button>
      </div>
      <div className="flex-1 flex flex-col min-h-0 p-4">
        {loading && !content && (
          <div className="mb-3 text-xs text-muted-foreground">
            {t('redis.loadingValue', 'Loading value...')}
          </div>
        )}
        <TextFormatterWrapper
          content={displayedContent}
          onSave={(newContent) => setDisplayedContent(newContent)}
          title="Format Value"
          originalContent={content}
          initialFormat={selectedFormat as FormatType}
        >
          <div className="flex-1 flex flex-col min-h-0 border rounded-md overflow-hidden">
            <Editor
              height="100%"
              language={
                selectedFormat === "json" || selectedFormat === "json-minified" ? "json" :
                selectedFormat === "xml" ? "xml" : "plaintext"
              }
              theme={isDark ? "vs-dark" : "light"}
              value={displayedContent}
              onChange={(value) => setDisplayedContent(value || "")}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
                fontSize: 14,
                formatOnPaste: true,
                contextmenu: false,
              }}
            />
          </div>
        </TextFormatterWrapper>
      </div>
    </div>
  );
}
