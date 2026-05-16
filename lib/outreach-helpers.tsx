import { Phone, MessageCircle, Mail, User } from "lucide-react";

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

export function getMethodBadgeVariant(method: string) {
  switch (method) {
    case "call": return "bg-green-500/10 text-green-500 border-green-500/20";
    case "text": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "email": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    case "in-person": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    default: return "bg-muted text-muted-foreground border-muted";
  }
}

export function isFollowUpOverdue(followUpDate: Date | string | null) {
  if (!followUpDate) return false;
  return new Date(followUpDate) < new Date();
}

export function isFollowUpUpcoming(followUpDate: Date | string | null) {
  if (!followUpDate) return false;
  const today = new Date();
  const followUp = new Date(followUpDate);
  const daysDiff = Math.ceil((followUp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return daysDiff >= 0 && daysDiff <= 7;
}

export function getOutcomeColor(outcome: string) {
  switch (outcome) {
    case "purchased": return "text-emerald-500";
    case "wants_to_come_in": return "text-green-500";
    case "responded": return "text-green-500";
    case "not_interested": return "text-red-500";
    case "no_answer": return "text-muted-foreground";
    case "voicemail": return "text-yellow-500";
    case "voicemail_full": return "text-red-500";
    default: return "text-muted-foreground";
  }
}
