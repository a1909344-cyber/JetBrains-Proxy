import { useState, useEffect } from "react";
import { useGetModelsConfig, usePutModelsConfig, getGetModelsConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Save, RotateCcw, CloudDownload, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ModelsConfig } from "@workspace/api-client-react/src/generated/api.schemas";
import { useLang } from "@/lib/i18n";
import { adminFetch } from "@/lib/api";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function fetchUpstreamModels(): Promise<{ profiles: string[]; raw: unknown; url: string }> {
  const res = await adminFetch(`${BASE}/api/admin/proxy/fetch-upstream-models`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error || res.statusText);
  }
  return res.json();
}

export default function Models() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLang();

  const { data: config, isLoading } = useGetModelsConfig();
  const putConfig = usePutModelsConfig();

  const [localConfig, setLocalConfig] = useState<ModelsConfig>({ models: [], anthropic_model_mappings: {} });
  const [isDirty, setIsDirty] = useState(false);
  const [mappingsArray, setMappingsArray] = useState<{ key: string; val: string }[]>([]);

  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [upstreamModels, setUpstreamModels] = useState<string[]>([]);
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [selectedUpstream, setSelectedUpstream] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config)));
      const arr = Object.entries(config.anthropic_model_mappings || {}).map(([k, v]) => ({ key: k, val: v }));
      setMappingsArray(arr);
      setIsDirty(false);
    }
  }, [config]);

  const handleSave = () => {
    const newMappings: Record<string, string> = {};
    mappingsArray.forEach(m => {
      if (m.key.trim() && m.val.trim()) newMappings[m.key.trim()] = m.val.trim();
    });
    const payload: ModelsConfig = {
      models: localConfig.models.filter(m => m.trim()),
      anthropic_model_mappings: newMappings,
    };
    putConfig.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetModelsConfigQueryKey() });
        toast({ title: t("models_saved") });
        setIsDirty(false);
      },
      onError: (err: any) => {
        toast({ title: t("models_error"), description: err.message || t("models_error"), variant: "destructive" });
      },
    });
  };

  const handleReset = () => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config)));
      const arr = Object.entries(config.anthropic_model_mappings || {}).map(([k, v]) => ({ key: k, val: v }));
      setMappingsArray(arr);
      setIsDirty(false);
    }
  };

  const addModel = (id = "") => {
    setLocalConfig({ ...localConfig, models: [...localConfig.models, id] });
    setIsDirty(true);
  };
  const updateModel = (index: number, val: string) => {
    const newModels = [...localConfig.models];
    newModels[index] = val;
    setLocalConfig({ ...localConfig, models: newModels });
    setIsDirty(true);
  };
  const removeModel = (index: number) => {
    setLocalConfig({ ...localConfig, models: localConfig.models.filter((_, i) => i !== index) });
    setIsDirty(true);
  };

  const addMapping = () => { setMappingsArray([...mappingsArray, { key: "", val: "" }]); setIsDirty(true); };
  const updateMappingKey = (i: number, key: string) => {
    const n = [...mappingsArray]; n[i].key = key; setMappingsArray(n); setIsDirty(true);
  };
  const updateMappingVal = (i: number, val: string) => {
    const n = [...mappingsArray]; n[i].val = val; setMappingsArray(n); setIsDirty(true);
  };
  const removeMapping = (i: number) => { setMappingsArray(mappingsArray.filter((_, idx) => idx !== i)); setIsDirty(true); };

  const handleFetchUpstream = async () => {
    setFetchState("loading");
    setFetchError("");
    setUpstreamModels([]);
    setSelectedUpstream(new Set());
    try {
      const result = await fetchUpstreamModels();
      setUpstreamModels(result.profiles);
      setUpstreamUrl(result.url);
      const existing = new Set(localConfig.models);
      setSelectedUpstream(new Set(result.profiles.filter(p => !existing.has(p))));
      setFetchState("done");
    } catch (e: any) {
      setFetchError(e.message || "Unknown error");
      setFetchState("error");
    }
  };

  const toggleUpstreamModel = (id: string) => {
    setSelectedUpstream(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllUpstream = () => setSelectedUpstream(new Set(upstreamModels));
  const selectNewUpstream = () => {
    const existing = new Set(localConfig.models);
    setSelectedUpstream(new Set(upstreamModels.filter(p => !existing.has(p))));
  };
  const clearSelectionUpstream = () => setSelectedUpstream(new Set());

  const handleImportSelected = () => {
    const toAdd = [...selectedUpstream].filter(m => !localConfig.models.includes(m));
    if (toAdd.length === 0) {
      toast({ title: t("models_saved"), description: t("models_empty") });
      return;
    }
    setLocalConfig({ ...localConfig, models: [...localConfig.models, ...toAdd] });
    setIsDirty(true);
    toast({ title: `+${toAdd.length} model${toAdd.length > 1 ? "s" : ""}` });
    setFetchState("idle");
  };

  const handleReplaceAll = () => {
    if (selectedUpstream.size === 0) return;
    setLocalConfig({ ...localConfig, models: [...selectedUpstream] });
    setIsDirty(true);
    toast({ title: t("models_saved"), description: `${selectedUpstream.size} models loaded.` });
    setFetchState("idle");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("models_title")}</h1>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const existingSet = new Set(localConfig.models);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("models_title")}</h1>
          <p className="text-muted-foreground mt-2">{t("models_desc")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleFetchUpstream}
            disabled={fetchState === "loading"}
            data-testid="btn-fetch-upstream"
          >
            {fetchState === "loading"
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <CloudDownload className="mr-2 h-4 w-4" />}
            {fetchState === "loading" ? t("models_fetching") : t("models_fetch")}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={!isDirty} data-testid="btn-reset">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || putConfig.isPending} data-testid="btn-save-models">
            <Save className="mr-2 h-4 w-4" />
            {putConfig.isPending ? t("models_saving") : t("models_save")}
          </Button>
        </div>
      </div>

      {fetchState === "error" && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            <strong>{t("models_fetch_err")}：</strong>{fetchError}
          </CardContent>
        </Card>
      )}

      {fetchState === "done" && upstreamModels.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">{t("models_fetch_title")} ({upstreamModels.length})</CardTitle>
                <CardDescription className="text-xs font-mono mt-0.5 truncate">{upstreamUrl}</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="ghost" onClick={selectAllUpstream} className="text-xs h-7">{t("models_select_all")}</Button>
                <Button size="sm" variant="ghost" onClick={selectNewUpstream} className="text-xs h-7">{t("models_fetch_append")}</Button>
                <Button size="sm" variant="ghost" onClick={clearSelectionUpstream} className="text-xs h-7">{t("models_select_none")}</Button>
                <Button size="sm" variant="secondary" onClick={handleImportSelected} disabled={selectedUpstream.size === 0} className="h-7">
                  {t("models_fetch_append")} ({selectedUpstream.size})
                </Button>
                <Button size="sm" onClick={handleReplaceAll} disabled={selectedUpstream.size === 0} className="h-7">
                  {t("models_fetch_replace")} ({selectedUpstream.size})
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFetchState("idle")} className="text-xs h-7 text-muted-foreground">{t("models_fetch_cancel")}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {upstreamModels.map(model => {
                const isSelected = selectedUpstream.has(model);
                const isExisting = existingSet.has(model);
                return (
                  <label
                    key={model}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-colors text-sm font-mono
                      ${isSelected ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-muted/30"}
                    `}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleUpstreamModel(model)}
                      className="shrink-0"
                    />
                    <span className="truncate">{model}</span>
                    {isExisting && (
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">✓</span>
                    )}
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {fetchState === "done" && upstreamModels.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-600">
            {t("models_empty")}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("models_model_id")}</CardTitle>
                <CardDescription>GET /v1/models</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={() => addModel()} data-testid="btn-add-model">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {localConfig.models.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">{t("models_empty")}</p>
            ) : (
              localConfig.models.map((model, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={model}
                    onChange={e => updateModel(i, e.target.value)}
                    placeholder="e.g., anthropic-claude-3.7-sonnet"
                    className="font-mono text-sm"
                    data-testid={`input-model-${i}`}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeModel(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("models_anthropic_maps")}</CardTitle>
                <CardDescription>{t("models_anthropic_desc")}</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={addMapping} data-testid="btn-add-mapping">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {mappingsArray.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">{t("models_empty")}</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_1fr_40px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <div>{t("models_key")}</div>
                  <div>{t("models_value")}</div>
                  <div></div>
                </div>
                {mappingsArray.map((mapping, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <Input
                      value={mapping.key}
                      onChange={e => updateMappingKey(i, e.target.value)}
                      placeholder="e.g., claude-3-opus"
                      className="font-mono text-sm"
                      data-testid={`input-map-key-${i}`}
                    />
                    <Input
                      value={mapping.val}
                      onChange={e => updateMappingVal(i, e.target.value)}
                      placeholder="e.g., anthropic-claude-3.5-sonnet"
                      className="font-mono text-sm"
                      data-testid={`input-map-val-${i}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeMapping(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
