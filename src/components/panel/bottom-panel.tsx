'use client';

import { useRef, useCallback, useEffect } from 'react';
import { usePanelStore } from '@/stores/panel-store';
import { TerminalTab } from './terminal-tab';
import { LogsTab } from './logs-tab';
import { X, Terminal, ScrollText, GripHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function BottomPanel() {
  const open = usePanelStore((s) => s.open);
  const height = usePanelStore((s) => s.height);
  const tabs = usePanelStore((s) => s.tabs);
  const activeTabId = usePanelStore((s) => s.activeTabId);
  const setHeight = usePanelStore((s) => s.setHeight);
  const removeTab = usePanelStore((s) => s.removeTab);
  const setActiveTab = usePanelStore((s) => s.setActiveTab);
  const toggle = usePanelStore((s) => s.toggle);
  const setOpen = usePanelStore((s) => s.setOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [height]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      setHeight(startHeight.current + delta);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setHeight]);

  if (tabs.length === 0) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div
      ref={panelRef}
      className="flex flex-col border-t bg-background shrink-0"
      style={{ height: open ? height : 36 }}
    >
      {/* Resize handle */}
      {open && (
        <div
          className="h-1 cursor-row-resize hover:bg-primary/20 active:bg-primary/30 flex items-center justify-center shrink-0"
          onMouseDown={handleMouseDown}
        >
          <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center border-b bg-card shrink-0 h-[35px]">
        <div className="flex items-center flex-1 overflow-x-auto min-w-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'flex items-center gap-1.5 px-3 h-[35px] border-r text-xs cursor-pointer hover:bg-accent shrink-0 max-w-[200px]',
                activeTabId === tab.id ? 'bg-background' : 'bg-card text-muted-foreground'
              )}
              onClick={() => { setActiveTab(tab.id); if (!open) setOpen(true); }}
            >
              {tab.type === 'exec' ? (
                <Terminal className="h-3 w-3 shrink-0" />
              ) : (
                <ScrollText className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{tab.title}</span>
              <button
                className="ml-1 rounded hover:bg-muted p-0.5 shrink-0"
                onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 mr-1 shrink-0" onClick={toggle}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Tab content */}
      {open && activeTab && (
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Terminal tabs use CSS hidden to preserve xterm state */}
          {tabs.filter((tab) => tab.type === 'exec').map((tab) => (
            <div key={tab.id} className={cn('h-full', tab.id === activeTabId ? 'block' : 'hidden')}>
              <TerminalTab tab={tab} active={tab.id === activeTabId} />
            </div>
          ))}
          {/* Logs tabs mount only when active to avoid idle WebSocket connections */}
          {activeTab.type === 'logs' && (
            <div className="h-full">
              <LogsTab tab={activeTab} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
