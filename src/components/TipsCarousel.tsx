import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TipsCarouselProps {
  tips: string[];
  currentTipIndex: number;
}

export function TipsCarousel({ tips, currentTipIndex }: TipsCarouselProps) {
  if (!tips || tips.length === 0) return null;

  return (
    <div className="bg-muted/50 border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Sparkles className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="space-y-1 flex-1">
          <p className="text-sm font-medium">Did you know?</p>
          <p className="text-sm text-muted-foreground transition-opacity duration-300">
            {tips[currentTipIndex]}
          </p>
        </div>
      </div>

      {/* Tip pagination dots */}
      {tips.length > 1 && (
        <div className="flex gap-1.5 justify-center pt-1">
          {tips.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors duration-300',
                i === currentTipIndex ? 'bg-foreground' : 'bg-border'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
