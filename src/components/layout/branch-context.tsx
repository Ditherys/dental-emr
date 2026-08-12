"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { BranchContextModel } from "@/lib/authorization/policy";

export const ALL_BRANCHES_VALUE = "all";
const STORAGE_KEY_PREFIX = "dental-emr:branch-context";
const BRANCH_CONTEXT_CHANGE_EVENT = "dental-emr:branch-context-change";
const memoryPreferences = new Map<string, string>();
const failedStorageKeys = new Set<string>();

export function resolveBranchSelection(
  model: BranchContextModel,
  candidate?: string | null,
) {
  if (candidate === ALL_BRANCHES_VALUE && model.allowAllBranches) {
    return ALL_BRANCHES_VALUE;
  }

  if (candidate && model.branches.some(({ id }) => id === candidate)) {
    return candidate;
  }

  if (model.allowAllBranches) {
    return ALL_BRANCHES_VALUE;
  }

  return model.branches[0]?.id ?? null;
}

type BranchContextValue = {
  model: BranchContextModel;
  selection: string | null;
  // This is display/workflow state only. Server reads and mutations must
  // authorize any selected branch independently.
  selectBranch: (selection: string) => void;
};

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchContextProvider({
  children,
  model,
}: {
  children: ReactNode;
  model: BranchContextModel;
}) {
  const storageKey = `${STORAGE_KEY_PREFIX}:${model.organization.id}`;
  const defaultSelection = resolveBranchSelection(model);
  const getSnapshot = useCallback(() => {
    if (failedStorageKeys.has(storageKey)) {
      return resolveBranchSelection(model, memoryPreferences.get(storageKey));
    }

    try {
      return resolveBranchSelection(
        model,
        window.localStorage.getItem(storageKey),
      );
    } catch {
      return resolveBranchSelection(model, memoryPreferences.get(storageKey));
    }
  }, [model, storageKey]);
  const getServerSnapshot = useCallback(
    () => defaultSelection,
    [defaultSelection],
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === storageKey) {
          failedStorageKeys.delete(storageKey);
          memoryPreferences.delete(storageKey);
          onStoreChange();
        }
      };

      window.addEventListener("storage", handleStorage);
      window.addEventListener(BRANCH_CONTEXT_CHANGE_EVENT, onStoreChange);

      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(BRANCH_CONTEXT_CHANGE_EVENT, onStoreChange);
      };
    },
    [storageKey],
  );
  const selection = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const selectBranch = useCallback(
    (candidate: string) => {
      const nextSelection = resolveBranchSelection(model, candidate);

      try {
        if (nextSelection) {
          memoryPreferences.set(storageKey, nextSelection);
          window.localStorage.setItem(storageKey, nextSelection);
        } else {
          memoryPreferences.delete(storageKey);
          window.localStorage.removeItem(storageKey);
        }
        failedStorageKeys.delete(storageKey);
      } catch {
        // Storage can be unavailable in restricted browser modes. The in-memory
        // preference remains usable for the current shell session.
        failedStorageKeys.add(storageKey);
      }

      window.dispatchEvent(new Event(BRANCH_CONTEXT_CHANGE_EVENT));
    },
    [model, storageKey],
  );

  const value = useMemo(
    () => ({ model, selection, selectBranch }),
    [model, selectBranch, selection],
  );

  return (
    <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
  );
}

export function useBranchContext() {
  const context = useContext(BranchContext);

  if (!context) {
    throw new Error("useBranchContext must be used within BranchContextProvider.");
  }

  return context;
}
