import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, delta, icon: Icon, hint }: { label: string; value: string; delta?: number; icon: LucideIcon; hint?: string }) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="stat-card overflow-hidden border-border/80 bg-card shadow-sm transition-shadow hover:shadow-elegant">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-navy"><Icon className="h-[18px] w-[18px]" /></span>
        </div>
        <p className="mt-4 text-2xl font-bold tracking-tight text-navy">{value}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {delta !== undefined && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-destructive")}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(delta)}%
            </span>
          )}
          {hint}
        </div>
      </CardContent>
    </Card>
  );
}
