# Iris — Feature Proposals
## Inspired by Industry CRM Research (BSPK, Endear, Tulip, Proximity Insight, Salesforce Retail Cloud)

**Date:** April 23, 2026  
**Status:** Proposals — pending Marcus's approval

---

After researching the top retail clienteling platforms (BSPK, Endear, Tulip, Proximity Insight, Salesforce Retail Cloud, HubSpot Retail, Lightspeed), here are features worth adding to Iris that go beyond the base PRD. Grouped by priority.

---

## 🔥 Tier 1 — High Impact, Feasible for V1

### 1. Smart Lists / Saved Filters
**Seen in:** Endear, Tulip, HubSpot

Instead of rebuilding the same filter every time, save filter combinations as named lists.

- "Crimson Ace Interested — Not Contacted"
- "VIP — Purchased Last 90 Days"
- "Promo Match — No Outreach Yet"

Associates click a saved list and instantly get the right clients. This replaces the mental "who do I call today?" burden.

**Why it matters:** Your Excel has no filter memory. Associates waste time re-filtering. Smart lists make the outreach workflow 10x faster.

---

### 2. Follow-Up Reminders
**Seen in:** Tulip (follow-up management), Endear, BSPK

When logging outreach, set a follow-up date. The system surfaces a "Today's Follow-Ups" view.

- Log a call → "Follow up in 3 days"
- Client says "call me next week" → set reminder
- Dashboard shows overdue + today's follow-ups

**Why it matters:** Your Excel relies on associates remembering to check notes. Things fall through the cracks. This is probably the #1 feature that would improve your outreach rate.

---

### 3. Customer Tags / Labels
**Seen in:** Tulip, Endear, HubSpot

Freeform tags on clients for flexible segmentation beyond dropdowns.

- `#VIP` `#high-spender` `#birthday-this-month` `#military` `#repeat-buyer` `#talker` (you know who they are)
- Tags are searchable and filterable
- Color-coded badges on client cards

**Why it matters:** Your "Notes" column currently holds all this info in unstructured text. Tags make it actionable and filterable.

---

### 4. Duplicate Detection & Merge Tool
**Seen in:** All enterprise CRMs, Endear

Automated scanning for potential duplicates + guided merge workflow.

- Flag similar names + phone/email matches
- Side-by-side merge view: pick which fields to keep
- Merge history log (auditable)

**Why it matters:** Your README literally has a section called "Merge Duplicates" as a manual weekly task. This automates it.

---

### 5. Outreach Performance Dashboard (Per Employee)
**Seen in:** Endear (Analytics), Tulip, BSPK

Track outreach metrics by associate:

- Outreaches this week/month
- Response rate
- Conversion rate (outreach → purchase)
- Average time to first contact
- Stale leads (90+ days no contact)

**Why it matters:** You're doing bi-weekly 1:1s. This gives you real numbers instead of vibes.

---

### 6. Quick-Add from Anywhere (Global Command Palette)
**Seen in:** shadcn `Command` component, Notion, Linear

Press `Ctrl+K` (or tap 🔍 on mobile) → search clients, add client, log outreach — all from one keyboard-driven interface.

**Why it matters:** Associates on the floor need speed. Two taps to log a call, not five screen navigations.

---

## ⚡ Tier 2 — Valuable, Could Be V1.5

### 7. Birthday & Anniversary Tracking
**Seen in:** Tulip, BSPK, Proximity Insight

Capture birthday, wedding anniversary, or other dates. Auto-surface "Upcoming Birthdays This Month" as an outreach opportunity.

- Birthday field on client profile
- Monthly birthday list view
- Optional auto-reminder 2 weeks before

**Why it matters:** Your data already has at least one birthday in notes ("Birthday 7/27/62"). Structured date fields + reminders = easy personal touch.

---

### 8. Client Scoring / Heat Level
**Seen in:** Tulip (Customer Prism), Endear, BSPK (AI-powered insights)

Simple engagement scoring based on activity:

| Signal | Points |
|--------|--------|
| Purchased | +3 |
| Responded to outreach | +2 |
| Logged outreach (any response) | +1 |
| On email list | +1 |
| No contact 90+ days | -2 |
| Unsubscribed | -3 |

Display as 🔥 Hot / 🟡 Warm / ❄️ Cold on client list.

**Why it matters:** Instantly prioritizes who to call. "Call all 🔥 clients about this promo" is a real workflow.

---

### 9. Outreach Templates
**Seen in:** Endear (Campaigns), BSPK, Tulip

Pre-written message templates for common outreach scenarios:

- "New promo on [COLLECTION]" → auto-fills client name + collection
- "Your watch has arrived"
- "Happy Birthday! Here's a special offer"
- "We haven't seen you in a while"

Copy to clipboard, ready to paste into text/email.

**Why it matters:** Saves associates from typing the same message 30 times on promo blast day (Wednesday EOD).

---

### 10. Stale Lead Alerts
**Seen in:** Endear, Tulip, BSPK

Automated detection of clients not contacted in X days.

- Configurable threshold (default: 90 days)
- "Stale Leads" view in sidebar
- Option to batch-assign stale leads to associates for re-engagement
- Dashboard widget showing stale count trend

**Why it matters:** Your README mentions this as a "monthly or quarterly review" task. Make it automatic.

---

### 11. Activity Feed / Timeline on Client Profile
**Seen in:** Endear, HubSpot, Salesforce

Chronological feed of everything that happened with a client:

```
Apr 23 — Marcus logged call (no answer)
Apr 20 — Purchased HX1005-01X
Apr 18 — Jordan sent promo email
Apr 10 — Added to email list
Mar 30 — Client created (walk-in)
```

**Why it matters:** Your "Notes" column is one big text blob. A timeline gives instant context without scrolling through walls of text.

---

### 12. Collection Interest Analytics
**Seen in:** Endear (Insights), Tulip, BSPK

Which collections and models are most in-demand across your client base.

- "Most Requested Collections" chart
- "Top Model Numbers" table
- Cross-reference with current promos: "33 clients want CRIMSON ACE and it's on promo"

**Why it matters:** Data to support ordering decisions and promo prioritization. Right now this is invisible in your spreadsheet.

---

## 🚀 Tier 3 — Future / V2

### 13. SMS Integration (Twilio)
**Seen in:** Endear, Tulip, BSPK, Proximity Insight

Send texts directly from the CRM. Track delivery, responses. Auto-log to outreach history.

**Why wait:** Adds cost (Twilio per-message fees), needs phone number provisioning. Start with copy-to-clipboard.

---

### 14. Appointment Booking
**Seen in:** Tulip, Endear, Proximity Insight

In-store appointment scheduling with calendar view. Associates set availability, clients book (or associates book on their behalf).

**Why wait:** Complex UX. Not core to your current workflow which is outreach-driven, not appointment-driven.

---

### 15. Email Campaign Builder
**Seen in:** Endear (Campaigns), HubSpot

Build and send email campaigns to segmented lists. Track opens, clicks, unsubscribes.

**Why wait:** Wednesday promo blasts could use this, but email delivery is a whole compliance rabbit hole (CAN-SPAM, unsubscribe management). Start with templates + copy-to-clipboard.

---

### 16. AI-Powered Outreach Suggestions
**Seen in:** BSPK, Endear (AI Notetaker), Tulip AI

AI suggests:
- Which clients to contact today
- What to say based on their interests + current promos
- Predict purchase likelihood

**Why wait:** Cool but not necessary at 3K clients. The manual workflows need to be solid first.

---

### 17. Shoppable Lookbooks (Endear Stories-style)
**Seen in:** Endear

Create curated product lookbooks with watch images + details that associates can share with clients via link.

**Why wait:** Needs product image management. Future feature when Meridian provides digital assets.

---

## 📊 Feature Priority Matrix

| Feature | Impact | Effort | Recommended Tier |
|---------|--------|--------|-----------------|
| Smart Lists | 🔥 High | Low | V1 |
| Follow-Up Reminders | 🔥 High | Medium | V1 |
| Customer Tags | 🔥 High | Low | V1 |
| Duplicate Detection | 🔥 High | Medium | V1 |
| Employee Analytics | 🔥 High | Medium | V1 |
| Command Palette | ⚡ Med | Low | V1 |
| Birthday Tracking | ⚡ Med | Low | V1.5 |
| Client Scoring | ⚡ Med | Medium | V1.5 |
| Outreach Templates | ⚡ Med | Low | V1.5 |
| Stale Lead Alerts | ⚡ Med | Low | V1.5 |
| Activity Timeline | ⚡ Med | Medium | V1.5 |
| Collection Analytics | ⚡ Med | Medium | V1.5 |
| SMS Integration | 🚀 High | High | V2 |
| Appointment Booking | 🚀 Med | High | V2 |
| Email Campaigns | 🚀 High | High | V2 |
| AI Suggestions | 🚀 Med | High | V2 |

---

## Key Industry Stats That Validate These Features

- **50-70%** increase in order frequency with clienteling tools (BSPK)
- **18-30%** growth in average order value (Endear)
- **62%** more orders after implementing clienteling (Tulip)
- **3x** higher prospect conversion rates (industry average)
- Engaged customers spend **2x** as much as non-engaged (industry average)
- **82%** of retailers see increased repeat business through personalized rewards

---

*Marcus — review these and tell me which ones excite you. I'll update the PRD with the ones you want to include.*
