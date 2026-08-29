"use client";

import Link from "next/link";
import { ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";

import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type UserMenuPresentation = "topbar" | "sidebar" | "rail";

export function UserMenu({
  presentation = "topbar",
}: {
  presentation?: UserMenuPresentation;
}) {
  const rail = presentation === "rail";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "gap-2",
            presentation === "sidebar" && "w-full justify-start",
            rail && "size-9 justify-center px-0",
          )}
          aria-label="Open account menu"
          title={rail ? "Account" : undefined}
        >
          <span className="grid size-7 place-items-center rounded-md bg-brand-navy-100 text-brand-navy-950">
            <UserRound className="size-4" aria-hidden="true" />
          </span>
          {!rail && (
            <>
              <span
                className={cn(presentation === "topbar" && "hidden sm:inline")}
              >
                Account
              </span>
              <ChevronDown
                className={cn(
                  "size-4",
                  presentation === "topbar" && "hidden sm:block",
                )}
                aria-hidden="true"
              />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={presentation === "topbar" ? "end" : "start"}
        side={rail ? "right" : "bottom"}
        className="min-w-56"
      >
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-foreground">
            Authenticated user
          </span>
          <span className="mt-0.5 block font-normal text-muted-foreground">
            Session verified by Supabase Auth
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
        <DropdownMenuItem asChild>
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
