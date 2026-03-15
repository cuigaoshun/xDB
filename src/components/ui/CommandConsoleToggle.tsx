import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommandConsole } from './CommandConsole';

export function CommandConsoleToggle() {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  const toggleConsole = () => {
    setIsVisible(!isVisible);
  };

  return (
    <>
      {/* Toggle button */}
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={toggleConsole}
          size="sm"
          className="shadow-lg"
          variant={isVisible ? "default" : "secondary"}
        >
          <Terminal className="w-4 h-4 mr-2" />
          {t('common.terminal', '命令控制台')}
          {isVisible ? <ChevronDown className="w-4 h-4 ml-2" /> : <ChevronUp className="w-4 h-4 ml-2" />}
        </Button>
      </div>

      {/* Console */}
      {isVisible && <CommandConsole />}
    </>
  );
}
