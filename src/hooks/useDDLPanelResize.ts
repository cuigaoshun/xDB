import { useEffect, useRef } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

/**
 * Hook to auto-resize a DDL panel based on the number of lines in the content.
 * Returns a ref to attach to the ResizablePanel.
 */
export function useDDLPanelResize(content: string, visible: boolean, isLoading?: boolean) {
    const panelRef = useRef<ImperativePanelHandle>(null);

    useEffect(() => {
        const ready = visible && content && content !== 'Loading...' && !isLoading && panelRef.current;
        if (!ready) return;

        // Get the actual panel group container height for accurate calculation
        const panelEl = (panelRef.current as any)?.getHandleElement?.()?.parentElement
            ?? document.querySelector('[data-panel-group-direction="vertical"]');
        const totalHeight = panelEl?.getBoundingClientRect().height || window.innerHeight * 0.8;

        const lines = content.split('\n').length;
        const desiredHeight = lines * 22 + 40;
        const percentage = Math.min(55, Math.max(15, (desiredHeight / totalHeight) * 100));
        panelRef.current!.resize(percentage);
    }, [content, visible, isLoading]);

    return panelRef;
}
