import { formatMoneyFromCents, type FormatMoneyOptions } from "@/lib/money/formatMoney";
import { cn } from "@/lib/cn";

type MoneyProps = {
  cents: number | null | undefined;
  currency?: string | null;
  options?: FormatMoneyOptions;
  className?: string;
};

export function Money({ cents, currency, options, className }: MoneyProps) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatMoneyFromCents(cents, currency, options)}
    </span>
  );
}
