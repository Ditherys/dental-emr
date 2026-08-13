"use client";

import { useSyncExternalStore } from "react";

/**
 * True once the component has hydrated on the client.
 *
 * Forms whose submission is handled by an `onSubmit` client handler do nothing
 * useful before hydration — worse, the browser performs a *native* submission
 * instead, which serialises every field into the URL. For the MFA forms that
 * meant a one-time TOTP code landing in the address bar, browser history, the
 * `Referer` header of the next request, and any access log in front of the app.
 *
 * Gate the submit control on this so the control cannot be operated before it
 * can actually work. Pair it with `method="post"` on the form, so that even an
 * unexpected native submission carries its fields in the body rather than the
 * query string.
 *
 * Implemented with `useSyncExternalStore` rather than `useState` + `useEffect`:
 * the server snapshot is `false` and the client snapshot is `true`, which is
 * exactly the question being asked, and it avoids setting state in an effect.
 */

/** Nothing ever changes after hydration, so the subscription is a no-op. */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
