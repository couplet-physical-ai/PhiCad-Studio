# OneMind Marketing Strategy: Alpha/Beta Launch

## Context

OneMind is a **local-first AI desktop workspace** combining AI chat (multi-provider), knowledge management (wiki), document writing, and brainstorming canvas -- all running locally on the user's machine. No cloud dependency, BYOK (Bring Your Own Key) for AI providers.

**Situation:** Closed-source, macOS-only at launch (Windows/Linux within 3 months), solo founder, $0 marketing budget, zero existing audience, landing page exists (no domain yet), 1-2 months from alpha/beta readiness. Optional cloud sync planned for future. A few developer friends as seed testers.

**Content approach:** Brand account only (no personal social), screen recordings + animated videos (no face on camera).

**Goal:** Find alpha/beta testers, collect feedback, build early community. Free during testing. Paid after v1 launch with early adopter benefits.

---

## 0. CRITICAL: Naming & Domain Issue

### Problem: "OneMind" Has Major Trademark Conflicts

Research found **5+ active companies/products** using "OneMind" in tech/AI:

| Existing Entity | What They Do | Domain |
|----------------|--------------|--------|
| **OneMind Technologies** (Barcelona) | IoT smart buildings, 80 employees | onemindng.com |
| **OneMind Services** (Dublin, CA) | Managed cloud services, MSP | onemindservices.com |
| **OneMind (Smardaten)** | Big data management platform | smardaten.net/onemind |
| **OneMind Cloud Services** (India) | IT services | - |
| **OneMind Group** | AI & data solutions | onem1ndgroup.com |
| **onemind.ai** | Active developer portal | dev.onemind.ai |
| **1mind** | AI sales agents | 1mind.com |

**Risk:** Trademark infringement claims, domain unavailability, SEO competition, brand confusion.

### Recommendation: Consider Renaming Before Launch

With zero existing audience, now is the cheapest time to rename. Waiting until you have brand recognition makes it exponentially harder.

**Name evaluation criteria:**
- .com or .app domain available
- No existing software/tech products with same name
- Evokes: local/private + AI + knowledge/thinking + workspace
- Easy to spell, say, and remember
- Works globally (no unintended meanings)

**Names to investigate further** (less conflict found in research):
- **OwnMind** -- "Own your mind's workspace" (no direct product conflict found, check domain)
- Invented/compound words tend to have best domain availability
- Consider .app TLD -- cheaper, modern, signals desktop app

**Action needed:** Pick final name and secure domain BEFORE starting any marketing. All content, accounts, and community building depend on this.

---

## 1. Positioning & Messaging

### Core Positioning Statement
> **OneMind** -- Your AI workspace that stays on your machine. Chat, write, research, brainstorm -- with any AI model, zero cloud dependency.

### Key Differentiators (vs competition)

| vs | OneMind Advantage |
|----|-------------------|
| ChatGPT / Claude web | Local data, multi-provider, knowledge base, writing tools, no subscription lock-in |
| Notion AI | Local-first privacy, BYOK (no per-seat AI fees), desktop-native speed |
| Obsidian + AI plugins | Integrated AI chat + brainstorming canvas, no plugin fragility, unified experience |
| Jan.ai / LM Studio | Beyond just chat -- knowledge management, writing, brainstorming, project context |
| TypingMind | Richer feature set (wiki, writer, brainstorm canvas, project system, MCP tools) |

### Messaging Pillars (in priority order)

1. **Privacy & ownership** -- "Your data never leaves your machine"
2. **All-in-one AI workspace** -- "Stop switching between 5 AI tools"
3. **Any model, any provider** -- "OpenAI, Ollama, Anthropic, OpenRouter -- your choice"
4. **Built for thinkers** -- "For people who think for a living"

### One-liner variants (A/B test on landing page)
- "The AI workspace that respects your privacy"
- "Chat, write, research, brainstorm -- all local, all yours"
- "Your second brain, powered by any AI, owned by you"
- "Stop renting your AI tools. Own your workspace."

---

## 2. Target Audience Segments (Prioritized)

### Segment A: AI Power Users (PRIMARY - launch here first)
- **Who:** People already paying for ChatGPT/Claude, frustrated by limitations
- **Pain:** Conversation history scattered, no knowledge management, vendor lock-in, privacy concerns
- **Where:** r/ChatGPT, r/ClaudeAI, r/LocalLLaMA, r/artificial, AI Twitter
- **Message:** "All your AI conversations, organized, local, with any model"

### Segment B: Privacy-Conscious Professionals (SECONDARY)
- **Who:** Lawyers, consultants, researchers, anyone handling sensitive data
- **Pain:** Can't use cloud AI for confidential work, need AI but can't risk data leaks
- **Where:** r/selfhosted, r/privacy, r/degoogle, HN, niche professional forums
- **Message:** "AI-powered productivity that never phones home"

### Segment C: Knowledge Workers / PKM Enthusiasts (TERTIARY)
- **Who:** Obsidian/Notion users wanting deeper AI integration
- **Pain:** Bolt-on AI in existing tools is shallow, want native AI-first experience
- **Where:** r/ObsidianMD, r/Notion, r/PKM, r/productivity, YouTube PKM channels
- **Message:** "What if your knowledge base and AI assistant were the same app?"

### Segment D: Developers (LONG-TERM)
- **Who:** Devs who value extensibility, local-first, tool control
- **Where:** r/programming, HN, Dev.to, Twitter dev community
- **Message:** "Extensible AI workspace with MCP tools, module system, BYOK"

---

## 3. Pre-Launch Phase (Start NOW -- 6-8 weeks before beta)

### Week 1-2: Foundation

**Twitter/X Brand Account Setup** (brand account only, no personal)
- Create @[AppName]App account once name is finalized
- Pin tweet: 30-60 sec screen recording demo + "Building an AI workspace that stays on your machine. Alpha coming soon."
- Follow and engage with: AI tool builders, PKM community, indie hackers, local AI advocates
- Content format: screen recordings, animated explainer clips, GIFs (no face-on-camera needed)

**Landing Page Optimization**
- Ensure landing page has:
  - [ ] Clear headline (one of the one-liners above)
  - [ ] 30-60 sec demo video showing the "all-in-one wow moment" -- quick tour: chat → wiki → writer → brainstorm canvas, all in one app
  - [ ] Email capture with referral mechanics (use free tool: Tally.so, or Waitlist API)
  - [ ] 3-4 feature highlights with screenshots
  - [ ] "macOS" badge (set expectations)
  - [ ] "Alpha coming soon" urgency
- Remove all navigation/distractions. Single CTA: join waitlist.

**Discord Server Setup**
```
WELCOME
  #rules
  #introductions
  #announcements

PRODUCT
  #general
  #feature-requests
  #bug-reports
  #tips-and-workflows

FEEDBACK
  #alpha-feedback (role-gated)

DEV
  #changelog
  #roadmap

COMMUNITY
  #off-topic
  #ai-tools-chat
```

### Week 3-6: Build Audience (Building in Public)

**Twitter/X cadence: 3-5 posts/week**
Content mix:
- 40% Progress updates with screenshots/GIFs ("Added knowledge page mentions in chat today")
- 30% Opinions on AI tools / local-first / privacy ("Why I think your AI workspace shouldn't need an internet connection")
- 20% Behind-the-scenes (architecture decisions, challenges, design process)
- 10% Engagement (reply to others, quote-tweet relevant discussions)

**Blog posts (Dev.to + cross-post to Hashnode): 1-2 posts**
Article ideas:
- "Why I'm building a local-first AI workspace" (personal story + vision)
- "The case for BYOK: why your AI app shouldn't own your API keys"
- "How I built a modular desktop app with Tauri + React + Bun" (technical, for dev audience)

**Community engagement: Daily, 15-30 min**
- Participate in r/LocalLLaMA, r/selfhosted, r/ObsidianMD as genuine community member
- Answer questions, share insights, DON'T promote yet
- Build recognition as someone knowledgeable about local AI tools

### Week 7-8: Pre-Launch Hype

- Announce alpha date on Twitter + Discord
- Email waitlist: "Alpha access in 2 weeks -- here's what to expect"
- Post teaser on r/SideProject or r/selfhosted (soft launch, gauge interest)
- Reach out to 5-10 people from community interactions: personal DM inviting to alpha

---

## 4. Alpha Phase (Weeks 1-6 after launch)

### Structure
- **Size:** 30-50 hand-picked testers
- **Source:** Waitlist signups, Twitter followers, Discord members, community contacts
- **Access:** Direct download link, no public distribution

### Recruitment Strategy (Zero Budget)

| Channel | Action | Expected Signups |
|---------|--------|-----------------|
| Twitter/X | "Alpha spots open -- DM me if you want early access" post | 10-20 |
| Discord | Announce in server, give alpha role | 5-10 |
| Reddit (r/alphaandbetausers) | Structured feedback request post | 10-15 |
| Reddit (r/LocalLLaMA) | "I built a local AI workspace, looking for alpha testers" | 10-20 |
| Personal network | DMs to interesting people from community | 5-10 |

### Feedback Collection
- **In-app:** Simple feedback button (already exists in OneMind based on code analysis)
- **Discord #alpha-feedback:** Structured template (what happened / expected / severity)
- **Weekly 15-min calls:** With 3-5 most engaged testers (rotate weekly)
- **NPS survey:** At week 2 and week 4 (Tally.so free form)

### Alpha KPIs
- Daily Active Users (DAU) -- target: 10-15 of 50
- Feedback submissions/week -- target: 5-10
- Critical bugs found -- target: fix within 48h
- Feature requests logged -- target: 20+ unique requests

### Engagement Tactics
- **Daily changelog** in Discord (even small fixes)
- Close the loop: "@user your bug from Monday is fixed in today's build"
- Weekly "Alpha Update" email (what shipped, what's next, ask for specific feedback)
- Alpha tester badge in Discord

---

## 5. Beta Phase (Weeks 7-16)

### Structure
- **Size:** 200-500 users, released in cohorts of 50-100
- **Source:** Waitlist (referral priority), community growth, content marketing, launches
- **Access:** Waitlist invitation waves

### Launch Sequence

**Week 7-8: Closed Beta + Founding Member Announcement**
- Open waitlist invitations (first 100)
- Announce "Founding Member" program (details in pricing section)
- Submit to BetaList (free listing for beta products)
- Submit to AlternativeTo.net (list as alternative to Notion, Obsidian, ChatGPT)

**Week 9-10: Hacker News Launch**
- **Show HN post** -- Sunday early morning UTC
- Title: "Show HN: OneMind -- Local-First AI Workspace (Chat + Wiki + Writing + Brainstorming)"
- Engage deeply with every comment (plan to dedicate full day)
- Have Discord ready for HN traffic surge

**Week 11-12: Content Burst**
- Dev.to article: "I launched OneMind on HN -- here's what I learned"
- Reddit posts (stagger across 2 weeks):
  - r/selfhosted: "Self-hosted AI workspace with knowledge management"
  - r/LocalLLaMA: "Built a desktop app that works with Ollama + OpenAI + any provider"
  - r/ObsidianMD: "For those wanting deeper AI integration -- built something different"
  - r/SaaS: Launch story + feedback request
- Cross-post blog to Hashnode + Medium

**Week 13-14: YouTube Outreach**
- Identify 5-10 niche YouTube channels (10K-100K subs) covering:
  - Obsidian / PKM workflows
  - AI tools reviews
  - Mac productivity apps
  - Local AI / Ollama setups
- Send personal email: early access + offer to do founder Q&A
- Prepare media kit: screenshots, key features, demo video, talking points

**Week 15-16: Product Hunt Launch**
- **Day:** Tuesday or Wednesday, 12:01 AM PST
- Prepare: tagline, 5 images, 1 min video, first comment (founder story)
- Notify Discord + email list on launch day
- Respond to every PH comment in real-time
- Goal: Top 5 of the day

### Beta KPIs
- Waitlist signups -- target: 500-1000
- Beta users -- target: 200-500
- DAU -- target: 50-100
- Discord members -- target: 200-500
- Founding Member conversions -- target: 50-100

---

## 6. Early Adopter Benefits & Pricing Preview

### During Alpha/Beta (FREE)
All features free. BYOK for AI providers. No limitations.

### Founding Member Program (Announce During Beta)

| Tier | Price | Includes | Limit |
|------|-------|----------|-------|
| **Founding Member** | $49 one-time | All current + future Pro features for 2 years, Founding Member badge in app + Discord, name on public Founders Wall, priority feature voting, direct Discord channel with founder | 200 seats |

**Why $49:**
- Low enough for impulse purchase from engaged beta users
- High enough to signal value (not throwaway)
- ~6 months of expected $8/mo subscription = fair deal perception
- 200 seats x $49 = $9,800 initial revenue (covers tools + infrastructure for year 1)

### Post-Launch Pricing (v1 Release)

| Tier | Price | Includes |
|------|-------|----------|
| **Free** | $0 | Core chat (1 provider), 1 workspace, basic knowledge module |
| **Pro** | $8/mo (annual) / $10/mo (monthly) | All modules, unlimited providers, unlimited workspaces, MCP tools, priority support |
| **Pro Lifetime** | $99 one-time | Same as Pro, 2 years of major updates. Limited to 500 seats |

**Future (when cloud sync ships):**
| **Pro + Sync** | $12/mo | Pro + cross-device sync, cloud backup |

### Early Adopter Benefits Summary
- Alpha testers: 6 months free Pro after launch + Founding Member badge
- Beta testers: 3 months free Pro after launch + Early Adopter badge
- Founding Members ($49): 2 years Pro + permanent badge + Founders Wall + voting rights
- All early adopters: Grandfathered at launch pricing forever (no price increases)

---

## 7. Content Strategy (Ongoing, Zero Budget)

### Content Calendar Template (Monthly)

| Week | Twitter (3-5/wk) | Blog (1/mo) | Reddit (2-3/mo) | Discord |
|------|-------------------|-------------|------------------|---------|
| 1 | Feature demo GIF, opinion post, progress update | Monthly devlog | r/LocalLLaMA thread | Weekly changelog |
| 2 | User showcase, behind-scenes, engagement | - | r/selfhosted or r/PKM | Community call (optional) |
| 3 | Comparison post, technical insight, demo | - | r/SideProject feedback | Feature vote |
| 4 | Milestone celebration, roadmap preview, engagement | - | - | Monthly recap |

### High-Performing Content Types (Ranked by ROI for $0 budget)

1. **Short video demos** (Twitter) -- 15-30 sec screen recordings showing "wow moments"
2. **"I built X" Reddit posts** -- personal story + product, r/SideProject and r/SaaS
3. **Show HN posts** -- highest single-day traffic potential
4. **Dev.to technical articles** -- built-in audience, great SEO
5. **Comparison content** -- "OneMind vs Notion AI vs Obsidian AI" (blog + Reddit)
6. **Weekly changelog** (Discord + Twitter) -- shows momentum, builds trust

### Video & Visual Content Strategy (Your Strength)

Since you're comfortable with screen recordings + animated videos, lean into this -- video consistently outperforms text on Twitter and Reddit.

**Video types to create:**
1. **Product demo** (60 sec) -- All-in-one workspace tour for landing page
2. **Feature spotlights** (15-30 sec) -- One feature per clip for Twitter/Reddit (e.g., "Brainstorm canvas with AI validation")
3. **Animated explainers** (30-60 sec) -- "Why local-first AI matters" style educational content
4. **Comparison videos** (60-90 sec) -- "OneMind vs ChatGPT: what's different" side-by-side

**Free tools for animated content:**
- **Kap** (macOS) -- screen recording with GIF export
- **OBS Studio** -- screen recording with overlays
- **Canva** (free tier) -- animated social media clips
- **ScreenStudio** -- polished screen recordings (free trial, then paid)
- **Motion Canvas** (open-source) -- programmatic animations for tech content

**Cadence:** 1-2 short videos/week for Twitter. Repurpose across Reddit, Discord, landing page.

### SEO Keywords to Target (Blog Content)

- "local AI workspace"
- "private AI assistant desktop"
- "Obsidian alternative with AI"
- "BYOK AI app"
- "local-first knowledge management"
- "AI brainstorming tool desktop"
- "Ollama desktop app"
- "AI writing tool offline"

---

## 8. Community Building Playbook

### Discord Growth Strategy

**Month 1 (pre-launch):** Seed with 20-30 members from personal outreach
**Month 2 (alpha):** Grow to 50-100 via alpha invites + Twitter
**Month 3-4 (beta):** Grow to 200-500 via HN/Reddit/PH launches

**Engagement tactics:**
- Welcome bot with role selection (user type: developer / writer / researcher / curious)
- Weekly "What are you building/working on?" thread
- Monthly community call / AMA (15-30 min, casual)
- User spotlight: feature one power user's workflow monthly
- Founder posts daily during alpha/beta (even just "shipped X today")

### Feedback Loop (Critical for Retention)

```
User reports issue → Public triage ("Good catch, adding to sprint")
→ Fix shipped → Tag reporter in changelog ("Fixed! Thanks @user")
→ User feels heard → Reports more → Others see loop, participate
```

This is the #1 retention tactic. Every successful tool (Obsidian, Linear, Cursor) credits visible feedback loops for early community loyalty.

---

## 9. Launch Timeline Summary

```
NOW ──────────── ALPHA ──────────── BETA ──────────── LAUNCH
  |                |                  |                  |
  | Wk 1-2:       | Wk 1-2:         | Wk 7-8:         | Wk 20+:
  | Landing page   | 30-50 testers   | Open beta 100+   | v1 + pricing
  | Twitter setup  | Daily changelog  | Founding Members  | End LTD
  | Discord setup  | Weekly calls     | BetaList submit   |
  |                |                  |                   |
  | Wk 3-6:       | Wk 3-4:         | Wk 9-10:         |
  | Build in public| Iterate on       | Show HN launch    |
  | Blog posts     | feedback         |                   |
  | Community      |                  | Wk 11-14:        |
  | engagement     | Wk 5-6:         | Content burst     |
  |                | Polish for beta  | YouTube outreach  |
  |                |                  |                   |
  |                |                  | Wk 15-16:        |
  |                |                  | Product Hunt      |
```

---

## 10. Tools (All Free)

| Purpose | Tool | Cost |
|---------|------|------|
| Landing page analytics | Plausible (self-host) or Umami | Free |
| Email waitlist | Tally.so or Google Forms + Sheets | Free |
| Email newsletters | Buttondown (free tier: 100 subs) | Free |
| Discord community | Discord | Free |
| Blog | Dev.to + Hashnode (cross-post) | Free |
| Social scheduling | Buffer (free tier: 3 channels) | Free |
| Feedback forms | Tally.so | Free |
| Video recording | OBS Studio + Kap (macOS) | Free |
| Design / screenshots | Figma (free) + CleanShot X trial | Free |
| Beta listing | BetaList, AlternativeTo | Free |

---

## 11. Success Metrics

### Phase Goals

| Phase | Primary Metric | Target |
|-------|---------------|--------|
| Pre-launch | Waitlist signups | 200-500 |
| Alpha | Active testers / feedback quality | 15-20 DAU, 5+ feedback/week |
| Beta | User growth + engagement | 200-500 users, 50-100 DAU |
| Launch | Conversions + revenue | 50-100 Founding Members ($2,450-$4,900) |

### North Star Metric
**Weekly Active Users who create content** (chat messages, knowledge pages, documents, brainstorm nodes). This measures real engagement, not just downloads.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| macOS-only limits audience | Lead with "Mac-first, Windows + Linux coming in 3 months" messaging. Many dev/creative tools launch Mac-first (Arc, Raycast, Cursor). Add Windows/Linux waitlist on landing page to capture demand |
| Closed-source reduces HN/Reddit trust | Emphasize local-first privacy angle. Offer transparency reports on what data app touches. Consider open-sourcing modules/plugins later |
| Zero budget = slow growth | Compensate with consistent content cadence + deep community engagement. Linear grew to 10K waitlist on $35K total spend |
| Solo founder burnout | Batch content creation (1 day/week). Automate changelog. Focus on highest-ROI channels only (Twitter + 1 Reddit community + Discord) |
| Early users churn after beta | Close feedback loops aggressively. Make early adopter benefits meaningful. Monthly "what shipped because of you" emails |

---

## Unresolved Questions

1. ~~App name "OneMind" -- domain/trademark checked?~~ **RESOLVED: Major conflicts found. Renaming recommended before launch.**
2. ~~Landing page URL?~~ **RESOLVED: No domain yet. Must secure after naming decision.**
3. ~~Building in public approach?~~ **RESOLVED: Brand account only.**
4. ~~#1 wow moment?~~ **RESOLVED: All-in-one workspace tour.**
5. ~~Windows/Linux timeline?~~ **RESOLVED: Within 3 months of Mac launch.**
6. ~~Existing connections?~~ **RESOLVED: A few developer friends (seed testers).**
7. ~~Video comfort?~~ **RESOLVED: Screen recordings + animated videos, no face.**

### Still Open

1. **Final app name decision** -- need to pick name, verify domain availability, secure domain
2. **Payment processor preference** -- Gumroad, Paddle, Stripe, or LemonSqueezy for Founding Member sales?
3. **App distribution** -- direct download from website only, or also Mac App Store? (30% cut implications)
4. **Any existing beta/waitlist signups** on current landing page?
5. **Is there an existing app icon/logo** that works with a new name?

---

## Research Sources & Benchmarks

**Case studies referenced:**
- **Linear:** 10K waitlist with $35K total marketing spend, invite-only, building in public on Twitter ([source](https://www.growth-letter.com/p/this-startup-had-10000-people-on))
- **Cursor:** 0 → 1M users in 16 months, $0 marketing budget, pure PLG + freemium ([source](https://www.productgrowth.blog/p/how-cursor-ai-hacked-growth))
- **Obsidian:** $2M ARR, 18 people, free core + paid cloud, Discord community from day 1 ([source](https://www.robinlandy.com/blog/obsidian-as-an-example-of-thoughtful-pricing-strategy-and-the-power-of-product-tradeoffs))
- **Arc Browser:** Invite-only waitlist with referral codes, 1M+ waitlist ([source](https://www.howtheygrow.co/p/how-arc-grows))
- **Notion:** Community-led growth, 95% organic traffic, ambassador program ([source](https://www.competitiveintelligencealliance.io/how-notion-grows/))

**Pricing benchmarks:** Obsidian (free + $5/mo sync), TypingMind ($39-79 one-time BYOK), Cursor ($20/mo), Raycast ($8/mo), Notion ($10/mo)

**Conversion benchmarks:** Freemium → paid: 3-5% typical, 6-8% good. Beta → paid: 5-15% typical.
