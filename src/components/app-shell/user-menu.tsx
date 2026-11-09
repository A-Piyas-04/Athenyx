"use client";

import Image from "next/image";
import Link from "next/link";
import { FolderGit2, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  name: string | null;
  email: string | null;
  image: string | null;
  onSignOut: () => Promise<void>;
};

export function UserMenu({ name, email, image, onSignOut }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          {image ? (
            <Image src={image} alt="" width={26} height={26} className="size-[26px] rounded-[4px]" />
          ) : (
            <UserIcon className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="py-2 font-normal">
          <div className="truncate text-sm font-semibold text-foreground">{name ?? "Signed in"}</div>
          {email ? <div className="truncate text-xs text-muted-foreground">{email}</div> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/projects">
            <FolderGit2 className="size-4" />
            All projects
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <form action={onSignOut} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
