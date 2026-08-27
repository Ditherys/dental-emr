export type IntakeQuestion = {
  key: string;
  label: string;
  type: "text" | "textarea" | "yesno";
};

export const MEDICAL_HISTORY_QUESTIONS: IntakeQuestion[] = [
  { key: "hasMedications", label: "Are you currently taking any medications?", type: "yesno" },
  { key: "medicationDetails", label: "Please list your current medications.", type: "textarea" },
  { key: "hasAllergies", label: "Do you have any allergies?", type: "yesno" },
  { key: "allergyDetails", label: "Please describe your allergies.", type: "textarea" },
  { key: "hasMedicalConditions", label: "Do you have any medical conditions?", type: "yesno" },
  { key: "medicalConditionDetails", label: "Please describe your medical conditions.", type: "textarea" },
  { key: "bloodThinning", label: "Do you take blood-thinning medication?", type: "yesno" },
  { key: "pregnantNursing", label: "Are you pregnant or nursing?", type: "yesno" },
  { key: "previousSurgeries", label: "Have you had any surgeries?", type: "yesno" },
  { key: "physicianContact", label: "Treating physician (optional)", type: "text" },
];

export const DENTAL_HISTORY_QUESTIONS: IntakeQuestion[] = [
  { key: "visitReason", label: "What is the main reason for your visit?", type: "textarea" },
  { key: "lastDentalVisit", label: "When was your last dental visit?", type: "text" },
  { key: "dentalAnxiety", label: "Do you feel anxious about dental treatment?", type: "yesno" },
  { key: "gumBleeding", label: "Do your gums bleed when brushing or flossing?", type: "yesno" },
  { key: "toothSensitivity", label: "Do you have sensitive teeth?", type: "yesno" },
  { key: "teethGrinding", label: "Do you grind or clench your teeth?", type: "yesno" },
  { key: "previousOrthodontics", label: "Have you had braces or orthodontic treatment?", type: "yesno" },
  { key: "oralSurgeryHistory", label: "Have you had any oral surgery?", type: "yesno" },
  { key: "smokingHabit", label: "Do you smoke or use tobacco products?", type: "yesno" },
];

export const INTAKE_QUESTION_SETS: Record<"MEDICAL_HISTORY" | "DENTAL_HISTORY", IntakeQuestion[]> = {
  MEDICAL_HISTORY: MEDICAL_HISTORY_QUESTIONS,
  DENTAL_HISTORY: DENTAL_HISTORY_QUESTIONS,
};