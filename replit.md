# Cold Email Assistant

An AI-powered tool that researches recipients and generates personalized cold emails with strict quality validation.

## Overview

This application helps users write effective cold emails by:
1. Researching recipients using the Exa API
2. Generating personalized emails using Lovable AI Gateway (LLM)
3. Validating emails against strict quality rules (must contain "Like you," exactly once, no em-dashes, word count 60-150, etc.)
4. Supporting Prolific research study integration

## Project Architecture

### Stack
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express routes (backend)

### Directory Structure
```
/
├── server/              # Backend Express server
│   ├── index.ts         # Server entry point
│   ├── routes.ts        # API routes (generate-email, prolific endpoints)
│   ├── storage.ts       # Database storage layer
│   ├── db.ts            # Drizzle database connection
│   └── vite.ts          # Vite middleware for dev mode
├── shared/
│   └── schema.ts        # Drizzle schema definitions
├── src/                 # Frontend React app
│   ├── pages/           # Page components
│   ├── components/      # Reusable UI components
│   ├── lib/             # Utilities and API helpers
│   └── contexts/        # React contexts
├── drizzle.config.ts    # Drizzle ORM config
├── vite.config.ts       # Vite config
└── package.json
```

### Key API Endpoints
- `POST /api/generate-email` - Generate personalized cold email
- `POST /api/prolific/session` - Create Prolific study session
- `POST /api/prolific/survey` - Submit post-study survey

### Database Tables
- `prolific_sessions` - Study participant sessions
- `email_generations` - Generated email logs and analytics
- `prolific_post_survey` - Survey responses
- `prolific_step_tracking` - Step-by-step tracking

## Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string (auto-configured by Replit)
- `LOVABLE_API_KEY` - API key for Lovable AI Gateway (LLM)
- `EXA_API_KEY` - API key for Exa Research API

## Development
- Run: `npm run dev`
- Database push: `npm run db:push`
- Build: `npm run build`

## Recent Changes
- December 28, 2025: Migrated from Lovable/Supabase to Replit environment
  - Ported Supabase Edge Functions to Express API routes
  - Replaced Supabase client with direct API calls
  - Set up PostgreSQL with Drizzle ORM
  - Updated frontend to use new API endpoints
