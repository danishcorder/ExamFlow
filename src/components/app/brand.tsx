import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <Link to="/" aria-label="ExamFlow home" className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className="brand-mark">
        <GraduationCap className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="flex flex-col leading-none">
        <span className={cn("font-display text-[1.3rem] font-semibold tracking-tight", inverted ? "text-white" : "text-navy")}>Exam<span className={inverted ? "text-gold" : "text-gold-dark"}>Flow</span></span>
        <span className={cn("mt-1.5 text-[9px] font-bold uppercase tracking-[.23em]", inverted ? "text-white/60" : "text-muted-foreground")}>Examination portal</span>
      </span>
    </Link>
  );
}
