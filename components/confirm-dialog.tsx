"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ControlledProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: never;
};

type UncontrolledProps = {
  children: ReactNode;
  open?: never;
  onOpenChange?: never;
};

type ConfirmDialogProps = (ControlledProps | UncontrolledProps) & {
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, description, confirmLabel, onConfirm, variant = "default", disabled } = props;
  const isUncontrolled = "children" in props && props.children !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isUncontrolled ? internalOpen : props.open;
  const setOpen = isUncontrolled ? setInternalOpen : props.onOpenChange;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {isUncontrolled && (
        <AlertDialogTrigger asChild>
          {props.children}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              if (isUncontrolled) setInternalOpen(false);
            }}
            disabled={disabled}
            className={
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
