import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { TextFormatterWrapper } from "@/components/common/TextFormatterWrapper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectFormats,
  applyFormat,
  getFormatLabel,
  type FormatType,
} from "@/lib/formatters";

interface RedisStringViewerProps {
  connectionId: number;
  db: number;
  keyName: string;
  value: any;
  onRefresh: () => void;
}

export function RedisStringViewer({
  connectionId,
  db,
  keyName,
  value,
  onRefresh,
}: RedisStringViewerProps) {
  const { t } = useTranslation();
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

      await invoke("execute_redis_command", {
        connectionId,
        command: "SET",
        args: [keyName, displayedContent],
        db,
      });

      onRefresh();
    } catch (error) {
      console.error("Failed to save string value", error);
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
                Original Data
              </SelectItem>
              {availableFormats.filter(f => f !== 'raw').map((format) => (
                <SelectItem key={format} value={format} className="text-xs">
                  {getFormatLabel(format)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSubmitting} className="h-8 gap-1">
          <Save className="h-4 w-4" />
          {isSubmitting ? t('redis.saving') : t('redis.saveChanges')}
        </Button>
      </div>
      <div className="flex-1 flex flex-col min-h-0 p-4">
        <TextFormatterWrapper
          content={displayedContent}
          onSave={(newContent) => setDisplayedContent(newContent)}
          title="Format Value"
        >
          <div className="flex-1 flex flex-col min-h-0">
            <Textarea
              value={displayedContent}
              onChange={(e) => setDisplayedContent(e.target.value)}
              className="font-mono flex-1 resize-none text-sm p-4 cursor-context-menu"
              spellCheck={false}
            />
          </div>
        </TextFormatterWrapper>
      </div>
    </div>
  );
}
