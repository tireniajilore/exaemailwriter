# Frontend Design Skill

**Name:** frontend-design

**Description:** Creates distinctive, production-grade frontend interfaces that avoid generic AI aesthetics.

## When to Use

Use this skill when the user asks you to:
- Design a new UI or landing page
- Improve the visual design of an existing interface
- Create a more distinctive or memorable aesthetic
- Build something that "doesn't look like AI made it"

## Design Thinking Process

Before writing any code, think through:

1. **What emotion or atmosphere should this create?**
   - Calm authority? Playful energy? Serious precision?
   - What does success feel like for the user here?

2. **What makes this different from every other [product type]?**
   - Avoid: "clean", "modern", "minimalist" without a point of view
   - Ask: What's unexpected but appropriate?

3. **What's the aesthetic direction?**
   - Brutally minimal (but warm)
   - Maximalist chaos (but organized)
   - Retro-futuristic
   - Editorial / magazine-like
   - Handcrafted / analog
   - Clinical precision
   - etc.

## Frontend Aesthetics Guidelines

### Typography

**Avoid the default AI choices:**
- ❌ Inter, Roboto, Arial, Helvetica (unless intentionally brutalist)
- ❌ "Clean sans-serif" without character

**Instead, pick fonts with personality:**
- Serif headlines (Playfair Display, Crimson Text, Lora, Spectral)
- Monospace for data/code (JetBrains Mono, IBM Plex Mono)
- Condensed sans for labels (Roboto Condensed, Archivo Narrow)
- Variable fonts for dynamic sizing
- Mix weights and styles intentionally

**Type scale:**
- Don't use arbitrary sizes
- Use a modular scale (1.2, 1.333, 1.5, 1.618)
- Be generous with size jumps between hierarchy levels

### Color

**Avoid:**
- Pure grayscale (#000, #fff, #ccc)
- Generic blue (#3b82f6) without context
- Pastels by default

**Instead:**
- Rich, specific neutrals (warm grays, cool grays with personality)
- Accent colors that mean something (brand, emotion, function)
- Consider dark mode from the start
- Use HSL for systematic color generation

### Motion & Animation

**Use sparingly but intentionally:**
- Micro-interactions on hover/focus
- Staggered entrance animations
- Page transitions that reinforce hierarchy
- Avoid: spinning loaders, gratuitous parallax

**Timing:**
- Fast: 150-200ms for feedback
- Medium: 300-400ms for transitions
- Slow: 500-800ms for dramatic reveals

### Spatial Composition

**Break the grid sometimes:**
- Asymmetric layouts
- Overlapping elements
- Negative space as a design element
- Full-bleed images or backgrounds

**Rhythm:**
- Vary spacing (don't use `space-y-4` everywhere)
- Use golden ratio for major divisions
- Create visual "breathing room"

### Backgrounds & Atmosphere

**Avoid:**
- Plain white (#fff)
- Solid gradients (unless very subtle)

**Instead:**
- Textured backgrounds (noise, grain, mesh gradients)
- Layered transparency
- Subtle patterns
- Environmental lighting effects

## Critical: Avoid AI Slop

**The default AI aesthetic is:**
- Centered content
- Card-based everything
- Blue buttons
- Inter font
- White background
- Generic icons
- No personality

**Your job is to break this pattern** while maintaining usability.

## Implementation Complexity

**Match the complexity to the vision:**
- If the design needs custom animations, write them
- If it needs a unique layout, build it from scratch
- Don't reach for a component library if it limits the aesthetic
- Use Tailwind for speed, but override when needed

## Example Process

User: "Design a landing page for a developer tool"

**Bad approach:**
> I'll create a clean, modern landing page with a hero section, feature cards, and a CTA.

**Good approach:**
> I'm thinking brutally minimal meets technical precision:
> - Monospace serif hybrid (IBM Plex Mono + Crimson Text)
> - High contrast black/white with one accent color (terminal green #00ff00)
> - Terminal-style typing animation for the headline
> - Code blocks as first-class design elements, not just examples
> - Asymmetric grid with lots of negative space
> - Single-column, scroll-driven narrative
>
> Does this direction resonate, or should we explore something else?

## Remember

- Claude is capable of extraordinary creative work
- The user hired you because they want something better than templates
- Commit fully to a distinctive vision
- Explain your aesthetic choices so they can guide you
- Production-grade means: accessible, performant, and polished
