export const PHOTO_CATEGORIES = ["BEFORE","PROGRESS","AFTER","DIAGNOSTIC","INTRAORAL","EXTRAORAL","OTHER"] as const;
export type ClinicalPhotoCategory = (typeof PHOTO_CATEGORIES)[number];
export const PHOTO_VARIANTS = { thumbnail: { width: 320, height: 240, fit: "inside" }, preview: { width: 1280, height: 960, fit: "inside" }, display: { width: 2048, height: 1536, fit: "inside" } } as const;
export type ClinicalPhotoVariant = keyof typeof PHOTO_VARIANTS;
export type ClinicalPhotoDTO = { photoId:string; patientId:string; procedureCaseId:string|null; category:ClinicalPhotoCategory; displayFilename:string; captureAt:string; toothCodes:string[]; surfaces:string[]; note:string|null; processingStatus:"PENDING"|"PROCESSING"|"READY"|"FAILED"; pairedPhotoId:string|null; version:number };
export type ClinicalPhotoDerivative = { photoId:string; variant:ClinicalPhotoVariant; mimeType:string; width:number; height:number; sizeBytes:number; checksumSha256:string };
export type ClinicalPhotoSourceUploadResult = { fileId:string; uploadUrl:string; expiresAt:Date; version:number };
export type ClinicalPhotoDerivativeUrlResult = { photoId:string; variant:ClinicalPhotoVariant; downloadUrl:string; expiresAt:Date; mimeType:"image/jpeg" };
