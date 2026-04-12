import { useState, useEffect, useRef } from "react";
import { useGetModelsConfig, usePutModelsConfig, getGetModelsConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Save, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ModelsConfig } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Models() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: config, isLoading } = useGetModelsConfig();
  const putConfig = usePutModelsConfig();
  
  const [localConfig, setLocalConfig] = useState<ModelsConfig>({ models: [], anthropic_model_mappings: {} });
  const [isDirty, setIsDirty] = useState(false);
  
  // Custom tracking for mappings array UI
  const [mappingsArray, setMappingsArray] = useState<{key: string, val: string}[]>([]);

  // Init local state when data loads
  useEffect(() => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config))); // deep copy
      const arr = Object.entries(config.anthropic_model_mappings || {}).map(([k, v]) => ({ key: k, val: v }));
      setMappingsArray(arr);
      setIsDirty(false);
    }
  }, [config]);

  const handleSave = () => {
    // Reconstruct mapping object from array
    const newMappings: Record<string, string> = {};
    mappingsArray.forEach(m => {
      if (m.key.trim() && m.val.trim()) {
        newMappings[m.key.trim()] = m.val.trim();
      }
    });

    const payload: ModelsConfig = {
      models: localConfig.models.filter(m => m.trim()),
      anthropic_model_mappings: newMappings
    };

    putConfig.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetModelsConfigQueryKey() });
        toast({ title: "Models Saved", description: "Model configurations updated successfully." });
        setIsDirty(false);
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to save models.", variant: "destructive" });
      }
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

  // Models Array Handlers
  const addModel = () => {
    setLocalConfig({ ...localConfig, models: [...localConfig.models, ""] });
    setIsDirty(true);
  };
  
  const updateModel = (index: number, val: string) => {
    const newModels = [...localConfig.models];
    newModels[index] = val;
    setLocalConfig({ ...localConfig, models: newModels });
    setIsDirty(true);
  };
  
  const removeModel = (index: number) => {
    const newModels = localConfig.models.filter((_, i) => i !== index);
    setLocalConfig({ ...localConfig, models: newModels });
    setIsDirty(true);
  };

  // Mappings Handlers
  const addMapping = () => {
    setMappingsArray([...mappingsArray, { key: "", val: "" }]);
    setIsDirty(true);
  };
  
  const updateMappingKey = (index: number, key: string) => {
    const newArr = [...mappingsArray];
    newArr[index].key = key;
    setMappingsArray(newArr);
    setIsDirty(true);
  };
  
  const updateMappingVal = (index: number, val: string) => {
    const newArr = [...mappingsArray];
    newArr[index].val = val;
    setMappingsArray(newArr);
    setIsDirty(true);
  };
  
  const removeMapping = (index: number) => {
    const newArr = mappingsArray.filter((_, i) => i !== index);
    setMappingsArray(newArr);
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Models Configuration</h1>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Models Configuration</h1>
          <p className="text-muted-foreground mt-2">Manage available models and Anthropic mappings.</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!isDirty} data-testid="btn-reset">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || putConfig.isPending} data-testid="btn-save-models">
            <Save className="mr-2 h-4 w-4" />
            {putConfig.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Available Models List */}
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Available Models</CardTitle>
                <CardDescription>Models exposed by GET /v1/models</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={addModel} data-testid="btn-add-model">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {localConfig.models.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">No models configured.</p>
            ) : (
              localConfig.models.map((model, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input 
                    value={model} 
                    onChange={(e) => updateModel(i, e.target.value)} 
                    placeholder="e.g., gpt-4-turbo"
                    className="font-mono text-sm"
                    data-testid={`input-model-${i}`}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeModel(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Anthropic Mappings */}
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Anthropic Mappings</CardTitle>
                <CardDescription>Map OpenAI model IDs to JetBrains Anthropic models</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={addMapping} data-testid="btn-add-mapping">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {mappingsArray.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">No mappings configured.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_1fr_40px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <div>Proxy Input (OpenAI style)</div>
                  <div>JetBrains Output</div>
                  <div></div>
                </div>
                {mappingsArray.map((mapping, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <Input 
                      value={mapping.key} 
                      onChange={(e) => updateMappingKey(i, e.target.value)} 
                      placeholder="e.g., claude-3-opus"
                      className="font-mono text-sm"
                      data-testid={`input-map-key-${i}`}
                    />
                    <Input 
                      value={mapping.val} 
                      onChange={(e) => updateMappingVal(i, e.target.value)} 
                      placeholder="e.g., claude-3-opus-20240229"
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
