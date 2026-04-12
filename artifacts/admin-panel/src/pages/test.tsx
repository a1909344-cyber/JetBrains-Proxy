import { useState } from "react";
import { useTestProxyModels, useTestProxyChat, useGetModelsConfig } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Play, Terminal, CheckCircle2, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProxyTestResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { useLang } from "@/lib/i18n";

export default function Test() {
  const { toast } = useToast();
  const { t } = useLang();
  const { data: config } = useGetModelsConfig();
  
  const testModels = useTestProxyModels();
  const testChat = useTestProxyChat();
  
  const [apiKey, setApiKey] = useState("");
  
  const [chatModel, setChatModel] = useState("");
  const [chatMessage, setChatMessage] = useState("Hello, what model are you?");
  
  const [modelsResult, setModelsResult] = useState<ProxyTestResult | null>(null);
  const [chatResult, setChatResult] = useState<ProxyTestResult | null>(null);

  const handleTestModels = () => {
    if (!apiKey) {
      toast({ title: t("test_apikey_required"), variant: "destructive" });
      return;
    }
    
    setModelsResult(null);
    testModels.mutate({ data: { apiKey } }, {
      onSuccess: (data) => setModelsResult(data),
      onError: (err: any) => {
        toast({ title: t("test_failed"), description: err.message, variant: "destructive" });
        setModelsResult({ ok: false, status: 500, error: err.message });
      }
    });
  };

  const handleTestChat = () => {
    if (!apiKey) {
      toast({ title: t("test_apikey_required"), variant: "destructive" });
      return;
    }
    if (!chatModel) {
      toast({ title: t("test_model_required"), variant: "destructive" });
      return;
    }
    
    setChatResult(null);
    testChat.mutate({ 
      data: { 
        apiKey,
        model: chatModel,
        messages: [{ role: "user", content: chatMessage }],
        stream: false
      } 
    }, {
      onSuccess: (data) => setChatResult(data),
      onError: (err: any) => {
        toast({ title: t("test_failed"), description: err.message, variant: "destructive" });
        setChatResult({ ok: false, status: 500, error: err.message });
      }
    });
  };

  const StatusBadge = ({ result }: { result: ProxyTestResult | null }) => {
    if (!result) return null;
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border ${result.ok ? 'bg-primary/10 text-primary border-primary/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
        {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        HTTP {result.status}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("test_title")}</h1>
        <p className="text-muted-foreground mt-2">{t("test_desc")}</p>
      </div>

      <Card className="border-primary/30 shadow-[0_0_15px_-5px_hsl(var(--primary)/0.2)]">
        <CardHeader className="pb-4 border-b border-border bg-muted/20">
          <CardTitle className="text-lg">{t("test_apikey")}</CardTitle>
          <CardDescription>{t("test_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 max-w-xl">
            <Label htmlFor="apiKey" className="whitespace-nowrap">Bearer Token</Label>
            <Input 
              id="apiKey" 
              placeholder={t("test_apikey_placeholder")}
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)} 
              className="font-mono bg-background"
              data-testid="input-test-apikey"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* /v1/models */}
        <Card className="flex flex-col">
          <CardHeader className="border-b border-border bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-mono text-base flex items-center gap-2">
                  <span className="bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs">GET</span>
                  /v1/models
                </CardTitle>
                <CardDescription className="mt-1">{t("test_models_desc")}</CardDescription>
              </div>
              <Button onClick={handleTestModels} disabled={testModels.isPending} size="sm" data-testid="btn-test-models">
                <Play className="mr-2 h-4 w-4" />
                {testModels.isPending ? t("test_models_running") : t("test_models_run")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0">
            {modelsResult && (
              <div className="p-4 border-b border-border flex items-center justify-between bg-card">
                <span className="text-sm text-muted-foreground">{t("test_response")}</span>
                <StatusBadge result={modelsResult} />
              </div>
            )}
            <div className="bg-sidebar p-4 flex-1 font-mono text-xs overflow-auto max-h-[400px]">
              {modelsResult ? (
                <pre className={`whitespace-pre-wrap break-all ${modelsResult.error ? 'text-destructive' : 'text-foreground'}`}>
                  {modelsResult.error || JSON.stringify(modelsResult.data, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground opacity-50 flex-col gap-2">
                  <Terminal className="h-8 w-8" />
                  <span>{t("test_response")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* /v1/chat/completions */}
        <Card className="flex flex-col">
          <CardHeader className="border-b border-border bg-muted/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-mono text-base flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs">POST</span>
                  /v1/chat/completions
                </CardTitle>
                <CardDescription className="mt-1">{t("test_chat_desc")}</CardDescription>
              </div>
              <Button onClick={handleTestChat} disabled={testChat.isPending} size="sm" data-testid="btn-test-chat">
                <Play className="mr-2 h-4 w-4" />
                {testChat.isPending ? t("test_chat_running") : t("test_chat_run")}
              </Button>
            </div>
            
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("test_chat_model")}</Label>
                <Select value={chatModel} onValueChange={setChatModel}>
                  <SelectTrigger className="h-8 text-xs font-mono">
                    <SelectValue placeholder={t("test_chat_model_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {config?.models?.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                    {(!config?.models || config.models.length === 0) && (
                      <SelectItem value="gpt-4-turbo">gpt-4-turbo (fallback)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("test_chat_message")}</Label>
                <Textarea 
                  value={chatMessage} 
                  onChange={e => setChatMessage(e.target.value)} 
                  className="min-h-[80px] text-sm resize-none font-mono"
                  data-testid="input-chat-msg"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 border-t border-border">
            {chatResult && (
              <div className="p-4 border-b border-border flex items-center justify-between bg-card">
                <span className="text-sm text-muted-foreground">{t("test_response")}</span>
                <StatusBadge result={chatResult} />
              </div>
            )}
            <div className="bg-sidebar p-4 flex-1 font-mono text-xs overflow-auto max-h-[300px]">
              {chatResult ? (
                <pre className={`whitespace-pre-wrap break-all ${chatResult.error ? 'text-destructive' : 'text-foreground'}`}>
                  {chatResult.error || JSON.stringify(chatResult.data, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground opacity-50 flex-col gap-2 py-12">
                  <Terminal className="h-8 w-8" />
                  <span>{t("test_response")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
