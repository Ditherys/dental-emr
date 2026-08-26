import Link from "next/link";

type PublicFooterProps = {
  organizationName: string | null;
  messengerLink: string | null;
};

export function PublicFooter({ organizationName, messengerLink }: PublicFooterProps) {
  const brand = organizationName ?? "Dental Clinic";

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} {brand}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {messengerLink && (
            <a href={messengerLink} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-navy-800 underline-offset-4 hover:underline">
              Message us on Messenger
            </a>
          )}
          <Link href="/privacy" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Privacy notice
          </Link>
        </div>
      </div>
    </footer>
  );
}