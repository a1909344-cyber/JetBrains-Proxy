import { useState } from "react";
import { useGetClientKeys, usePutClientKeys, getGetClientKeysQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Copy, Eye, EyeOff, Key } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/i18n";

export default function Keys() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLang();
  
  const { data: keys, isLoading } = useGetClientKeys();
  const putKeys = usePutClientKeys();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys || !newKey.trim()) return;

    if (keys.includes(newKey.trim())) {
      toast({ title: t("keys_duplicate"), description: t("keys_duplicate_desc"), variant: "destructive" });
      return;
    }

    const newKeys = [...keys, newKey.trim()];

    putKeys.mutate({ data: newKeys }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientKeysQueryKey() });
        toast({ title: t("keys_added"), description: t("keys_added_desc") });
        setIsAddOpen(false);
        setNewKey("");
      },
      onError: (err: any) => {
        toast({ title: t("keys_error"), description: err.message || t("keys_error"), variant: "destructive" });
      }
    });
  };

  const handleDelete = (index: number) => {
    if (!keys) return;
    if (!confirm(t("keys_delete_confirm"))) return;

    const newKeys = keys.filter((_, i) => i !== index);
    
    putKeys.mutate({ data: newKeys }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientKeysQueryKey() });
        toast({ title: t("keys_deleted") });
      },
      onError: (err: any) => {
        toast({ title: t("keys_error"), description: err.message || t("keys_error"), variant: "destructive" });
      }
    });
  };

  const toggleReveal = (index: number) => {
    const newRevealed = new Set(revealedKeys);
    if (newRevealed.has(index)) {
      newRevealed.delete(index);
    } else {
      newRevealed.add(index);
    }
    setRevealedKeys(newRevealed);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: t("keys_copied"), description: t("keys_copied_desc") });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("keys_title")}</h1>
          <p className="text-muted-foreground mt-2">{t("keys_desc")}</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) setNewKey("");
        }}>
          <DialogTrigger asChild>
            <Button data-testid="btn-add-key">
              <Plus className="mr-2 h-4 w-4" />
              {t("keys_generate")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{t("keys_add_title")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input 
                    placeholder={t("keys_placeholder")}
                    value={newKey} 
                    onChange={e => setNewKey(e.target.value)}
                    data-testid="input-new-key"
                  />
                  <Button 
                    type="button" 
                    variant="secondary"
                    onClick={() => setNewKey('sk-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15))}
                    title={t("keys_auto")}
                  >
                    {t("keys_auto")}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">{t("keys_cancel")}</Button>
                </DialogClose>
                <Button type="submit" disabled={!newKey.trim() || putKeys.isPending} data-testid="btn-save-key">
                  {putKeys.isPending ? t("keys_saving") : t("keys_save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : keys?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-48 text-center">
            <Key className="h-8 w-8 text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground">{t("keys_empty")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("keys_empty_hint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {keys?.map((key, i) => {
            const isRevealed = revealedKeys.has(i);
            const displayKey = isRevealed ? key : `${key.substring(0, 6)}********************`;
            
            return (
              <div key={i} className="flex items-center justify-between p-4 border border-border rounded-md bg-card shadow-sm group hover:border-primary/50 transition-colors" data-testid={`row-key-${i}`}>
                <div className="flex items-center gap-3 font-mono text-sm break-all">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span className={isRevealed ? "text-foreground" : "text-muted-foreground"}>
                    {displayKey}
                  </span>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(key)} title={t("keys_copy")} data-testid={`btn-copy-${i}`}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleReveal(i)} title={isRevealed ? t("keys_hide") : t("keys_reveal")} data-testid={`btn-reveal-${i}`}>
                    {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(i)} className="text-destructive hover:text-destructive hover:bg-destructive/10" title={t("keys_delete")} data-testid={`btn-delete-${i}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
