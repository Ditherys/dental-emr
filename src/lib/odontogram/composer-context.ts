import type { ImplantComponentKind } from "./implant";

/**
 * The authorized server projection the clinical chart workspace hands down to
 * the shared record composer.
 *
 * Every list below is the set `public.get_clinical_composer_context` decided is
 * eligible, inside the tenant it derived itself. Nothing in this shape may be
 * assembled in the browser, and the browser can only narrow a list, never widen
 * one: a procedure, case, finding, charge or implant abutment the server did not
 * project simply is not offered.
 *
 * It is declared here rather than inferred from the service so a client
 * component can name it without importing a `server-only` module.
 */
export type ClinicalComposerContext = {
  patientId: string;
  patientIdentifier: string;
  procedures: readonly { procedureId: string; name: string }[];
  activeFindings: readonly {
    entryId: string;
    toothCode: string;
    findingCode: string;
    label: string;
  }[];
  planItems: readonly {
    planItemId: string;
    procedureCaseId: string;
    caseVersion: number;
    procedureId: string;
    toothCode: string;
    label: string;
  }[];
  openCases: readonly {
    procedureCaseId: string;
    caseVersion: number;
    procedureId: string;
    label: string;
  }[];
  paymentMethods: readonly { paymentMethodId: string; name: string }[];
  chargeChoices: readonly { chargeId: string; label: string }[];
  supportComponents: readonly {
    componentId: string;
    toothFdi: string;
    componentKind: ImplantComponentKind;
    label: string;
  }[];
  implantStageByTooth: Readonly<Record<string, ImplantComponentKind>>;
};
