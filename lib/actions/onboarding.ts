"use server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./_shared";

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_HINT_IDS = ["add-client", "edit-client", "log-outreach", "command-palette"] as const;

const VALID_STEP_IDS_ASSOCIATE = [
  "welcome", "dashboard", "sidebar", "client-list",
  "client-detail", "follow-ups", "command-palette", "smart-lists",
] as const;

const VALID_STEP_IDS_MANAGER = [
  ...VALID_STEP_IDS_ASSOCIATE,
  "approvals", "employee-management", "backup", "analytics",
] as const;

const ASSOCIATE_MAX_STEP = 8;
const MANAGER_MAX_STEP = 12;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OnboardingState {
  tourCompleted: boolean;
  currentStep: number;
  completedSteps: string[];
  hintsDismissed: string[];
  tourSkipped: boolean;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const hintIdSchema = z.enum(VALID_HINT_IDS);

const updateSchema = z.object({
  tourCompleted: z.boolean().optional(),
  currentStep: z.number().int().min(1).optional(),
  completedSteps: z.array(z.string()).optional(),
  hintsDismissed: z.array(hintIdSchema).optional(),
  tourSkipped: z.boolean().optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function getValidStepIds(role: string): readonly string[] {
  return role === "manager" ? VALID_STEP_IDS_MANAGER : VALID_STEP_IDS_ASSOCIATE;
}

function getMaxStep(role: string): number {
  return role === "manager" ? MANAGER_MAX_STEP : ASSOCIATE_MAX_STEP;
}

function parseState(raw: string | null): OnboardingState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return null;
  }
}

function defaultState(): OnboardingState {
  return {
    tourCompleted: false,
    currentStep: 0,
    completedSteps: [],
    hintsDismissed: [],
    tourSkipped: false,
  };
}

function validateCurrentStep(step: number, role: string): void {
  const max = getMaxStep(role);
  if (step < 1 || step > max) {
    throw new Error(`currentStep must be between 1 and ${max} for role ${role}`);
  }
}

function validateCompletedSteps(steps: string[], role: string): void {
  const validIds = getValidStepIds(role);
  for (const step of steps) {
    if (!validIds.includes(step)) {
      throw new Error(`Invalid completedStep "${step}" for role ${role}`);
    }
  }
}

function mergeHints(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing);
  for (const h of incoming) {
    if (!set.has(h)) set.add(h);
  }
  return [...set];
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function getOnboardingState(): Promise<OnboardingState | null> {
  const user = await requireAuth();
  const row = db.select({ onboarding_state: employees.onboardingState })
    .from(employees)
    .where(eq(employees.id, user.id))
    .get();

  return parseState(row?.onboarding_state ?? null);
}

export async function updateOnboardingState(
  updates: z.infer<typeof updateSchema>,
): Promise<OnboardingState> {
  const user = await requireAuth();
  const parsed = updateSchema.parse(updates);

  // Role-based validation
  if (parsed.currentStep !== undefined) {
    validateCurrentStep(parsed.currentStep, user.role);
  }
  if (parsed.completedSteps) {
    validateCompletedSteps(parsed.completedSteps, user.role);
  }

  // Read current state
  const row = db.select({ onboarding_state: employees.onboardingState })
    .from(employees)
    .where(eq(employees.id, user.id))
    .get();

  const current = parseState(row?.onboarding_state ?? null) ?? defaultState();

  // Merge updates
  const next: OnboardingState = {
    tourCompleted: parsed.tourCompleted ?? current.tourCompleted,
    currentStep: parsed.currentStep ?? current.currentStep,
    completedSteps: parsed.completedSteps ?? current.completedSteps,
    hintsDismissed: parsed.hintsDismissed
      ? mergeHints(current.hintsDismissed, parsed.hintsDismissed)
      : current.hintsDismissed,
    tourSkipped: parsed.tourSkipped ?? current.tourSkipped,
  };

  // Persist
  db.update(employees)
    .set({ onboardingState: JSON.stringify(next) })
    .where(eq(employees.id, user.id))
    .run();

  return next;
}
