import { Phone, MessageCircle, Mail, User } from "lucide-react";
import { startOfDay } from "date-fns";
import type { OutreachOutcome } from "@/lib/db/schema";

export function getMethodIcon(method: string, size = "h-4 w-4") {
  const props = { className: size };
  switch (method) {
    case "call": return <Phone {...props} />;
    case "text": return <MessageCircle {...props} />;
    case "email": return <Mail {...props} />;
    case "in-person": return <User {...props} />;
    default: return <MessageCircle {...props} />;
  }
}

// Follow-up dates are stored at local midnight, so "today" must not count as overdue.
export function isFollowUpOverdue(followUpDate: Date | string | null) {
  if (!followUpDate) return false;
  return new Date(followUpDate) < startOfDay(new Date());
}

export function isFollowUpUpcoming(followUpDate: Date | string | null) {
  if (!followUpDate) return false;
  const today = new Date();
  const followUp = new Date(followUpDate);
  const daysDiff = Math.ceil((followUp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return daysDiff >= 0 && daysDiff <= 7;
}

// One name per outcome, used everywhere an outcome is shown (logger, history,
// follow-ups, analytics, dashboard) so the same outcome never reads two ways.
export const OUTCOME_LABELS: Record<OutreachOutcome, string> = {
  no_answer: "No answer",
  voicemail: "Left voicemail",
  voicemail_full: "Voicemail full",
  responded: "Responded",
  not_interested: "Not interested",
  wants_to_come_in: "Wants to come in",
  purchased: "Purchased",
};

export function outcomeLabel(outcome: string) {
  return OUTCOME_LABELS[outcome as OutreachOutcome] ?? outcome.replace(/_/g, " ");
}

export function getOutcomeColor(outcome: string) {
  switch (outcome) {
    case "purchased":
    case "wants_to_come_in":
    case "responded": return "text-success";
    case "not_interested":
    case "voicemail_full": return "text-destructive";
    case "voicemail": return "text-warning";
    default: return "text-muted-foreground";
  }
}
