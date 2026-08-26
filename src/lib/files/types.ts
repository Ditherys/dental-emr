import type { z } from "zod";

import type {
  archiveFileInputSchema,
  confirmFileUploadInputSchema,
  createFileUploadInputSchema,
  fileStatusSchema,
  getFileDownloadUrlInputSchema,
  listPatientFilesInputSchema,
} from "./schema";

export type FileStatus = z.infer<typeof fileStatusSchema>;

export type CreateFileUploadInput = z.infer<typeof createFileUploadInputSchema>;
export type ConfirmFileUploadInput = z.infer<typeof confirmFileUploadInputSchema>;
export type ArchiveFileInput = z.infer<typeof archiveFileInputSchema>;
export type ListPatientFilesInput = z.infer<typeof listPatientFilesInputSchema>;
export type GetFileDownloadUrlInput = z.infer<typeof getFileDownloadUrlInputSchema>;

export type CreateFileUploadResult = {
  fileId: string;
  uploadUrl: string;
  expiresAt: Date;
  version: number;
};

export type FileMutationResult = { fileId: string; version: number };

export type FileListItem = {
  fileId: string;
  mimeType: string;
  sizeBytes: number | null;
  status: FileStatus;
  version: number;
  createdAt: string;
  uploadedBy: string;
};

export type FileDownloadUrlResult = {
  fileId: string;
  downloadUrl: string;
  expiresAt: Date;
  mimeType: string;
  version: number;
};

export type ArchiveFileResult = {
  fileId: string;
  version: number;
  objectDeleted: boolean;
};
