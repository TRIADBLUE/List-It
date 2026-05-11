import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertCircle, XCircle, HelpCircle, UserCheck } from "lucide-react";

type RecommendedAction = "post_now" | "clean_and_post" | "skip" | "insufficient_data";

interface TriageRecoBadgeProps {
  recommendedAction?: RecommendedAction | null;
  triageOverride?: RecommendedAction | null;
  triageReasoning?: string | null;
  triageOverrideReason?: string | null;
  triageConfidence?: number | null;
  estimatedValue?: number | null;
  className?: string;
}

export function TriageRecoBadge({
  recommendedAction,
  triageOverride,
  triageReasoning,
  triageOverrideReason,
  triageConfidence,
  estimatedValue,
  className,
}: TriageRecoBadgeProps) {
  // Determine final action (override takes precedence)
  const finalAction = triageOverride || recommendedAction;
  const isOverridden = !!triageOverride;

  if (!finalAction) {
    return null;
  }

  // Configuration for each action type (WCAG AA compliant colors)
  const config = {
    post_now: {
      label: "Post Now",
      icon: CheckCircle2,
      variant: "default" as const,
      className: "bg-green-700 text-white border-green-800 hover:bg-green-800",
    },
    clean_and_post: {
      label: "Clean & Post",
      icon: AlertCircle,
      variant: "default" as const,
      className: "bg-amber-600 text-white border-amber-700 hover:bg-amber-700",
    },
    skip: {
      label: "Skip",
      icon: XCircle,
      variant: "destructive" as const,
      className: "",
    },
    insufficient_data: {
      label: "Analyzing...",
      icon: HelpCircle,
      variant: "secondary" as const,
      className: "",
    },
  };

  const actionConfig = config[finalAction];
  const Icon = actionConfig.icon;

  // Build tooltip content
  const buildTooltipContent = () => {
    const parts = [];

    if (isOverridden && triageOverrideReason) {
      parts.push(`Manual Override: ${triageOverrideReason}`);
    } else if (triageReasoning) {
      parts.push(triageReasoning);
    }

    if (estimatedValue !== null && estimatedValue !== undefined) {
      const dollars = (estimatedValue / 100).toFixed(2);
      parts.push(`Estimated Value: $${dollars}`);
    }

    if (triageConfidence !== null && triageConfidence !== undefined) {
      parts.push(`Confidence: ${triageConfidence}%`);
    }

    return parts.join(" • ");
  };

  const tooltipContent = buildTooltipContent();

  const badge = (
    <Badge
      variant={actionConfig.variant}
      className={`gap-1 ${actionConfig.className} ${className || ""}`}
      data-testid={`badge-triage-${finalAction}`}
    >
      {isOverridden && <UserCheck className="h-3 w-3" />}
      <Icon className="h-3 w-3" />
      <span>{actionConfig.label}</span>
    </Badge>
  );

  // Show tooltip if we have content
  if (tooltipContent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
