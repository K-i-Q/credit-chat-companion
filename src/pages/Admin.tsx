import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useProfileRole } from "@/hooks/useProfileRole";

interface AdminUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  role: "admin" | "user";
  full_name: string | null;
}

const Admin = () => {
  const { session, user } = useAuth();
  const { role } = useProfileRole();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const isAdmin = role === "admin";

  const authHeader = useMemo(() => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }, [session?.access_token]);

  const fetchUsers = async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setForbidden(false);
    const response = await fetch("/api/admin/users", {
      headers: authHeader,
    });
    if (response.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      toast.error(data?.error || "Falha ao carregar usuários.");
      return;
    }
    setUsers(data.users || []);
  };

  useEffect(() => {
    if (session?.access_token) {
      fetchUsers();
    }
  }, [session?.access_token]);

  const updateRole = async (userId: string, nextRole: "admin" | "user") => {
    if (!session?.access_token) return;
    setUpdatingId(userId);
    const response = await fetch("/api/admin/role", {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, role: nextRole }),
    });
    const data = await response.json().catch(() => ({}));
    setUpdatingId(null);
    if (!response.ok) {
      toast.error(data?.error || "Erro ao atualizar role.");
      return;
    }
    setUsers((prev) =>
      prev.map((item) => (item.id === userId ? { ...item, role: nextRole } : item))
    );
    toast.success("Permissão atualizada.");
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
          <Button onClick={fetchUsers} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>

        {forbidden ? (
          <Card>
            <CardHeader>
              <CardTitle>Sem permissão</CardTitle>
              <CardDescription>Seu usuário não está marcado como admin.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
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
        )}
      </div>
    </div>
  );
};

export default Admin;
