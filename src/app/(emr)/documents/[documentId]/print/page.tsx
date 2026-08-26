import type { Metadata } from "next";
import Link from "next/link";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { Button } from "@/components/ui/button";

import { resolvePrintDocument } from "./print-document";

export const metadata: Metadata = { title: "Document print" };

export default async function DocumentPrintPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const documentId = (await params).documentId;
  const result = await resolvePrintDocument(documentId);

  if (result.status === "denied") {
    return <PermissionDenied description="This document is unavailable." />;
  }
  if (result.status === "failed") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageError description="This document could not be opened. Return to the documents list and try again." />
        <div className="mt-4">
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/documents">Back to documents</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl print:max-w-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          A4 print preview — use the browser print dialog (Ctrl+P / Cmd+P) for A4 output.
        </p>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/documents">Back to documents</Link>
        </Button>
      </div>
      {/* Renderer output is server-authored safe HTML: all snapshot text is
          escaped and only allowlisted structural markup is emitted. */}
      <div dangerouslySetInnerHTML={{ __html: result.html }} />
    </div>
  );
}