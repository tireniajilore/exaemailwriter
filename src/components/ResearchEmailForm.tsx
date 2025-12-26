import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles } from 'lucide-react';
import type { AskType, EmailRequest, SharedAffiliationType } from '@/lib/prompt';

interface ResearchEmailFormProps {
  onSubmit: (request: EmailRequest) => void;
  isLoading: boolean;
}

const ASK_TYPES: { value: AskType; label: string }[] = [
  { value: 'chat', label: 'Short introductory chat' },
  { value: 'feedback', label: 'Feedback on something' },
  { value: 'referral', label: 'Referral / introduction' },
  { value: 'job', label: 'Job- or recruiting-related' },
  { value: 'other', label: 'Other' },
];

const AFFILIATION_TYPES: { value: SharedAffiliationType; label: string }[] = [
  { value: 'none', label: 'No shared background' },
  { value: 'school', label: 'Same school / university' },
  { value: 'business_school', label: 'Same business school / MBA program' },
  { value: 'company', label: 'Same previous company' },
  { value: 'accelerator', label: 'Same accelerator / fellowship / program' },
  { value: 'personal_characteristics', label: 'Shared personal characteristics (race, ethnicity, nationality)' },
  { value: 'other', label: 'Other' },
];

export function ResearchEmailForm({ onSubmit, isLoading }: ResearchEmailFormProps) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientCompany, setRecipientCompany] = useState('');
  const [recipientRole, setRecipientRole] = useState('');
  const [askType, setAskType] = useState<AskType>('chat');
  const [reachingOutBecause, setReachingOutBecause] = useState('');
  const [credibilityStory, setCredibilityStory] = useState('');
  
  // Shared affiliation state
  const [selectedAffiliationTypes, setSelectedAffiliationTypes] = useState<SharedAffiliationType[]>([]);
  const [affiliationName, setAffiliationName] = useState('');
  const [affiliationDetail, setAffiliationDetail] = useState('');

  // Has a real affiliation selected (not "none")
  const hasRealAffiliationSelected = selectedAffiliationTypes.some(t => t !== 'none');

  const handleAffiliationTypeToggle = (type: SharedAffiliationType) => {
    if (type === 'none') {
      // "None" clears all other selections
      setSelectedAffiliationTypes(prev => prev.includes('none') ? [] : ['none']);
      setAffiliationName('');
      setAffiliationDetail('');
      return;
    }
    // Selecting any other option removes "none"
    setSelectedAffiliationTypes(prev => {
      const withoutNone = prev.filter(t => t !== 'none');
      return withoutNone.includes(type) 
        ? withoutNone.filter(t => t !== type)
        : [...withoutNone, type];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const request: EmailRequest = {
      recipientName,
      recipientCompany,
      recipientRole,
      askType,
      reachingOutBecause,
      credibilityStory,
    };

    // Only include shared affiliation if types are selected and name is provided
    if (hasRealAffiliationSelected && affiliationName.trim()) {
      request.sharedAffiliation = {
        types: selectedAffiliationTypes,
        name: affiliationName.trim(),
        detail: affiliationDetail.trim() || undefined,
      };
    }

    onSubmit(request);
  };

  const isFormValid =
    recipientName.trim() &&
    recipientCompany.trim() &&
    recipientRole.trim() &&
    reachingOutBecause.trim() &&
    credibilityStory.trim() &&
    // If affiliation types selected, name is required
    (!hasRealAffiliationSelected || affiliationName.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* Recipient Context Section */}
      <section className="space-y-5">
        <h3 className="font-serif text-lg font-medium border-b border-border pb-2">
          Who are you emailing?
        </h3>
        
        <div className="space-y-2">
          <Label htmlFor="recipientName" className="text-sm font-medium">
            Recipient's full name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recipientName"
            placeholder="Jane Smith"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="bg-background border-border"
            required
            maxLength={100}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="recipientCompany" className="text-sm font-medium">
              Company <span className="text-destructive">*</span>
            </Label>
            <Input
              id="recipientCompany"
              placeholder="Stripe"
              value={recipientCompany}
              onChange={(e) => setRecipientCompany(e.target.value)}
              className="bg-background border-border"
              required
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipientRole" className="text-sm font-medium">
              Role / Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="recipientRole"
              placeholder="VP of Product"
              value={recipientRole}
              onChange={(e) => setRecipientRole(e.target.value)}
              className="bg-background border-border"
              required
              maxLength={100}
            />
          </div>
        </div>
      </section>

      {/* Purpose Section */}
      <section className="space-y-5">
        <h3 className="font-serif text-lg font-medium border-b border-border pb-2">
          Why are you reaching out?
        </h3>

        <div className="space-y-3">
          <Label className="text-sm font-medium">
            What are you asking for? <span className="text-destructive">*</span>
          </Label>
          <RadioGroup
            value={askType}
            onValueChange={(v) => setAskType(v as AskType)}
            className="space-y-2"
          >
            {ASK_TYPES.map((type) => (
              <div key={type.value} className="flex items-center space-x-3">
                <RadioGroupItem value={type.value} id={`ask-${type.value}`} />
                <Label
                  htmlFor={`ask-${type.value}`}
                  className="font-normal cursor-pointer"
                >
                  {type.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reachingOutBecause" className="text-sm font-medium">
            Complete this sentence: "I'm reaching out because ___" <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reachingOutBecause"
            placeholder="I want to learn how they built the payments team at Stripe from scratch..."
            value={reachingOutBecause}
            onChange={(e) => setReachingOutBecause(e.target.value)}
            className="bg-background border-border min-h-[80px] resize-none"
            required
            maxLength={500}
          />
        </div>
      </section>

      {/* Credibility Section */}
      <section className="space-y-5">
        <h3 className="font-serif text-lg font-medium border-b border-border pb-2">
          What makes you credible?
        </h3>
        <p className="text-sm text-muted-foreground">
          This could be a project, result, or experience that makes your outreach more compelling.
        </p>

        <div className="space-y-2">
          <Label htmlFor="credibilityStory" className="text-sm font-medium">
            One short story or accomplishment that could impress the recipient <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="credibilityStory"
            placeholder="I spent 3 years building payment infrastructure in Southeast Asia, where I helped 10,000 small merchants accept digital payments for the first time..."
            value={credibilityStory}
            onChange={(e) => setCredibilityStory(e.target.value)}
            className="bg-background border-border min-h-[100px] resize-none"
            required
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">
            2–3 sentences work best
          </p>
        </div>
      </section>

      {/* Shared Background Section (Optional) */}
      <section className="space-y-5">
        <h3 className="font-serif text-lg font-medium border-b border-border pb-2">
          Any shared background?
        </h3>
        <p className="text-sm text-muted-foreground">
          If you and the recipient share a school, company, or program, this can be a powerful, natural opener.
        </p>

        <div className="space-y-3">
          <Label className="text-sm font-medium">
            Do you share any background with this person?
          </Label>
          <div className="space-y-2">
            {AFFILIATION_TYPES.map((type) => (
              <div key={type.value} className="flex items-center space-x-3">
                <Checkbox
                  id={`affiliation-${type.value}`}
                  checked={selectedAffiliationTypes.includes(type.value)}
                  onCheckedChange={() => handleAffiliationTypeToggle(type.value)}
                />
                <Label
                  htmlFor={`affiliation-${type.value}`}
                  className="font-normal cursor-pointer"
                >
                  {type.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {hasRealAffiliationSelected && (
          <div className="space-y-5 pl-4 border-l-2 border-border">
            <div className="space-y-2">
              <Label htmlFor="affiliationName" className="text-sm font-medium">
                Shared institution or organization name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="affiliationName"
                placeholder="Stanford GSB, McKinsey & Company, YC W23, Harvard College..."
                value={affiliationName}
                onChange={(e) => setAffiliationName(e.target.value)}
                className="bg-background border-border"
                required={hasRealAffiliationSelected}
                maxLength={150}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="affiliationDetail" className="text-sm font-medium">
                Your connection to it <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="affiliationDetail"
                placeholder="MBA '24, Strategy & Ops 2019–2021, Class of 2018..."
                value={affiliationDetail}
                onChange={(e) => setAffiliationDetail(e.target.value)}
                className="bg-background border-border"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                1 short phrase to add context
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Info banner */}
      <div className="bg-muted/50 border border-border p-4 text-sm text-muted-foreground flex items-start gap-3">
        <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
        <span>We'll automatically research public information about the recipient to personalize your email.</span>
      </div>

      <Button
        type="submit"
        disabled={isLoading || !isFormValid}
        className="w-full bg-foreground text-background font-medium h-12 text-base transition-all hover:bg-foreground/90 disabled:opacity-50 rounded-none"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Researching & Generating...
          </>
        ) : (
          'Generate Email'
        )}
      </Button>
    </form>
  );
}
