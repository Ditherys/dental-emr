"use client";

import Link from "next/link";
import { ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2" aria-label="Open account menu">
          <span className="grid size-7 place-items-center rounded-md bg-brand-navy-100 text-brand-navy-950">
            <UserRound className="size-4" aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">Account</span>
          <ChevronDown className="hidden size-4 sm:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-foreground">
            Authenticated user
          </span>
          <span className="mt-0.5 block font-normal text-muted-foreground">
            Identity connects in a later checkpoint
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <ShieldCheck aria-hidden="true" />
            Account & security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <LogOut aria-hidden="true" />
          Sign out unavailable
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
