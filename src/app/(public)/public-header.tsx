import Link from "next/link";

type PublicHeaderProps = {
  organizationName: string | null;
};

export function PublicHeader({ organizationName }: PublicHeaderProps) {
  const brand = organizationName ?? "Dental Clinic";

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label={`${brand} home`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-navy-900 text-sm font-semibold text-white" aria-hidden="true">
            D
          </span>
          <span className="truncate text-sm font-semibold text-brand-navy-950">{brand}</span>
        </Link>
        <nav aria-label="Page sections" className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <a href="#about" className="transition-colors hover:text-foreground">About</a>
          <a href="#services" className="transition-colors hover:text-foreground">Services</a>
          <a href="#providers" className="transition-colors hover:text-foreground">Our dentists</a>
          <a href="#contact" className="transition-colors hover:text-foreground">Contact</a>
        </nav>
      </div>
    </header>
  );
}