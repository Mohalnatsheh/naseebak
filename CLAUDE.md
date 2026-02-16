# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Naseeb (نصيب)** is a web-based traditional marriage facilitation platform for Jordan. It is **not** a dating app — there is zero direct communication between users. The platform uses AI-powered matching, admin-mediated family visit coordination, and a freemium suggestion model. The full specification lives in `SRS.md`.

**Current status:** Pre-implementation (specification phase). The project needs to be scaffolded from scratch based on the SRS.

## Technology Stack

- **Frontend:** Next.js + React + Tailwind CSS
- **Backend:** Next.js API Routes / Node.js
- **Database:** PostgreSQL + Prisma ORM
- **AI/ML:** Separate Python microservice (recommendation engine)
- **Auth:** NextAuth.js + JWT with refresh tokens
- **Payments:** eFAWATEERcom, PayPal, Stripe
- **Hosting:** Vercel + cloud database
- **Language:** Arabic only — entire UI is RTL

## Architecture

The system has four layers:

1. **Next.js app** — serves both the frontend (React/Tailwind) and backend API routes. Mobile-first, fully RTL Arabic.
2. **PostgreSQL via Prisma** — 12 tables: `users`, `profiles`, `personality_results`, `parent_info`, `identity_docs`, `photos`, `suggestions`, `likes`, `mutual_matches`, `visit_requests`, `payments`, `subscriptions`, `notifications`.
3. **Python ML service** — standalone microservice for match recommendations. Uses content-based filtering, collaborative filtering, and personality vector cosine similarity. Match factors: basic criteria (25%), values/religion (25%), personality quiz (30%), behavioral learning (20%).
4. **External services** — payment gateways, email notifications, encrypted cloud storage for ID documents and photos.

## Critical Domain Rules

These are hard constraints that must never be violated:

- **No messaging/chat/communication** between users — ever
- **Photos are hidden** until both users mutually like each other
- **Only female users receive suggestions**; males only respond to interest notifications
- **Identity verification** (government ID upload + admin review) is mandatory before any platform usage
- **Parent/guardian data** is visible to admin only, never to the other user
- **Free tier:** 5 lifetime suggestions per account; paid packages/subscriptions for more
- **Suggestion cards** show only: first name, age, city, education, job, compatibility %

## Matching Workflow

```
Female receives suggestion → accepts/rejects (no photos) →
  if accepted: male gets notified → accepts/rejects (no photos) →
    if mutual like: photos revealed + visit request created →
      admin contacts families → arranges in-person visit
```

## API Structure

All endpoints are under `/api/`. Key groups:
- `/api/auth/*` — register, login, password reset, logout
- `/api/identity/*` — ID upload and status check
- `/api/profile/*` — profile CRUD, photos, personality quiz, parent info
- `/api/suggestions/*` — get suggestions, like/reject
- `/api/matches/*` — mutual matches, photos (post-match only), visit status
- `/api/payments/*` — plans, checkout, history, webhook
- `/api/notifications/*` — list, mark read
- `/api/admin/*` — user management, identity review, manual suggestions, visit management, analytics

## User Roles

- **Female User (الفتاة):** Receives and accepts/rejects match suggestions
- **Male User (الشاب):** Receives notifications when a female shows interest, then accepts/rejects
- **Admin (الأدمن):** Verifies identities, sends manual suggestions, coordinates family visits, views analytics

## Key Non-Functional Requirements

- Page load < 3s, API response < 500ms, suggestion generation < 5s
- AES-256 encryption at rest, HTTPS/TLS in transit, bcrypt password hashing
- OWASP Top 10 compliance
- Mobile-first responsive design (320px+ width)
- Target: 1,000 concurrent users in Phase 1
