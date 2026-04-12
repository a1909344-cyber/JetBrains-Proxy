import { useState } from "react";
import { useGetJetbrainsAccounts, usePutJetbrainsAccounts, getGetJetbrainsAccountsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Edit, Plus, CheckCircle2, XCircle, Clock, Power } from "lucide-react";
import { JetbrainsAccount } from "@workspace/api-client-react/src/generated/api.schemas";
import { Skeleton } from "@/components/ui/skeleton";

type AccountWithEnabled = JetbrainsAccount & { enabled?: boolean };

export default function Accounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: accounts, isLoading } = useGetJetbrainsAccounts();
  const putAccounts = usePutJetbrainsAccounts();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  const [formData, setFormData] = useState<AccountWithEnabled>({
    jwt: "",
    licenseId: "",
    authorization: "",
    enabled: true,
  });

  const saveAccounts = (newAccounts: AccountWithEnabled[], successMsg?: string) => {
    putAccounts.mutate({ data: newAccounts }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJetbrainsAccountsQueryKey() });
        toast({ title: successMsg || "Saved", description: "Accounts updated successfully." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to save accounts.", variant: "destructive" });
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accounts) return;

    const typedAccounts = accounts as AccountWithEnabled[];
    let newAccounts = [...typedAccounts];
    const accountToSave: AccountWithEnabled = {
      ...formData,
      jwt: formData.jwt || null,
      licenseId: formData.licenseId || null,
      authorization: formData.authorization || null,
      enabled: formData.enabled !== false,
    };

    if (editingIndex !== null) {
      newAccounts[editingIndex] = { ...newAccounts[editingIndex], ...accountToSave };
    } else {
      newAccounts.push(accountToSave);
    }

    putAccounts.mutate({ data: newAccounts }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJetbrainsAccountsQueryKey() });
        toast({ title: "Account Saved", description: "JetBrains account updated." });
        setIsAddOpen(false);
        setEditingIndex(null);
        setFormData({ jwt: "", licenseId: "", authorization: "", enabled: true });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
      }
    });
  };

  const handleDelete = (index: number) => {
    if (!accounts) return;
    if (!confirm("Are you sure you want to delete this account?")) return;
    const newAccounts = (accounts as AccountWithEnabled[]).filter((_, i) => i !== index);
    saveAccounts(newAccounts, "Account Deleted");
  };

  const handleToggleEnabled = (index: number) => {
    if (!accounts) return;
    const typedAccounts = accounts as AccountWithEnabled[];
    const newAccounts = typedAccounts.map((acc, i) => {
      if (i !== index) return acc;
      return { ...acc, enabled: acc.enabled === false ? true : false };
    });
    const isNowEnabled = newAccounts[index].enabled !== false;
    saveAccounts(newAccounts, isNowEnabled ? "Account Enabled" : "Account Disabled");
  };

  const openEdit = (index: number) => {
    if (!accounts) return;
    const acc = accounts[index] as AccountWithEnabled;
    setFormData({
      jwt: acc.jwt || "",
      licenseId: acc.licenseId || "",
      authorization: acc.authorization || "",
      enabled: acc.enabled !== false,
    });
    setEditingIndex(index);
    setIsAddOpen(true);
  };

  const getMode = (acc: AccountWithEnabled) => {
    if (acc.jwt) return "JWT Only";
    if (acc.licenseId && acc.authorization) return "License + Auth";
    return "Incomplete";
  };

  const formatDate = (ts?: number | null) => {
    if (!ts) return "Never";
    return new Date(ts * 1000).toLocaleString();
  };

  const isEnabled = (acc: AccountWithEnabled) => acc.enabled !== false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">JetBrains Accounts</h1>
          <p className="text-muted-foreground mt-2">Manage auth configurations for the proxy pool. Only enabled accounts are used.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setEditingIndex(null);
            setFormData({ jwt: "", licenseId: "", authorization: "", enabled: true });
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="btn-add-account">
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingIndex !== null ? 'Edit Account' : 'Add Account'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="jwt">JWT (Token)</Label>
                <Input 
                  id="jwt" 
                  placeholder="eyJhbGci..." 
                  value={formData.jwt || ''} 
                  onChange={e => setFormData({...formData, jwt: e.target.value})}
                  data-testid="input-jwt"
                />
                <p className="text-xs text-muted-foreground">Required for JWT-only mode</p>
              </div>
              
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-muted-foreground/20" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">OR</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="licenseId">License ID</Label>
                <Input 
                  id="licenseId" 
                  placeholder="XXXX-XXXX..." 
                  value={formData.licenseId || ''} 
                  onChange={e => setFormData({...formData, licenseId: e.target.value})}
                  data-testid="input-license"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="authorization">Authorization (Bearer Token)</Label>
                <Input 
                  id="authorization" 
                  placeholder="Bearer ..." 
                  value={formData.authorization || ''} 
                  onChange={e => setFormData({...formData, authorization: e.target.value})}
                  data-testid="input-auth"
                />
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Switch
                  id="enabled"
                  checked={formData.enabled !== false}
                  onCheckedChange={v => setFormData({...formData, enabled: v})}
                />
                <Label htmlFor="enabled" className="cursor-pointer">Account enabled</Label>
              </div>
              
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={putAccounts.isPending} data-testid="btn-save-account">
                  {putAccounts.isPending ? 'Saving...' : 'Save Account'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : accounts?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-muted-foreground">No accounts configured.</p>
            <p className="text-sm text-muted-foreground mt-1">Add an account to start proxying requests.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          {(accounts as AccountWithEnabled[])?.map((acc, i) => {
            const enabled = isEnabled(acc);
            return (
              <Card
                key={i}
                className={`flex flex-col border-border bg-card shadow-sm transition-all ${!enabled ? 'opacity-50' : 'hover-elevate'}`}
                data-testid={`card-account-${i}`}
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                      Account {i + 1}
                      <span className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full border border-secondary-border font-mono font-normal">
                        {getMode(acc)}
                      </span>
                      {!enabled && (
                        <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded-full border border-destructive/20 font-normal">
                          Disabled
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-4">
                      {acc.has_quota !== undefined && (
                        <span className="flex items-center gap-1">
                          {acc.has_quota ? (
                            <><CheckCircle2 className="h-3 w-3 text-primary" /> Quota Available</>
                          ) : (
                            <><XCircle className="h-3 w-3 text-destructive" /> No Quota</>
                          )}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleToggleEnabled(i)}
                      title={enabled ? "Disable account" : "Enable account"}
                      className={enabled ? "text-primary border-primary/30 hover:bg-primary/10" : "text-muted-foreground"}
                      data-testid={`btn-toggle-${i}`}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => openEdit(i)} data-testid={`btn-edit-${i}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(i)} data-testid={`btn-delete-${i}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 text-sm grid gap-2">
                  {acc.jwt && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono">JWT:</span>
                      <span className="font-mono truncate">{acc.jwt.substring(0, 20)}...</span>
                    </div>
                  )}
                  {acc.licenseId && (
                    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <span className="text-muted-foreground font-mono">License ID:</span>
                      <span className="font-mono truncate">{acc.licenseId}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2 text-xs text-muted-foreground mt-4 border-t border-border pt-4">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last Used:</span>
                    <span>{formatDate(acc.last_updated)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
