import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AskType } from '@/lib/prompt';

export interface IntentFormData {
  recipientName: string;
  recipientCompany: string;
  recipientRole?: string;
  senderIntent: string;
  askType?: AskType;
}

interface IntentFormProps {
  onSubmit: (data: IntentFormData) => void;
  isLoading?: boolean;
}

export function IntentForm({ onSubmit, isLoading = false }: IntentFormProps) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientCompany, setRecipientCompany] = useState('');
  const [recipientRole, setRecipientRole] = useState('');
  const [senderIntent, setSenderIntent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: IntentFormData = {
      recipientName: recipientName.trim(),
      recipientCompany: recipientCompany.trim(),
      senderIntent: senderIntent.trim(),
    };

    if (recipientRole.trim()) {
      data.recipientRole = recipientRole.trim();
    }

    onSubmit(data);
  };

  const isFormValid =
    recipientName.trim() &&
    recipientCompany.trim() &&
    senderIntent.trim().length >= 10;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto py-6">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="font-serif text-4xl tracking-tight">Cold Email Assistant</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Describe a real person. We'll research them and draft a thoughtful email.
        </p>
      </div>

      {/* Section Header */}
      <div className="pt-2">
        <h2 className="font-serif text-2xl tracking-tight mb-2">Who are you writing to?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We'll research this person to find a few strong ways to open your email.
        </p>
      </div>

      <div className="space-y-4">
        {/* Recipient Name */}
        <div className="space-y-2">
          <Label htmlFor="recipientName" className="text-sm font-normal">
            Recipient name
          </Label>
          <Input
            id="recipientName"
            placeholder="Jane Smith"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        {/* Company */}
        <div className="space-y-2">
          <Label htmlFor="recipientCompany" className="text-sm font-normal">
            Company
          </Label>
          <Input
            id="recipientCompany"
            placeholder="Microsoft"
            value={recipientCompany}
            onChange={(e) => setRecipientCompany(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        {/* Role (optional) */}
        <div className="space-y-2">
          <Label htmlFor="recipientRole" className="text-sm font-normal">
            Role (optional)
          </Label>
          <Input
            id="recipientRole"
            placeholder=""
            value={recipientRole}
            onChange={(e) => setRecipientRole(e.target.value)}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Leave blank if you're not sure — we'll infer it.
          </p>
        </div>

        {/* Why reaching out */}
        <div className="space-y-2">
          <Label htmlFor="senderIntent" className="text-sm font-normal">
            Why are you reaching out?
          </Label>
          <Textarea
            id="senderIntent"
            placeholder="2–3 sentences about why you want to connect and what you're hoping to learn."
            value={senderIntent}
            onChange={(e) => setSenderIntent(e.target.value)}
            disabled={isLoading}
            rows={4}
            required
            className="resize-none"
          />
        </div>

      </div>

      {/* Submit Button */}
      <div className="pt-2 space-y-2">
        <Button
          type="submit"
          size="lg"
          disabled={!isFormValid || isLoading}
          className="w-full"
        >
          {isLoading ? 'Starting research...' : 'Start research'}
        </Button>
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Usually takes under a minute.
        </p>
      </div>
    </form>
  );
}
