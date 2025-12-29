import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SharedAffiliationType } from '@/lib/prompt';

interface Hook {
  id: string;
  title: string;
  hook: string;
  whyItWorks: string;
  confidence: number;
  sources: Array<{ label: string; url: string }>;
}

interface CredibilityRefinerProps {
  selectedHook: Hook;
  recipientName: string;
  onSubmit: (data: { credibilityStory: string; sharedAffiliation?: any }) => void;
  isLoading?: boolean;
}

const AFFILIATION_TYPES: { value: SharedAffiliationType; label: string }[] = [
  { value: 'none', label: 'No shared background' },
  { value: 'school', label: 'Same school / university' },
  { value: 'business_school', label: 'Same business school / MBA program' },
  { value: 'company', label: 'Same previous company' },
  { value: 'accelerator', label: 'Same accelerator / fellowship / program' },
  { value: 'personal_characteristics', label: 'Shared personal characteristics (race, ethnicity, nationality)' },
  { value: 'other', label: 'Other' },
];

export function CredibilityRefiner({
  selectedHook,
  recipientName,
  onSubmit,
  isLoading = false,
}: CredibilityRefinerProps) {
  const [credibilityStory, setCredibilityStory] = useState('');
  const [showAffiliation, setShowAffiliation] = useState(false);
  const [selectedAffiliationTypes, setSelectedAffiliationTypes] = useState<SharedAffiliationType[]>([]);
  const [affiliationName, setAffiliationName] = useState('');
  const [affiliationDetail, setAffiliationDetail] = useState('');

  const hasRealAffiliationSelected = selectedAffiliationTypes.some(t => t !== 'none');

  const handleAffiliationTypeToggle = (type: SharedAffiliationType) => {
    if (type === 'none') {
      setSelectedAffiliationTypes(prev => prev.includes('none') ? [] : ['none']);
      setAffiliationName('');
      setAffiliationDetail('');
      return;
    }
    setSelectedAffiliationTypes(prev => {
      const withoutNone = prev.filter(t => t !== 'none');
      return withoutNone.includes(type)
        ? withoutNone.filter(t => t !== type)
        : [...withoutNone, type];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: any = {
      credibilityStory: credibilityStory.trim(),
    };

    if (hasRealAffiliationSelected && affiliationName.trim()) {
      data.sharedAffiliation = {
        types: selectedAffiliationTypes,
        name: affiliationName.trim(),
        detail: affiliationDetail.trim() || undefined,
      };
    }

    onSubmit(data);
  };

  const isFormValid = credibilityStory.trim().length >= 20;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="font-serif text-3xl tracking-tight">Your story</h2>
        <p className="text-base text-muted-foreground leading-relaxed">
          Write 2–4 sentences that connect your experience to the angle you chose.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          One concrete detail is enough.
        </p>
      </div>

      {/* Selected Hook (read-only) */}
      <Card className="p-4 bg-muted/30 border-border">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Selected angle
          </p>
          <p className="font-medium text-base">{selectedHook.title}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{selectedHook.hook}</p>
        </div>
      </Card>

      {/* Credibility Story Textarea */}
      <div className="space-y-2">
        <Label htmlFor="credibilityStory" className="text-sm font-normal">
          Your context
        </Label>
        <Textarea
          id="credibilityStory"
          placeholder="I've been building payment infrastructure for small merchants, and mentorship played a big role in how I navigated early scaling challenges. I'm curious how you've thought about mentorship as your scope has grown."
          value={credibilityStory}
          onChange={(e) => setCredibilityStory(e.target.value)}
          disabled={isLoading}
          rows={6}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          2–4 sentences. Focus on what you built or learned — not your resume.
        </p>
      </div>

      {/* Optional Shared Affiliation (collapsed) */}
      <Collapsible open={showAffiliation} onOpenChange={setShowAffiliation}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between hover:bg-muted"
            disabled={isLoading}
          >
            <span className="text-sm font-medium">
              Shared affiliation (optional)
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                showAffiliation && 'transform rotate-180'
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm">Type of shared background</Label>
            <div className="space-y-2">
              {AFFILIATION_TYPES.map((type) => (
                <div key={type.value} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={type.value}
                    checked={selectedAffiliationTypes.includes(type.value)}
                    onChange={() => handleAffiliationTypeToggle(type.value)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label
                    htmlFor={type.value}
                    className="font-normal cursor-pointer text-sm"
                  >
                    {type.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {hasRealAffiliationSelected && (
            <>
              <div className="space-y-2">
                <Label htmlFor="affiliationName">Name of institution/company</Label>
                <Input
                  id="affiliationName"
                  placeholder="Stanford GSB"
                  value={affiliationName}
                  onChange={(e) => setAffiliationName(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="affiliationDetail">
                  Additional details (optional)
                </Label>
                <Input
                  id="affiliationDetail"
                  placeholder="Class of 2019"
                  value={affiliationDetail}
                  onChange={(e) => setAffiliationDetail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Submit Button */}
      <div className="pt-6">
        <Button
          type="submit"
          size="lg"
          disabled={!isFormValid || isLoading}
          className="w-full"
        >
          {isLoading ? 'Drafting email...' : 'Draft my email'}
        </Button>
      </div>
    </form>
  );
}
