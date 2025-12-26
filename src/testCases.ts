import { SharedAffiliationType } from './lib/prompt';

export interface TestCase {
  id: number;
  label: string;
  recipientName: string;
  recipientRole: string;
  recipientCompany: string;
  recipientLink: string;
  askType: 'chat' | 'feedback' | 'referral' | 'job' | 'other';
  reachingOutBecause: string;
  credibilityStory: string;
  sharedAffiliation?: {
    types: SharedAffiliationType[];
    name: string;
    detail?: string;
  };
}

export const TEST_CASES: TestCase[] = [
  {
    id: 1,
    label: "VC outreach – Latina investor to Kara Nortman",
    recipientName: "Kara Nortman",
    recipientRole: "Co-Managing Partner",
    recipientCompany: "Upfront Ventures",
    recipientLink: "https://www.linkedin.com/in/karanortman/",
    askType: "chat",
    reachingOutBecause: "I want to learn how a Latina investor can thrive in LA VC and hear about your experience building pathways for underrepresented investors.",
    credibilityStory: "I grew up in a small Texas border town, first in my family to attend college, and now I'm a VC Fellow at PayPal Ventures developing a thesis on gig economy infrastructure. I've been researching how gig economy payments differ across LATAM markets and have a few early-stage companies on my radar.",
    sharedAffiliation: {
      types: ['personal_characteristics'],
      name: "Latina women in VC",
      detail: "Both Latina investors in a male-dominated industry"
    }
  },
  {
    id: 2,
    label: "Creative outreach – storyteller to Steph Curry",
    recipientName: "Steph Curry",
    recipientRole: "Co-founder",
    recipientCompany: "Unanimous Media",
    recipientLink: "https://www.linkedin.com/in/stephen-curry-4515b913/",
    askType: "feedback",
    reachingOutBecause: "I have a short film idea about underdog stories that I think would fit Unanimous Media's slate, and I'd love 15 minutes to share it.",
    credibilityStory: "I once organized a 3-on-3 tournament in Detroit where our team came back from 18–4 in the final. That moment pushed me into telling underdog stories through film. I've since made a two-minute proof-of-concept and have a one-page story outline ready."
    // No shared background
  },
  {
    id: 3,
    label: "Writer outreach – climate organizer to Rebecca Solnit",
    recipientName: "Rebecca Solnit",
    recipientRole: "Author",
    recipientCompany: "Independent",
    recipientLink: "https://en.wikipedia.org/wiki/Rebecca_Solnit",
    askType: "chat",
    reachingOutBecause: "I'm at a crossroads between corporate sustainability, running a youth climate camp, or writing, and would love your perspective on choosing a path.",
    credibilityStory: "I spent five years lobbying Congress on climate policy, then came to business school feeling disconnected from the work that first brought me to activism. I've been reflecting on your book Hope in the Dark and how small human actions can move people toward change.",
    sharedAffiliation: {
      types: ['school'],
      name: "UC Berkeley",
      detail: "Environmental Studies, 2018"
    }
  },
  {
    id: 4,
    label: "Product operator – payments experience to Stripe PM",
    recipientName: "John Collison",
    recipientRole: "President",
    recipientCompany: "Stripe",
    recipientLink: "https://www.linkedin.com/in/johncollison/",
    askType: "chat",
    reachingOutBecause: "I want to understand how to transition from ops-heavy roles into product leadership at a payments company.",
    credibilityStory: "I spent three years across South America stitching together unreliable payment rails, including a night in Buenos Aires debugging settlement failures at 2 a.m. I've written a brief memo on how AI agents might reduce operational load in payments that I could share.",
    sharedAffiliation: {
      types: ['accelerator'],
      name: "YC W19",
      detail: "Founded a fintech startup"
    }
  },
  {
    id: 5,
    label: "Impact founder – health access founder to HBS lecturer",
    recipientName: "Michael Chu",
    recipientRole: "Lecturer and impact investor",
    recipientCompany: "Harvard Business School",
    recipientLink: "https://www.hbs.edu/faculty/Pages/profile.aspx?facId=6483",
    askType: "feedback",
    reachingOutBecause: "I'd love to share what we're building and get your perspective on scaling models for low-income health access.",
    credibilityStory: "My cofounder and I started an O2O women's health platform in Mexico after seeing how few middle-income women had access to reliable care. We've tested our model across three cities and have ground-level insights on what works.",
    sharedAffiliation: {
      types: ['business_school'],
      name: "Harvard Business School",
      detail: "MBA '24"
    }
  },
  {
    id: 6,
    label: "Manufacturing investor – distressed debt to niche operator",
    recipientName: "Nick Howley",
    recipientRole: "Executive Chairman",
    recipientCompany: "TransDigm",
    recipientLink: "https://www.linkedin.com/in/nick-howley-0861b211/",
    askType: "chat",
    reachingOutBecause: "I want to understand how you think about evaluating operators and markets when acquiring niche aerospace manufacturers.",
    credibilityStory: "I spent years as a distressed-debt investor studying overlooked industrial companies and now want to find small Midwestern manufacturers ready for succession. I've come across a few acquisition targets through my research that might interest you."
    // No shared background
  },
  {
    id: 7,
    label: "Food founder – alt dairy question to Whole Foods founder",
    recipientName: "John Mackey",
    recipientRole: "Founder",
    recipientCompany: "Whole Foods",
    recipientLink: "https://www.linkedin.com/in/johnmackey/",
    askType: "feedback",
    reachingOutBecause: "I'm launching an affordable alternative dairy brand and want to understand how you'd navigate centralized merchandising if you were launching today.",
    credibilityStory: "I'm launching an affordable alternative dairy brand out of the GSB after seeing how many families can't afford healthy options. I've been speaking with other founders trying to enter grocery retail in 2025 and have fresh insights on the current landscape.",
    sharedAffiliation: {
      types: ['business_school'],
      name: "Stanford GSB",
      detail: "MBA '25"
    }
  },
  {
    id: 8,
    label: "Privacy researcher – David vs Goliath ask to Max Schrems",
    recipientName: "Max Schrems",
    recipientRole: "Privacy activist",
    recipientCompany: "NOYB",
    recipientLink: "https://en.wikipedia.org/wiki/Max_Schrems",
    askType: "chat",
    reachingOutBecause: "I want to hear how you stayed persistent through repeated setbacks in your privacy advocacy work.",
    credibilityStory: "I'm an Uzbek refugee who fought through a male-dominated legal system, studied at Oxford, and now research GDPR enforcement at Stanford. I have fresh interview data from my dissertation on privacy enforcement that I could share.",
    sharedAffiliation: {
      types: ['personal_characteristics'],
      name: "Central Asian immigrants in tech policy",
      detail: "Both navigating Western institutions as outsiders"
    }
  },
  {
    id: 9,
    label: "Music + tech founder – Lagos story to Dr. Dre",
    recipientName: "Andre Young",
    recipientRole: "Producer and entrepreneur",
    recipientCompany: "Aftermath Entertainment",
    recipientLink: "https://en.wikipedia.org/wiki/Dr._Dre",
    askType: "chat",
    reachingOutBecause: "I want to ask what you look for in people working at the intersection of music and tech.",
    credibilityStory: "I grew up in a neighborhood in Lagos where bootleg Dre tapes were my first window into another world. I recorded verses over your beats at 14. Now I'm building early concepts for connecting African artists to global audiences."
    // No shared background
  },
  {
    id: 10,
    label: "Tech exec outreach – Microsoft exec",
    recipientName: "Chris Young",
    recipientRole: "Executive Vice President",
    recipientCompany: "Microsoft",
    recipientLink: "https://www.linkedin.com/in/christopheryoung4",
    askType: "feedback",
    reachingOutBecause: "I'm building medical software for nursing homes and would love your perspective on navigating large-scale tech transitions.",
    credibilityStory: "For a decade, I was COO of a medical company, spending a good chunk of that time moving our entire operation to cloud-based software. That experience ignited an idea to build my own medical software platform.",
    sharedAffiliation: {
      types: ['company'],
      name: "McKesson",
      detail: "VP of Technology, 2015–2019"
    }
  }
];
