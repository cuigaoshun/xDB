import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (value === null || value === undefined) {
      setContent("");
      return;
    }
    
    if (typeof value === "object") {
      setContent(JSON.stringify(value, null, 2));
    } else {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "object" && parsed !== null) {
            setContent(JSON.stringify(parsed, null, 2));
        } else {
            setContent(String(value));
        }
      } catch {
        setContent(String(value));
      }
    }
  }, [value]);

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      
      // Minify JSON if it was detected as JSON?
      // Or just save as is. Users might want pretty printed JSON in Redis.
      // Let's save as is.
      
      await invoke("execute_redis_command", {
        connectionId,
        command: "SET",
        args: [keyName, content],
        db,
      });
      
      onRefresh();
      // Optional: show toast
    } catch (error) {
      console.error("Failed to save string value", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
    } catch (e) {
      // Not valid JSON
      console.error("Invalid JSON", e);
    }
  };

  const handleMinifyJson = () => {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed));
    } catch (e) {
      console.error("Invalid JSON", e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex justify-between items-center bg-muted/5">
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleFormatJson} disabled={!content}>
                {t('redis.prettify')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleMinifyJson} disabled={!content}>
                {t('redis.minify')}
            </Button>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSubmitting} className="gap-1">
          <Save className="h-4 w-4" /> 
          {isSubmitting ? t('redis.saving') : t('redis.saveChanges')}
        </Button>
      </div>
      <div className="flex-1 p-4 bg-background">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="font-mono h-full resize-none text-sm"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
