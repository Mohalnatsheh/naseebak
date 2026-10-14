# Naseeb — نصيب
## Smart Traditional Marriage Platform
### Software Requirements Specification (SRS)
**Version:** 1.0 | **Date:** February 16, 2026 | **Technology:** Next.js + React

---

# Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Database Schema](#5-database-schema)
6. [User Interface (UI/UX)](#6-user-interface-uiux)
7. [API Endpoints](#7-api-endpoints)
8. [Constraints & Assumptions](#8-constraints--assumptions)
9. [Future Enhancements](#9-future-enhancements)

---

# 1. Introduction

## 1.1 Purpose

This document defines the functional and non-functional requirements for **Naseeb**, a web-based platform that modernizes the traditional Jordanian marriage process. The platform leverages AI-powered matching and personality analysis while preserving the family-centered, culturally respectful nature of traditional Jordanian marriage customs.

## 1.2 Project Scope

Naseeb is an Arabic-only website that facilitates traditional marriage in Jordan through:

- **AI-powered matching** using personality quizzes and compatibility algorithms
- **Full privacy protection** — only first names are shown; photos are hidden until mutual interest is confirmed
- **Zero direct communication** between users — no messaging, no chat, no contact exchange
- **Family visit coordination** managed entirely by the admin team
- **Freemium model** — 10 free match credits granted at registration, with paid packages and monthly subscriptions for more; suggestions start once the profile is at least 50% complete
- **Optional identity verification** via selfie photo upload after sign-up (no government ID required); verified users get a badge

## 1.3 Definitions & Terminology

| Term | Definition |
|------|-----------|
| Female User (الفتاة) | The user who receives match suggestions and accepts or rejects them |
| Male User (الشاب) | The user who registers his profile and receives notifications when a female user likes him |
| Mutual Like (الإعجاب المتبادل) | When both parties approve each other without knowing full names |
| Family Visit (الزيارة العائلية) | An in-person visit arranged by the admin for the male's family to visit the female's family |
| Personality Quiz (اختبار الشخصية) | A set of questions that analyze user personality to improve matching accuracy |
| Suggestion (اقتراح) | A match recommendation sent to the female user (AI-generated or admin-curated) |
| Admin (الأدمن) | Platform administrator who manages users, sends manual suggestions, and coordinates family visits |

## 1.4 Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js + React + Tailwind CSS |
| Backend | Next.js API Routes / Node.js |
| Database | PostgreSQL + Prisma ORM |
| AI/ML | Python ML Service (Recommendation Engine) |
| Authentication | NextAuth.js + JWT |
| Payments | eFAWATEERcom / PayPal / Stripe |
| Hosting | Vercel + Cloud Database |
| Language | Arabic only (RTL layout) |

---

# 2. System Overview

## 2.1 Product Description

Naseeb is a web platform that revives the concept of traditional marriage in Jordan using modern technology. Unlike dating apps, Naseeb provides **no direct communication** between users. Instead, it relies on an intelligent suggestion system and manual admin oversight, culminating in a real-world family visit — exactly as traditional Jordanian marriage customs work, but digitally facilitated.

## 2.2 User Roles

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| Female User | Receives match suggestions | Register, complete profile, accept/reject suggestions, pay |
| Male User | Waits for interest notifications | Register, complete profile, accept/reject notifications, pay |
| Admin | Platform manager | Manage users, verify identities, send manual suggestions, coordinate visits, view analytics |

## 2.3 Main Workflow

```
1. Registration     → User creates account (phone + OTP); selfie verification is optional and done later from the dashboard
2. Verification     → Admin reviews and approves/rejects the selfie
3. Profile Setup    → User fills personal data + personality quiz + parent info
4. Suggestions      → System sends suggestions to female user
                       (first name + general info only, NO photos)
5. Accept/Reject    → Female user accepts or rejects each suggestion
6. Notify Male      → If accepted, male receives female's card
                       (first name + general info, NO photos)
7. Mutual Like      → If male also accepts → photos revealed to both parties
8. Family Visit     → Admin contacts both families and arranges the visit
```

---

# 3. Functional Requirements

## 3.1 Registration & Authentication

### FR-001: Account Creation

| Field | Details |
|-------|---------|
| Description | User can create a new account using phone number or email |
| Inputs | First name, phone/email, password, gender (male/female) |
| Outputs | New account with status "Pending Verification" |
| Validations | Phone must be valid Jordanian number; email must be valid format; password min 8 characters; age must be 18+ |
| Priority | High |

### FR-002: Identity Verification (Mandatory)

| Field | Details |
|-------|---------|
| Description | Users may optionally upload a recent, clear selfie photo of their face after sign-up (no government ID is requested). Verification is not required to use the platform |
| Inputs | Selfie image (front camera on mobile) |
| Process | Admin reviews the selfie manually (compared against profile photos where available) and approves or rejects |
| Outputs | Account status changes to "Verified" or "Rejected" with reason |
| Restrictions | User cannot receive suggestions or be suggested to others until verified |
| Priority | High |

### FR-003: Login

| Field | Details |
|-------|---------|
| Description | Login via phone/email + password |
| Features | "Forgot password" via OTP sent to phone/email |
| Session | JWT-based authentication with refresh tokens |
| Priority | High |

### FR-004: Logout & Account Deactivation

| Field | Details |
|-------|---------|
| Description | User can log out or temporarily deactivate their account |
| Deactivation | Hides profile from suggestions; can be reactivated anytime |
| Priority | Medium |

---

## 3.2 User Profile

### FR-005: Profile Completion

The user must complete the following data before the account becomes active:

| Category | Fields |
|----------|--------|
| Basic Info | First name, date of birth, city/region, marital status (single/divorced/widowed) |
| Education & Work | Education level, field of study, job title, approximate income range |
| Values & Religion | Level of religious commitment, family values, expectations from partner |
| Interests | Hobbies, interests, preferred lifestyle |
| Photos | At least 1 personal photo (visible **only after mutual like**) |
| Parent Info | Parent/guardian name, parent phone number, home address (**mandatory** for visit coordination) |

### FR-006: Personality Quiz

| Field | Details |
|-------|---------|
| Description | A set of 15–25 questions analyzing the user's personality and preferences |
| Topics Covered | Communication style, decision-making, family values, ambition, lifestyle preferences, conflict resolution |
| Output | A numeric personality vector stored in the database, used by the AI matching algorithm |
| Completion | Mandatory before receiving suggestions |
| Retake Policy | Can be retaken once every 3 months |
| Priority | High |

### FR-007: Profile Editing

| Field | Details |
|-------|---------|
| Description | Users can edit their personal data and photos at any time |
| Restrictions | First name changes require admin approval; personality quiz retake limited to once per 3 months |
| Priority | Medium |

---

## 3.3 Suggestion System

### FR-008: Generating Suggestions for Female Users

| Field | Details |
|-------|---------|
| Description | The system sends match suggestions to female users based on the AI matching algorithm and/or manual admin selection |
| Visible Information | First name only, age, city, education level, job, compatibility percentage |
| Hidden Information | Full name, photos, phone number, parent info — all hidden at this stage |
| Free Limit | 5 suggestions per account (lifetime) |
| Paid Access | Additional suggestions via package purchase or monthly subscription |
| Priority | High |

### FR-009: AI Matching Algorithm

The matching engine considers the following factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Basic Criteria | 25% | Age compatibility, geographic proximity, education level, employment |
| Values & Religion | 25% | Religious commitment alignment, family values compatibility |
| Personality Quiz | 30% | Personality vector similarity/complementarity analysis |
| Behavioral Learning | 20% | Improved suggestions based on past accept/reject patterns |

**Technical Implementation:**
- Content-based filtering using profile attributes
- Collaborative filtering learning from user interaction patterns
- Personality vector cosine similarity scoring
- Compatibility score output as percentage (0–100%)

### FR-010: Manual Suggestions by Admin

| Field | Details |
|-------|---------|
| Description | Admin can browse profiles and manually send suggestions to female users |
| Use Case | Cases where AI suggestions are insufficient, or admin identifies a strong match |
| Behavior | Manual suggestions work identically to AI suggestions from the user's perspective |
| Priority | High |

---

## 3.4 Like & Approval System

### FR-011: Accept/Reject Suggestion (Female User)

| Field | Details |
|-------|---------|
| Description | Female user sees suggestion card with first name, age, city, education, job, and compatibility %. She selects "Suitable" or "Not Suitable" |
| Photos | **NOT shown** at this stage |
| Reject Behavior | Suggestion is archived; same male will not be suggested again |
| Priority | High |

### FR-012: Notify Male User

| Field | Details |
|-------|---------|
| Description | When a female user accepts, the male receives a notification containing the female's card (first name + general info + compatibility %) |
| Action Required | Male must accept or reject |
| Photos | **NOT shown** at this stage |
| Priority | High |

### FR-013: Mutual Like

When **both parties accept each other**:

| Action | Details |
|--------|---------|
| Photos Revealed | Personal photos become visible to both users |
| Visit Request Created | An automatic visit request is created for the admin |
| Parent Data Accessible | Admin can now see both parties' parent info (name, phone, address) |
| Notification | Both users are notified of the mutual match |
| **Important** | Parent data is visible to **admin only**, never to the other user |

---

## 3.5 Family Visit Coordination

### FR-014: Visit Request Management (Admin)

| Field | Details |
|-------|---------|
| Description | Admin contacts both families by phone to arrange the visit |
| Available Data | Parent/guardian name, phone number, city, home address |
| Visit Statuses | Pending Contact → Contacted → Date Scheduled → Visit Completed → Cancelled |
| Admin Actions | Update status, add notes, schedule date, mark as complete or cancelled |
| Priority | High |

### FR-015: Visit Status Tracking (User)

| Field | Details |
|-------|---------|
| Description | Users can see the current status of their visit request in their dashboard |
| Visible Statuses | "Being Arranged" / "Date Scheduled: [date]" / "Completed" / "Cancelled" |
| Priority | Medium |

---

## 3.6 Payment System

### FR-016: Pricing Plans

| Plan | Details | Target |
|------|---------|--------|
| Free | 5 suggestions per account (one-time, lifetime) | All users |
| Suggestion Pack | 5 additional suggestions at a fixed price | Female users who exhaust free suggestions |
| Monthly Subscription | Unlimited suggestions for the subscription period | Active female users |

### FR-017: Payment Gateway

| Field | Details |
|-------|---------|
| Supported Gateways | eFAWATEERcom (local Jordan), PayPal, Stripe |
| Features | Electronic invoices, payment history, auto-renewal for subscriptions |
| Security | PCI DSS compliant gateway integration |
| Refund Policy | No refunds for used suggestions; unused subscription time refundable |
| Priority | High |

---

## 3.7 Admin Dashboard

### FR-018: User Management

- View all users with filtering by status (pending, verified, rejected, suspended)
- Review identity documents (approve/reject with reason)
- Suspend or ban accounts
- View detailed user profiles and activity history

### FR-019: Manual Suggestion Management

- Browse all verified profiles with search and filter
- Send manual suggestions to specific female users
- Track suggestion outcomes (accepted/rejected)

### FR-020: Visit Management

- Comprehensive dashboard for all visit requests
- Status tracking with timeline
- Notes and comments per visit
- Contact log for parent communications

### FR-021: Analytics Dashboard

| Metric | Description |
|--------|-------------|
| Total Users | Registered, verified, active, suspended counts |
| Match Rate | Percentage of suggestions that result in mutual likes |
| Visit Completion | Percentage of mutual matches that result in completed visits |
| Revenue | Total revenue, breakdown by plan type, monthly trends |
| AI Performance | Suggestion acceptance rate, average compatibility scores |

---

## 3.8 Notifications

### FR-022: Notification System

| Event | Recipient | Channel |
|-------|-----------|---------|
| New suggestion available | Female user | In-app + Email |
| A female liked your profile | Male user | In-app + Email |
| Mutual like confirmed | Both users | In-app + Email |
| Visit status updated | Both users | In-app + Email |
| Identity verification result | User | In-app + Email |
| Subscription expiring soon | Subscriber | In-app + Email |
| Payment confirmation | User | In-app + Email |

---

# 4. Non-Functional Requirements

## 4.1 Performance

| Metric | Target |
|--------|--------|
| Page load time | < 3 seconds |
| Suggestion generation time | < 5 seconds |
| Concurrent users (Phase 1) | 1,000 |
| API response time | < 500ms for standard endpoints |
| Image upload processing | < 10 seconds |

## 4.2 Security & Privacy

| Requirement | Details |
|-------------|---------|
| Data Encryption | AES-256 for all sensitive data at rest |
| Transport Security | HTTPS/TLS for all communications |
| ID Storage | Verification selfies stored in encrypted, access-controlled cloud storage |
| Photo Protection | Personal photos visible only after mutual like; right-click/download disabled; screenshot protection (best effort) |
| No Messaging | Absolutely no direct communication system between users |
| Authentication | JWT with refresh tokens; rate limiting on login attempts |
| Password Storage | bcrypt hashing with salt |
| OWASP Compliance | Protection against XSS, CSRF, SQL injection, and other OWASP Top 10 |

## 4.3 Compatibility

| Requirement | Details |
|-------------|---------|
| Responsive Design | Mobile-first, fully responsive for all screen sizes |
| Browsers | Chrome, Safari, Firefox, Edge (latest 2 versions) |
| RTL Support | Full right-to-left layout for Arabic language |
| Minimum Screen | 320px width (mobile) |

## 4.4 Reliability

| Requirement | Target |
|-------------|--------|
| Uptime | 99.5% minimum |
| Backup | Automated daily backups with 30-day retention |
| Disaster Recovery | Recovery Point Objective (RPO) < 24 hours |

## 4.5 Scalability

- Architecture supports horizontal scaling for future expansion to other Arab countries
- Database design accommodates multi-region deployment
- Modular AI service allows independent scaling of the recommendation engine
- Mobile app integration capability for future phases

---

# 5. Database Schema

## 5.1 Entity Relationship Summary

```
users ──── profiles
  │  ──── personality_results
  │  ──── parent_info
  │  ──── identity_docs
  │  ──── photos
  │  ──── payments
  │  ──── subscriptions
  │  ──── notifications

suggestions (female_user_id, male_user_id)
  │  ──── likes
  │  ──── mutual_matches
                │  ──── visit_requests
```

## 5.2 Table Definitions

### users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| first_name | VARCHAR(50) | User's first name (displayed in suggestions) |
| email | VARCHAR(255) | Unique, nullable (if phone used) |
| phone | VARCHAR(20) | Unique, nullable (if email used) |
| password_hash | VARCHAR(255) | bcrypt hashed password |
| gender | ENUM('male', 'female') | User gender |
| role | ENUM('user', 'admin') | Default: 'user' |
| status | ENUM('pending', 'verified', 'rejected', 'suspended') | Account status |
| free_suggestions_remaining | INTEGER | Default: 5 |
| verified_at | TIMESTAMP | When identity was verified |
| created_at | TIMESTAMP | Account creation date |
| updated_at | TIMESTAMP | Last update |

### profiles
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| birth_date | DATE | Date of birth |
| city | VARCHAR(100) | City/region in Jordan |
| marital_status | ENUM('single', 'divorced', 'widowed') | Current marital status |
| education_level | VARCHAR(50) | Education level |
| field_of_study | VARCHAR(100) | Major/specialization |
| job_title | VARCHAR(100) | Current job |
| income_range | VARCHAR(50) | Approximate income bracket |
| religiosity | INTEGER(1-5) | Level of religious commitment |
| family_values | TEXT | Free text on family expectations |
| partner_expectations | TEXT | What they look for in a partner |
| hobbies | TEXT | Comma-separated hobbies |
| interests | TEXT | Comma-separated interests |
| lifestyle | VARCHAR(50) | Preferred lifestyle |
| is_complete | BOOLEAN | Whether profile is fully filled |

### personality_results
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| answers_json | JSONB | Raw quiz answers |
| personality_vector | FLOAT[] | Computed personality vector for AI matching |
| completed_at | TIMESTAMP | When the quiz was completed |

### parent_info
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| parent_name | VARCHAR(100) | Guardian full name |
| parent_phone | VARCHAR(20) | Guardian phone number |
| address | TEXT | Home address for visit coordination |

### identity_docs
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| front_image_url | VARCHAR(500) | Encrypted storage URL for ID front |
| back_image_url | VARCHAR(500) | Encrypted storage URL for ID back |
| status | ENUM('pending', 'approved', 'rejected') | Review status |
| rejection_reason | TEXT | Reason if rejected |
| reviewed_by | UUID | Foreign key → users (admin) |
| reviewed_at | TIMESTAMP | When reviewed |

### photos
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| image_url | VARCHAR(500) | Encrypted storage URL |
| is_primary | BOOLEAN | Primary display photo |
| uploaded_at | TIMESTAMP | Upload date |

### suggestions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| female_user_id | UUID | Foreign key → users (female) |
| male_user_id | UUID | Foreign key → users (male) |
| source | ENUM('ai', 'admin') | How the suggestion was generated |
| match_score | DECIMAL(5,2) | Compatibility percentage (0–100) |
| status | ENUM('pending', 'accepted', 'rejected', 'expired') | Female user's response |
| created_at | TIMESTAMP | When suggestion was created |

### likes
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| suggestion_id | UUID | Foreign key → suggestions |
| user_id | UUID | Foreign key → users (the user who liked/rejected) |
| is_liked | BOOLEAN | true = liked, false = rejected |
| created_at | TIMESTAMP | When action was taken |

### mutual_matches
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| suggestion_id | UUID | Foreign key → suggestions |
| matched_at | TIMESTAMP | When mutual like was confirmed |

### visit_requests
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| mutual_match_id | UUID | Foreign key → mutual_matches |
| status | ENUM('pending_contact', 'contacted', 'scheduled', 'completed', 'cancelled') | Visit status |
| scheduled_date | DATE | Scheduled visit date |
| admin_notes | TEXT | Internal admin notes |
| assigned_admin | UUID | Foreign key → users (admin handling this) |
| created_at | TIMESTAMP | When request was created |
| updated_at | TIMESTAMP | Last status change |

### payments
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| type | ENUM('package', 'subscription') | Payment type |
| plan_name | VARCHAR(50) | Plan identifier |
| amount | DECIMAL(10,2) | Amount in JOD |
| currency | VARCHAR(3) | Default: 'JOD' |
| gateway | VARCHAR(50) | Payment gateway used |
| gateway_transaction_id | VARCHAR(255) | External transaction reference |
| status | ENUM('pending', 'completed', 'failed', 'refunded') | Payment status |
| created_at | TIMESTAMP | Payment initiation date |

### subscriptions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| payment_id | UUID | Foreign key → payments |
| plan_type | ENUM('monthly') | Subscription plan |
| starts_at | TIMESTAMP | Subscription start |
| expires_at | TIMESTAMP | Subscription end |
| is_active | BOOLEAN | Currently active |
| auto_renew | BOOLEAN | Auto-renewal enabled |

### notifications
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key → users |
| type | VARCHAR(50) | Notification type (suggestion, like, match, visit, identity, payment) |
| title | VARCHAR(200) | Notification title |
| body | TEXT | Notification content |
| is_read | BOOLEAN | Read status |
| created_at | TIMESTAMP | When notification was created |

---

# 6. User Interface (UI/UX)

## 6.1 Pages

| Page | Description | Accessible By |
|------|-------------|---------------|
| Landing Page | Platform introduction + register/login CTAs | Everyone |
| Registration | Multi-step: account → ID upload → waiting for verification | Visitors |
| Profile Setup | Multi-step form: personal info → quiz → parent info → photos | Verified users |
| Profile Edit | Modify personal data and photos | Verified users |
| Personality Quiz | Interactive quiz interface (15–25 questions) | Verified users |
| Suggestions (Female) | Card-based UI showing suggestions, swipe/tap to accept/reject | Female users |
| Notifications (Male) | List of interest notifications from female users | Male users |
| My Matches | Mutual matches with revealed photos and visit status | Verified users |
| Payment | Plan selection, checkout, payment history | Verified users |
| Dashboard | Personal stats and activity overview | Verified users |
| Admin: Users | User management table with filters and actions | Admin |
| Admin: Identity Review | Queue of pending ID verifications | Admin |
| Admin: Suggestions | Manual suggestion tool with profile browsing | Admin |
| Admin: Visits | Visit request management with status pipeline | Admin |
| Admin: Analytics | Charts and KPIs dashboard | Admin |

## 6.2 Design Principles

- **Authentic Arabic design** — calm, respectful color palette reflecting trust and tradition
- **Clear Arabic typography** — readable fonts optimized for Arabic RTL layout
- **Simple UX** — accessible to all ages, minimal learning curve
- **Mobile-first** — designed for mobile screens with full desktop support
- **No gamification** — this is not a dating app; the design should convey seriousness and respect
- **Privacy-centered UI** — clear visual indicators of what information is visible at each stage

---

# 7. API Endpoints

## 7.1 Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/auth/register | Create new account | Public |
| POST | /api/auth/login | Login | Public |
| POST | /api/auth/forgot-password | Request password reset OTP | Public |
| POST | /api/auth/reset-password | Reset password with OTP | Public |
| POST | /api/auth/logout | Logout (invalidate token) | User |

## 7.2 Identity Verification

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/identity/upload | Upload ID front + back images | User |
| GET | /api/identity/status | Check verification status | User |

## 7.3 Profile

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/profile | Get current user's profile | User |
| PUT | /api/profile | Update personal data | User |
| POST | /api/profile/photos | Upload personal photo | User |
| DELETE | /api/profile/photos/:id | Delete a photo | User |
| POST | /api/profile/personality-quiz | Submit quiz answers | User |
| GET | /api/profile/personality-quiz | Get quiz results | User |
| PUT | /api/profile/parent-info | Update parent/guardian info | User |

## 7.4 Suggestions & Matching

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/suggestions | Get available suggestions (female) | Female |
| POST | /api/suggestions/:id/like | Accept a suggestion | User |
| POST | /api/suggestions/:id/reject | Reject a suggestion | User |
| GET | /api/matches | Get mutual matches | User |
| GET | /api/matches/:id/photos | Get photos (only after mutual like) | User |
| GET | /api/matches/:id/visit-status | Get visit request status | User |

## 7.5 Payments

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/plans | Get available pricing plans | User |
| POST | /api/payments/checkout | Initiate payment | User |
| GET | /api/payments/history | Get payment history | User |
| POST | /api/payments/webhook | Payment gateway callback | Public (signed) |

## 7.6 Notifications

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/notifications | Get user notifications | User |
| PUT | /api/notifications/:id/read | Mark as read | User |
| PUT | /api/notifications/read-all | Mark all as read | User |

## 7.7 Admin

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/admin/users | List all users (with filters) | Admin |
| GET | /api/admin/users/:id | Get user detail | Admin |
| PUT | /api/admin/users/:id/suspend | Suspend/unsuspend user | Admin |
| GET | /api/admin/identity/pending | Get pending verifications | Admin |
| PUT | /api/admin/identity/:id/verify | Approve/reject identity | Admin |
| POST | /api/admin/suggestions | Send manual suggestion | Admin |
| GET | /api/admin/visits | List all visit requests | Admin |
| PUT | /api/admin/visits/:id | Update visit status/notes | Admin |
| GET | /api/admin/stats | Get analytics data | Admin |

---

# 8. Constraints & Assumptions

## 8.1 Constraints

| Constraint | Details |
|------------|---------|
| Language | Arabic only — no multilingual support in v1 |
| No Messaging | Absolutely no chat, messaging, or direct communication system |
| Female-only Suggestions | Only female users receive suggestions; males can only respond to interest notifications |
| Manual Visits | Family visits are coordinated manually by admin only — no automated scheduling |
| Mandatory ID | Identity verification is required before any platform usage |
| Photo Visibility | Personal photos are hidden until mutual like is confirmed |
| Free Limit | 5 suggestions per account (lifetime free tier) |
| Jordan Only | Platform targets Jordanian users only in v1 |

## 8.2 Assumptions

- All users are 18 years of age or older
- Users have a valid Jordanian phone number or email address
- Users agree to Terms of Service and Privacy Policy
- A functional electronic payment gateway is available in Jordan
- Users have access to a device with a camera for ID upload
- Admin team is available during business hours for visit coordination

---

# 9. Future Enhancements

| Phase | Feature | Description |
|-------|---------|-------------|
| 2 | Mobile App | iOS + Android app using React Native |
| 2 | SMS Notifications | Send critical notifications via SMS |
| 2 | Post-Visit Feedback | Rating and feedback system after family visits |
| 3 | Multi-Country | Expand to other Arab countries (UAE, Saudi, Egypt, etc.) |
| 3 | Advanced AI | ML model trained on successful visit outcomes for better matching |
| 3 | Family Recommendations | Allow family members to recommend profiles |
| 3 | Advanced Analytics | Data analytics dashboard with trend analysis and AI insights |
| 3 | Video Profile | Optional short video introduction (visible after mutual like) |