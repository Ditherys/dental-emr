type PageHeaderProps = {
  title: string;
  description?: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header>
      <h1 className="text-xl font-semibold tracking-[-0.015em] text-foreground sm:text-2xl">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 max-w-[72ch] text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}
