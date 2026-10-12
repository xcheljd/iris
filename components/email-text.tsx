/**
 * An email address that wraps cleanly in a narrow column: the preferred break
 * is right after the "@" (so "name@" / "example.com"), with a per-character
 * fallback only if one half is still too long. Never truncates.
 */
export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  if (at <= 0) return <span className="[overflow-wrap:anywhere]">{email}</span>;
  return (
    <span className="[overflow-wrap:anywhere]">
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </span>
  );
}
