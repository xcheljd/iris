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
  onOpenChangeAction: (open: boolean) => void;
  children?: never;
};

type UncontrolledProps = {
  children: ReactNode;
  open?: never;
  onOpenChangeAction?: never;
};

type ConfirmDialogProps = (ControlledProps | UncontrolledProps) & {
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  onConfirmAction: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, description, confirmLabel, onConfirmAction, variant = "default", disabled } = props;
  const isUncontrolled = "children" in props && props.children !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isUncontrolled ? internalOpen : props.open;
  const setOpen = isUncontrolled ? setInternalOpen : props.onOpenChangeAction;

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
              onConfirmAction();
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
