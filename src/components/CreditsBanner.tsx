import { AlertCircle } from 'lucide-react';

export const CreditsBanner = () => {
  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mx-4 mb-4 flex items-center gap-3">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
      <p className="text-sm text-destructive font-medium">
        Sem créditos. Recarregue para continuar.
      </p>
    </div>
  );
};
