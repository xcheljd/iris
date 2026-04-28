# Plan 001: Employee Management

## Summary

Add full employee management (CRUD) for managers — create accounts, edit details, reset passwords, change roles, activate/deactivate — plus a self-service "change password" page for all logged-in users.

## Current State

- Settings page (`app/(app)/settings/`) has an **Employees tab** that is **read-only** — just a table listing name, username, role, status.
- Employees are only created via `lib/db/seed.ts` (hardcoded, wipes DB).
- `employees` schema has: `id`, `name`, `username`, `passwordHash`, `role`, `active`, `createdAt`.
- Auth uses NextAuth CredentialsProvider with bcrypt (`lib/auth.ts`).
- All server actions are in `lib/actions.ts` — session-checked via `getServerSession(authOptions)`.
- No role-based authorization on server actions currently (any logged-in user can call any action).
- UI uses shadcn components (Dialog, Table, Badge, Button, Input, Label, Select).

## Success Criteria

1. Manager can create a new employee account (name, username, temporary password, role).
2. Manager can reset an employee's password (sets a new temp password).
3. Manager can change an employee's role (associate ↔ manager).
4. Manager can deactivate/activate an employee account.
5. Manager cannot deactivate their own account.
6. Any logged-in user can change their own password (requires current password confirmation).
7. Only managers can access employee management actions — associates see the read-only list.
8. All actions are session-authenticated and role-authorized server-side.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Associate escalates to manager by calling server actions directly | Add role checks on all employee mutation server actions |
| Manager deactivates self, locks everyone out | Prevent self-deactivation in UI and server action |
| Username collision on create | Check uniqueness before insert, return clear error |
| Password too weak | Enforce minimum length (6 chars) on create and reset |
| Deactivated user still has valid JWT session | Acceptable for MVP — JWTs expire after 30 days per current config, and middleware checks session on every request |

## Affected Files

| File | Change |
|---|---|
| `lib/actions.ts` | Add: `createEmployee`, `resetEmployeePassword`, `updateEmployeeRole`, `toggleEmployeeActive`, `changeOwnPassword` |
| `app/(app)/settings/settings-content.tsx` | Add employee CRUD UI to the Employees tab (dialogs for create, reset password, role change, toggle active) |
| `app/(app)/settings/page.tsx` | Pass session user to `SettingsContent` for role gating |
| `components/app-sidebar.tsx` | Add "Change Password" link to sidebar user menu |
| `app/(app)/change-password/page.tsx` | New page — self-service password change form |

No schema changes needed — `employees` table already has all required columns.

## Implementation Checklist

### Step 1: Server actions (`lib/actions.ts`)

Add these 5 server actions. Each must call `getSessionUser()` and verify role where required.

- [ ] `createEmployee({ name, username, password, role })` — manager-only. Validates username uniqueness, hashes password with bcrypt, inserts into DB.
- [ ] `resetEmployeePassword(employeeId, newPassword)` — manager-only. Hashes new password, updates `passwordHash`.
- [ ] `updateEmployeeRole(employeeId, newRole)` — manager-only. Updates `role`.
- [ ] `toggleEmployeeActive(employeeId, active)` — manager-only. Prevents self-deactivation.
- [ ] `changeOwnPassword(currentPassword, newPassword)` — any user. Verifies current password via bcrypt.compare before updating.

### Step 2: Settings page role gating (`app/(app)/settings/page.tsx`)

- [ ] Fetch session via `getServerSession(authOptions)`.
- [ ] Pass `session.user` (specifically `role`) to `SettingsContent`.

### Step 3: Employee management UI (`settings-content.tsx`)

Enhance the Employees tab with manager-only controls:

- [ ] **Add Employee** button + dialog (name, username, temp password, role select).
- [ ] **Actions column** on each row (visible to managers only):
  - Reset Password button → dialog with new temp password field
  - Change Role dropdown (associate ↔ manager)
  - Activate/Deactivate toggle
- [ ] Disable manager actions when session user is not a manager.
- [ ] Prevent self-deactivation in UI.

### Step 4: Self-service change password page

- [ ] New file: `app/(app)/change-password/page.tsx`
- [ ] Form with current password, new password, confirm password fields.
- [ ] Calls `changeOwnPassword` server action.
- [ ] Success → toast, redirect or clear form.

### Step 5: Sidebar link

- [ ] Add "Change Password" to the sidebar user menu in `components/app-sidebar.tsx`.

### Step 6: Validate

- [ ] `lsp_diagnostics` clean on all changed files.
- [ ] Manual smoke test: create employee, reset password, change role, deactivate, change own password.

## Test Strategy

Manual validation:
1. As manager: create employee → login as new employee → change own password.
2. As manager: reset associate password → login with new password.
3. As manager: change associate to manager → verify role badge updates.
4. As manager: deactivate associate → verify they can't log in.
5. As manager: verify self-deactivation is blocked.
6. As associate: verify no create/edit/reset buttons visible.
7. As associate: use change-password page → verify old password no longer works, new one does.

## Validation and Diagnostics

- All server actions use `getServerSession(authOptions)` — if session is null, action should return/throw early.
- Role checks are explicit: `if (user?.role !== "manager") return` / throw.
- bcrypt failures (wrong current password on self-change) return clear error messages.
- Username uniqueness violation returns user-friendly toast.

## Open Questions

- None — requirements are clear from interview.

## Rejected Alternatives

- **Email-based password reset links**: Would require email infrastructure (SMTP provider, email templates). Out of scope for MVP. Manager-set temp passwords cover the need.
- **Separate admin page/panel**: The Settings > Employees tab already exists. Adding CRUD controls there follows existing patterns and keeps the UI consolidated.
