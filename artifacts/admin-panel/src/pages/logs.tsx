import { useRef, useEffect, useState } from "react";
import { useGetProxyLogs } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { RefreshCcw, ScrollText } from "lucide-react";
import { useLang } from "@/lib/i18n";

export default function Logs() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [linesToFetch] = useState(100);
  const { t } = useLang();

  const { data: logs, refetch, isFetching } = useGetProxyLogs(
    { lines: linesToFetch },
    { query: { refetchInterval: 5000 } }
  );

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs?.lines, autoScroll]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
      setAutoScroll(isAtBottom);
    }
  };

  const getLogColorClass = (line: string) => {
    if (line.includes('ERROR') || line.includes('Exception') || line.includes('Traceback')) return 'text-destructive font-bold';
    if (line.includes('WARN')) return 'text-yellow-500';
    if (line.includes('INFO')) return 'text-primary/90';
    if (line.includes('DEBUG')) return 'text-muted-foreground';
    if (line.includes('200 OK')) return 'text-green-500';
    if (line.includes('400') || line.includes('401') || line.includes('403') || line.includes('404')) return 'text-yellow-500';
    if (line.includes('500') || line.includes('502') || line.includes('503')) return 'text-destructive';
    return 'text-foreground';
  };

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("logs_title")}</h1>
          <p className="text-muted-foreground mt-1">{t("logs_desc")}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-xs text-muted-foreground font-mono">
            {logs?.lines?.length || 0} {t("logs_lines")}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isFetching}
            data-testid="btn-refresh-logs"
          >
            <RefreshCcw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            {t("logs_refresh")}
          </Button>
        </div>
      </div>

      <div className="flex-1 border border-border bg-sidebar rounded-md overflow-hidden flex flex-col shadow-inner">
        <div className="bg-sidebar-accent px-4 py-2 border-b border-sidebar-border flex items-center justify-between text-xs font-mono text-sidebar-accent-foreground shrink-0">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            <span>{logs?.file || '/proxy.log'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 cursor-pointer select-none" onClick={() => setAutoScroll(!autoScroll)}>
              <span className={`h-2 w-2 rounded-full ${autoScroll ? 'bg-primary' : 'bg-muted-foreground'}`}></span>
              {t("logs_autoscroll")}
            </span>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
        >
          {logs?.lines && logs.lines.length > 0 ? (
            logs.lines.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${getLogColorClass(line)} hover:bg-background/10 px-1 -mx-1 rounded`}>
                {line}
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground italic">
              {logs?.note || t("logs_empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
