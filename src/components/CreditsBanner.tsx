import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CreditsBannerProps = {
  onOpenCredits?: () => void;
};

export const CreditsBanner = ({ onOpenCredits }: CreditsBannerProps) => {
  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mx-4 mb-4 flex items-center gap-3">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
      <p className="text-sm text-destructive font-medium">
        Sem créditos. Recarregue para continuar.
      </p>
      {onOpenCredits ? (
        <Button type="button" size="sm" variant="outline" onClick={onOpenCredits} className="ml-auto">
          Adicionar créditos
        </Button>
      ) : null}
    </div>
  );
};
