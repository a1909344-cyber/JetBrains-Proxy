import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang } from "@/lib/i18n";
import { adminFetch, storeToken, clearToken } from "@/lib/api";

interface ChangePasswordDialogProps {
  onLogout?: () => void;
}

export function ChangePasswordDialog({ onLogout }: ChangePasswordDialogProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setNewPw("");
    setConfirmPw("");
    setError("");
    setSaving(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPw.trim().length < 4) {
      setError(t("change_pw_err_short"));
      return;
    }
    if (newPw !== confirmPw) {
      setError(t("change_pw_err_match"));
      return;
    }

    setSaving(true);
    try {
      const res = await adminFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPw.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "env_override") {
          setError(t("change_pw_err_env"));
        } else {
          setError(t("change_pw_err_fail"));
        }
        setSaving(false);
        return;
      }

      // Server returns new token — update it so user stays logged in
      if (data.token) {
        storeToken(data.token);
      }

      setOpen(false);
      reset();
      alert(t("change_pw_success"));
      // Force re-login so the new token is verified
      clearToken();
      onLogout?.();
    } catch {
      setError(t("change_pw_err_fail"));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground text-xs mt-1"
        >
          <KeyRound className="h-4 w-4 shrink-0" />
          {t("change_pw_btn")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("change_pw_title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pw">{t("change_pw_new")}</Label>
            <Input
              id="new-pw"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-pw">{t("change_pw_confirm")}</Label>
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? t("change_pw_saving") : t("change_pw_submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
