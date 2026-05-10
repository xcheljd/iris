"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Globe, Lock, MoreHorizontal, Pencil, Copy, Trash2 } from "lucide-react";

interface SmartListItemProps {
  id: string;
  name: string;
  icon: React.ReactNode;
  count: number;
  isBuiltIn: boolean;
  isShared: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
}

export function SmartListItem({
  id: _id,
  name,
  icon,
  count,
  isBuiltIn,
  isShared,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: SmartListItemProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(name);

  const handleRename = () => {
    if (newName.trim() && newName !== name) onRename(newName.trim());
    setRenameOpen(false);
  };

  return (
    <>
      <div
        className={`group w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
        }`}
      >
        <button className="flex items-center gap-2 min-w-0 flex-1" onClick={onSelect}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-2 min-w-0">
                {isBuiltIn ? icon : isShared
                  ? <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                <span className="text-sm truncate">{name}</span>
              </span>
            </TooltipTrigger>
            {name.length > 20 && (
              <TooltipContent side="right"><p>{name}</p></TooltipContent>
            )}
          </Tooltip>
        </button>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-xs shrink-0">{count}</Badge>
          {!isBuiltIn && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="List actions"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setNewName(name); setRenameOpen(true); }}>
                  <Pencil className="h-4 w-4 mr-2" />Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename List</DialogTitle>
            <DialogDescription>Enter a new name for this list.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRename()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
