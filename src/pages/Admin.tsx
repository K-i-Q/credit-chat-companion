import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useProfileRole } from "@/hooks/useProfileRole";
import { supabase } from "@/lib/supabaseClient";
import { getFunctionsErrorMessage } from "@/lib/functions";

interface AdminUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  role: "admin" | "user";
  full_name: string | null;
  balance: number;
  referral_code: string | null;
}

interface InviteLink {
  id: string;
  code: string;
  credits: number;
  active: boolean;
  uses_count: number;
  created_at: string;
  last_used_at: string | null;
}

const Admin = () => {
  const { session, user } = useAuth();
  const { role } = useProfileRole();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [topupValues, setTopupValues] = useState<Record<string, string>>({});
  const [forbidden, setForbidden] = useState(false);
  const [inviteCredits, setInviteCredits] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteDeletingId, setInviteDeletingId] = useState<string | null>(null);

  const isAdmin = role === "admin";

  const authHeader = useMemo(() => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session?.access_token]);

  const fetchUsers = async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setForbidden(false);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      headers: authHeader,
    });
    setLoading(false);
    if (error) {
      const status = (error as { context?: Response }).context?.status;
      if (status === 403) {
        setForbidden(true);
        return;
      }
      const message = await getFunctionsErrorMessage(error, "Falha ao carregar usuários.");
      toast.error(message);
      return;
    }
    setUsers(data?.users || []);
  };

  const fetchInvites = async () => {
    if (!session?.access_token) return;
    const { data, error } = await supabase.functions.invoke("admin-invites", {
      headers: authHeader,
      method: "GET",
    });
    if (error) {
      const message = await getFunctionsErrorMessage(error, "Falha ao carregar convites.");
      toast.error(message);
      return;
    }
    setInvites(data?.invites || []);
  };

  useEffect(() => {
    if (session?.access_token) {
      fetchUsers();
      fetchInvites();
    }
  }, [session?.access_token]);

  const updateRole = async (userId: string, nextRole: "admin" | "user") => {
    if (!session?.access_token) return;
    setUpdatingId(userId);
    const { error } = await supabase.functions.invoke("admin-role", {
      headers: authHeader,
      body: { user_id: userId, role: nextRole },
    });
    setUpdatingId(null);
    if (error) {
      const message = await getFunctionsErrorMessage(error, "Erro ao atualizar role.");
      toast.error(message);
      return;
    }
    setUsers((prev) =>
      prev.map((item) => (item.id === userId ? { ...item, role: nextRole } : item))
    );
    toast.success("Permissão atualizada.");
  };

  const deleteUser = async (userId: string) => {
    if (!session?.access_token) return;
    if (!window.confirm("Tem certeza que deseja excluir este usuário? Essa ação é irreversível.")) {
      return;
    }
    setUpdatingId(userId);
    const { error } = await supabase.functions.invoke("admin-users-delete", {
      headers: authHeader,
      body: { user_id: userId },
    });
    setUpdatingId(null);
    if (error) {
      const message = await getFunctionsErrorMessage(error, "Erro ao excluir usuário.");
      toast.error(message);
      return;
    }
    setUsers((prev) => prev.filter((item) => item.id !== userId));
    toast.success("Usuário excluído.");
  };

  const handleTopup = async (userId: string) => {
    if (!session?.access_token) return;
    const raw = topupValues[userId] || "";
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error("Informe um valor inteiro maior que zero.");
      return;
    }
    setUpdatingId(userId);
    const { data, error } = await supabase.functions.invoke("admin-credits", {
      headers: authHeader,
      body: { user_id: userId, amount },
    });
    setUpdatingId(null);
    if (error) {
      const message = await getFunctionsErrorMessage(error, "Erro ao adicionar créditos.");
      toast.error(message);
      return;
    }
    setUsers((prev) =>
      prev.map((item) =>
        item.id === userId
          ? { ...item, balance: data?.new_balance ?? item.balance + amount }
          : item
      )
    );
    setTopupValues((prev) => ({ ...prev, [userId]: "" }));
    toast.success("Créditos adicionados.");
  };

  const createInvite = async () => {
    if (!session?.access_token) return;
    const credits = Number(inviteCredits);
    if (!Number.isInteger(credits) || credits <= 0) {
      toast.error("Informe um número inteiro de créditos.");
      return;
    }
    const code = inviteCode.trim().toLowerCase();
    if (!code) {
      toast.error("Informe um código para o cupom.");
      return;
    }
    setInviteLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-invites", {
      headers: authHeader,
      body: { credits, code },
    });
    setInviteLoading(false);
    if (error) {
      const message = await getFunctionsErrorMessage(error, "Erro ao criar convite.");
      toast.error(message);
      return;
    }
    if (data?.invite) {
      setInvites((prev) => [data.invite, ...prev]);
      setInviteCredits("");
      setInviteCode("");
      toast.success("Convite criado.");
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code).then(
      () => toast.success("Cupom copiado."),
      () => toast.error("Não foi possível copiar.")
    );
  };

  const deleteInvite = async (inviteId: string) => {
    if (!session?.access_token) return;
    if (!window.confirm("Deseja excluir este cupom? Essa ação é irreversível.")) {
      return;
    }
    setInviteDeletingId(inviteId);
    const { error } = await supabase.functions.invoke("admin-invites-delete", {
      headers: authHeader,
      body: { invite_id: inviteId },
    });
    setInviteDeletingId(null);
    if (error) {
      const message = await getFunctionsErrorMessage(error, "Erro ao excluir cupom.");
      toast.error(message);
      return;
    }
    setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    toast.success("Cupom excluído.");
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Você não tem permissão para acessar esta área.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Admin</h1>
            <p className="text-sm text-muted-foreground">Gerencie permissões dos usuários.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Voltar ao chat</Link>
            </Button>
            <Button onClick={fetchUsers} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </div>

        {forbidden ? (
          <Card>
            <CardHeader>
              <CardTitle>Sem permissão</CardTitle>
              <CardDescription>Seu usuário não está marcado como admin.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Cupons</CardTitle>
                <CardDescription>Crie cupons com créditos para novos usuários.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <label className="text-sm text-muted-foreground">Créditos do cupom</label>
                      <input
                        type="number"
                        min={1}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={inviteCredits}
                        onChange={(event) => setInviteCredits(event.target.value)}
                        placeholder="Ex: 10"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Código do cupom</label>
                      <input
                        type="text"
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={inviteCode}
                        onChange={(event) => setInviteCode(event.target.value)}
                        placeholder="Ex: mentorix10"
                      />
                    </div>
                    <Button onClick={createInvite} disabled={inviteLoading} className="w-full sm:w-auto">
                      {inviteLoading ? "Criando..." : "Criar cupom"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Use 4-32 caracteres, letras, números, _ ou -</p>
                </div>

                <div className="mt-6 space-y-3">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col gap-2 border border-border rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium text-foreground">{invite.code}</div>
                        <div className="text-xs text-muted-foreground">
                          Créditos: {invite.credits} · Usos: {invite.uses_count}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => copyInviteCode(invite.code)}
                        >
                          Copiar cupom
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteInvite(invite.id)}
                          disabled={inviteDeletingId === invite.id}
                        >
                          {inviteDeletingId === invite.id ? "Excluindo..." : "Excluir"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {invites.length === 0 && (
                    <div className="text-sm text-muted-foreground">Nenhum cupom criado.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usuários</CardTitle>
                <CardDescription>{users.length} contas encontradas.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {users.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 border border-border rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium text-foreground">
                          {item.email || "Sem email"}
                          {item.id === user?.id ? " (você)" : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Criado: {new Date(item.created_at).toLocaleDateString("pt-BR")}
                          {item.last_sign_in_at
                            ? ` · Último login: ${new Date(item.last_sign_in_at).toLocaleDateString("pt-BR")}`
                            : ""}
                          {` · Créditos: ${item.balance}`}
                          {` · Cupom: ${item.referral_code ?? "não gerado"}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                      <select
                        value={item.role}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        onChange={(event) =>
                          updateRole(item.id, event.target.value as "admin" | "user")
                        }
                        disabled={updatingId === item.id}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                      <input
                        type="number"
                          min={1}
                          className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                          placeholder="Créditos"
                          value={topupValues[item.id] || ""}
                          onChange={(event) =>
                            setTopupValues((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                          disabled={updatingId === item.id}
                        />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleTopup(item.id)}
                        disabled={updatingId === item.id}
                      >
                        Adicionar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteUser(item.id)}
                        disabled={updatingId === item.id}
                      >
                        Excluir
                      </Button>
                      {updatingId === item.id && (
                        <span className="text-xs text-muted-foreground">Salvando...</span>
                      )}
                    </div>
                    </div>
                  ))}
                  {users.length === 0 && !loading && (
                    <div className="text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default Admin;
