import { useRef, useEffect, useState } from "react";
import { useGetProxyLogs } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCcw, ScrollText, Search, X } from "lucide-react";
import { useLang } from "@/lib/i18n";

export default function Logs() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [linesToFetch, setLinesToFetch] = useState(200);
  const [searchQuery, setSearchQuery] = useState("");
  const { t, lang } = useLang();

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

  const filteredLines = (logs?.lines ?? []).filter(line =>
    !searchQuery || line.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const matchCount = searchQuery ? filteredLines.length : null;

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("logs_title")}</h1>
          <p className="text-muted-foreground mt-1">{t("logs_desc")}</p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={String(linesToFetch)}
            onValueChange={v => setLinesToFetch(Number(v))}
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">100 {lang === "en" ? "lines" : "行"}</SelectItem>
              <SelectItem value="200">200 {lang === "en" ? "lines" : "行"}</SelectItem>
              <SelectItem value="500">500 {lang === "en" ? "lines" : "行"}</SelectItem>
              <SelectItem value="1000">1000 {lang === "en" ? "lines" : "行"}</SelectItem>
            </SelectContent>
          </Select>

          <div className="text-xs text-muted-foreground font-mono">
            {matchCount !== null
              ? `${matchCount}/${logs?.lines?.length || 0} ${lang === "en" ? "matches" : "条匹配"}`
              : `${logs?.lines?.length || 0} ${t("logs_lines")}`}
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
        <div className="bg-sidebar-accent px-4 py-2 border-b border-sidebar-border flex items-center justify-between text-xs font-mono text-sidebar-accent-foreground shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ScrollText className="h-4 w-4 shrink-0" />
            <span className="truncate">{logs?.file || (lang === "en" ? "waiting for log file..." : "等待日志文件...")}</span>
            {logs?.note && <span className="text-yellow-500 shrink-0">({logs.note})</span>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={lang === "en" ? "Filter…" : "过滤…"}
                className="h-6 pl-6 pr-6 text-xs w-36 font-mono"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
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
          {filteredLines.length > 0 ? (
            filteredLines.map((line, i) => {
              if (!searchQuery) {
                return (
                  <div key={i} className={`whitespace-pre-wrap break-all ${getLogColorClass(line)} hover:bg-background/10 px-1 -mx-1 rounded`}>
                    {line}
                  </div>
                );
              }
              const idx = line.toLowerCase().indexOf(searchQuery.toLowerCase());
              return (
                <div key={i} className={`whitespace-pre-wrap break-all ${getLogColorClass(line)} hover:bg-background/10 px-1 -mx-1 rounded`}>
                  {line.slice(0, idx)}
                  <mark className="bg-yellow-300 text-black rounded">{line.slice(idx, idx + searchQuery.length)}</mark>
                  {line.slice(idx + searchQuery.length)}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground italic gap-2">
              <ScrollText className="h-8 w-8 opacity-30" />
              <span>{searchQuery ? (lang === "en" ? "No lines match the filter" : "没有符合过滤条件的日志") : (logs?.note || t("logs_empty"))}</span>
              {!logs?.lines?.length && !isFetching && (
                <span className="text-xs text-center max-w-xs">
                  {lang === "en"
                    ? "In Docker, logs are written to /data/proxy.log on the shared volume. Make sure you're using docker-compose v2.2.x or later."
                    : "Docker 环境中日志写入共享卷的 /data/proxy.log，请确保使用 docker-compose v2.2.x 或更新版本。"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
