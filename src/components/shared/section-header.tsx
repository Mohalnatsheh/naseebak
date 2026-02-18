import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SectionHeaderProps {
  badge: string;
  badgeIcon?: React.ReactNode;
  badgeClass?: string;
  title: React.ReactNode;
  description?: string;
  gradientLine?: string;
}

export function SectionHeader({
  badge,
  badgeIcon,
  badgeClass = "border-primary/20 bg-primary/[0.04]",
  title,
  description,
  gradientLine = "from-primary via-secondary to-accent",
}: SectionHeaderProps) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Badge
        variant="outline"
        className={`mb-4 px-4 py-1.5 text-sm ${badgeClass}`}
      >
        {badgeIcon ?? <Sparkles className="size-3 ml-1 text-primary" />}
        {badge}
      </Badge>
      <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">{title}</h2>
      {description && (
        <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      <div
        className={`mx-auto mt-6 h-1 w-20 rounded-full bg-gradient-to-l ${gradientLine}`}
      />
    </div>
  );
}
