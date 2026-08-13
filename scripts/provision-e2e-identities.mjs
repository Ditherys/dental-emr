/**
 * Provisions the four synthetic E2E login identities on a disposable Cloud
 * TEST project, wires them to the seeded synthetic tenant graph, and enrolls a
 * verified TOTP factor for the owner and the admin.
 *
 * The seed's nine `auth.users` rows are deliberately non-login placeholders: no
 * password, no confirmed email, no factor. The Playwright flows need real
 * identities, and creating them by hand in the Dashboard is both tedious and
 * easy to get subtly wrong — a membership attached to the wrong organization
 * would make the R5 authorization tests fail for a reason that has nothing to do
 * with authorization.
 *
 * The admin identity is dedicated to `session-boundaries.spec.ts`'s mid-session
 * suspension-then-mutation test. It reuses the seed's existing `org-a-admin`
 * row, which already carries an organization-wide ADMIN assignment — ADMIN
 * holds `branch.manage`, the same permission OWNER uses to add a branch, so the
 * test still exercises a real authorized mutation. Suspending THIS identity
 * mid-test, instead of the shared owner every other spec file signs in as,
 * means a failure here can no longer cascade into unrelated tests running
 * concurrently in other Playwright workers.
 *
 * SAFETY
 * ------
 * - Refuses any target that is not the explicitly designated, linked, disposable
 *   Cloud TEST project. Same guard as every other remote command.
 * - Synthetic data only. Emails come from the caller; the documented fixtures use
 *   `.example.test`, which cannot receive real mail.
 * - Passwords are read from the environment and never printed or logged.
 * - A TOTP secret is a credential. Newly enrolled secrets are written to a file
 *   **outside the repository** that the caller names, with 0600-equivalent
 *   intent, and only the path is printed. They are never echoed to the terminal.
 * - Idempotent: re-running repairs state rather than duplicating it.
 *
 * USAGE
 * -----
 *   $env:E2E_OWNER_EMAIL='owner@p1e2e.example.test'
 *   $env:E2E_OWNER_PASSWORD='<generated>'
 *   $env:E2E_ADMIN_EMAIL='admin@p1e2e.example.test'
 *   $env:E2E_ADMIN_PASSWORD='<generated>'
 *   $env:E2E_BRANCH_USER_EMAIL='branch@p1e2e.example.test'
 *   $env:E2E_BRANCH_USER_PASSWORD='<generated>'
 *   $env:E2E_SUSPENDED_EMAIL='suspended@p1e2e.example.test'
 *   $env:E2E_SUSPENDED_PASSWORD='<generated>'
 *   $env:E2E_TOTP_SECRET_OUT='C:\Users\<you>\dental-emr-e2e-totp.txt'
 *   npm run e2e:provision
 */

import { createHmac } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  readLinkedProjectId,
  validateRemoteDatabaseTestEnvironment,
} from "./remote-database-test-guard.mjs";

/* -------------------------------------------------------------------------- */
/* The synthetic tenant graph these identities attach to (supabase/seed.sql).  */
/* -------------------------------------------------------------------------- */

const ORGANIZATION_A = "22000000-0000-0000-0000-000000000001";
const BRANCH_A1 = "32000000-0000-0000-0000-000000000001";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const linkedProjectFile = join(
  repositoryRoot,
  "supabase",
  ".temp",
  "project-ref",
);

function fail(message) {
  console.error(`E2E identity provisioning refused to continue: ${message}`);
  process.exit(1);
}

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* TOTP (RFC 6238), so the owner factor can be verified without a phone.       */
/* -------------------------------------------------------------------------- */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(secret) {
  const normalized = secret.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output = [];

  for (const character of normalized) {
    const index = BASE32.indexOf(character);

    if (index === -1) {
      throw new Error("The enrollment secret is not valid base32.");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(output);
}

function totp(secret, atSeconds = Math.floor(Date.now() / 1000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atSeconds / 30)));

  const digest = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

/* -------------------------------------------------------------------------- */

async function upsertIdentity(admin, email, password) {
  const { data: existing, error: listError } = await admin.auth.admin.listUsers(
    { page: 1, perPage: 1000 },
  );

  if (listError) {
    throw new Error(`Could not enumerate identities: ${listError.message}`);
  }

  const normalized = email.trim().toLowerCase();
  const match = existing.users.find(
    (user) => user.email?.trim().toLowerCase() === normalized,
  );

  if (match) {
    const { error } = await admin.auth.admin.updateUserById(match.id, {
      password,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`Could not refresh a synthetic identity: ${error.message}`);
    }

    return match.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(
      `Could not create a synthetic identity: ${error?.message ?? "no user returned"}`,
    );
  }

  return data.user.id;
}

async function upsertMembership(admin, userId, membershipStatus) {
  const { data: existing, error: readError } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", ORGANIZATION_A)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read membership: ${readError.message}`);
  }

  const row = {
    organization_id: ORGANIZATION_A,
    user_id: userId,
    membership_status: membershipStatus,
    joined_at: new Date().toISOString(),
    suspended_at:
      membershipStatus === "suspended" ? new Date().toISOString() : null,
  };

  if (existing) {
    const { error } = await admin
      .from("organization_members")
      .update(row)
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Could not update membership: ${error.message}`);
    }

    return existing.id;
  }

  const { data, error } = await admin
    .from("organization_members")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create membership: ${error.message}`);
  }

  return data.id;
}

async function resolveSystemRoleId(admin, code) {
  const { data, error } = await admin
    .from("roles")
    .select("id")
    .is("organization_id", null)
    .eq("code", code)
    .single();

  if (error) {
    throw new Error(`Could not resolve the ${code} system role: ${error.message}`);
  }

  return data.id;
}

async function ensureBranchAccess(admin, memberId) {
  const { data: existing, error: readError } = await admin
    .from("branch_memberships")
    .select("id")
    .eq("branch_id", BRANCH_A1)
    .eq("organization_member_id", memberId)
    .maybeSingle();

  if (readError) {
    throw new Error(`Could not read branch access: ${readError.message}`);
  }

  if (existing) {
    const { error } = await admin
      .from("branch_memberships")
      .update({ access_status: "active", revoked_at: null })
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Could not restore branch access: ${error.message}`);
    }

    return;
  }

  const { error } = await admin.from("branch_memberships").insert({
    organization_id: ORGANIZATION_A,
    branch_id: BRANCH_A1,
    organization_member_id: memberId,
    access_status: "active",
  });

  if (error) {
    throw new Error(`Could not grant branch access: ${error.message}`);
  }
}

async function ensureRole(admin, memberId, roleId, branchId) {
  const query = admin
    .from("member_roles")
    .select("id")
    .eq("organization_member_id", memberId)
    .eq("role_id", roleId);

  const { data: existing, error: readError } = await (branchId
    ? query.eq("branch_id", branchId)
    : query.is("branch_id", null)
  ).maybeSingle();

  if (readError) {
    throw new Error(`Could not read role assignment: ${readError.message}`);
  }

  if (existing) {
    return;
  }

  const { error } = await admin.from("member_roles").insert({
    organization_id: ORGANIZATION_A,
    organization_member_id: memberId,
    role_id: roleId,
    branch_id: branchId,
  });

  if (error) {
    throw new Error(`Could not assign a role: ${error.message}`);
  }
}

/**
 * Enrolls and verifies a TOTP factor for a fixture using a normal user session.
 * There is no admin API for this: a factor only reaches `verified` by answering
 * a challenge, which is exactly the property the AAL2 gate depends on.
 */
async function ensureTotpFactor(url, publishableKey, email, password) {
  const user = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await user.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    throw new Error(`The owner fixture could not sign in: ${signInError.message}`);
  }

  const { data: factors, error: factorError } = await user.auth.mfa.listFactors();

  if (factorError) {
    throw new Error(`Could not list factors: ${factorError.message}`);
  }

  if (factors.totp.some((factor) => factor.status === "verified")) {
    return null; // Already enrolled; the existing secret is the caller's to keep.
  }

  const { data: enrollment, error: enrollError } = await user.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `E2E synthetic factor ${Date.now()}`,
  });

  if (enrollError || !enrollment) {
    throw new Error(`Could not enroll a factor: ${enrollError?.message}`);
  }

  const secret = enrollment.totp.secret;
  const { data: challenge, error: challengeError } =
    await user.auth.mfa.challenge({ factorId: enrollment.id });

  if (challengeError || !challenge) {
    throw new Error(`Could not challenge the factor: ${challengeError?.message}`);
  }

  const { error: verifyError } = await user.auth.mfa.verify({
    factorId: enrollment.id,
    challengeId: challenge.id,
    code: totp(secret),
  });

  if (verifyError) {
    throw new Error(`Could not verify the factor: ${verifyError.message}`);
  }

  await user.auth.signOut();
  return secret;
}

/* -------------------------------------------------------------------------- */

try {
  if (!existsSync(linkedProjectFile)) {
    throw new Error(
      "No linked project was found. Link the designated Cloud TEST project first.",
    );
  }

  // Every Cloud TEST target check, unchanged.
  validateRemoteDatabaseTestEnvironment(
    process.env,
    readLinkedProjectId(linkedProjectFile),
  );

  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = required("SUPABASE_SECRET_KEY");
  const totpSecretOut = required("E2E_TOTP_SECRET_OUT");

  if (secretKey.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SECRET_KEY must be a secret key.");
  }

  if (resolve(totpSecretOut).startsWith(repositoryRoot)) {
    throw new Error(
      "E2E_TOTP_SECRET_OUT must point outside the repository. A factor secret must never sit in a working tree.",
    );
  }

  const admin = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const ownerEmail = required("E2E_OWNER_EMAIL");
  const adminEmail = required("E2E_ADMIN_EMAIL");
  const branchUserEmail = required("E2E_BRANCH_USER_EMAIL");
  const suspendedEmail = required("E2E_SUSPENDED_EMAIL");

  const ownerRoleId = await resolveSystemRoleId(admin, "OWNER");
  const adminRoleId = await resolveSystemRoleId(admin, "ADMIN");
  const receptionistRoleId = await resolveSystemRoleId(admin, "RECEPTIONIST");

  // Owner: organization-wide OWNER, active, MFA-enrolled.
  const ownerUserId = await upsertIdentity(
    admin,
    ownerEmail,
    required("E2E_OWNER_PASSWORD"),
  );
  const ownerMemberId = await upsertMembership(admin, ownerUserId, "active");
  await ensureRole(admin, ownerMemberId, ownerRoleId, null);
  console.log("owner identity and organization-wide OWNER assignment ready");

  // Admin: organization-wide ADMIN, active, MFA-enrolled. Dedicated to the
  // mid-session suspension-then-mutation test so suspending it never touches
  // the shared owner every other spec file signs in as.
  const adminUserId = await upsertIdentity(
    admin,
    adminEmail,
    required("E2E_ADMIN_PASSWORD"),
  );
  const adminMemberId = await upsertMembership(admin, adminUserId, "active");
  await ensureRole(admin, adminMemberId, adminRoleId, null);
  console.log("admin identity and organization-wide ADMIN assignment ready");

  // Branch user: active, RECEPTIONIST scoped to Branch A1 only, no MFA.
  const branchUserId = await upsertIdentity(
    admin,
    branchUserEmail,
    required("E2E_BRANCH_USER_PASSWORD"),
  );
  const branchMemberId = await upsertMembership(admin, branchUserId, "active");
  await ensureBranchAccess(admin, branchMemberId);
  await ensureRole(admin, branchMemberId, receptionistRoleId, BRANCH_A1);
  console.log("branch-scoped identity ready (Branch A1 only)");

  // Suspended: an identity that can sign in but holds no active membership.
  const suspendedUserId = await upsertIdentity(
    admin,
    suspendedEmail,
    required("E2E_SUSPENDED_PASSWORD"),
  );
  await upsertMembership(admin, suspendedUserId, "suspended");
  console.log("suspended identity ready");

  const ownerSecret = await ensureTotpFactor(
    url,
    publishableKey,
    ownerEmail,
    required("E2E_OWNER_PASSWORD"),
  );
  const adminSecret = await ensureTotpFactor(
    url,
    publishableKey,
    adminEmail,
    required("E2E_ADMIN_PASSWORD"),
  );

  const newlyEnrolled = [];
  if (ownerSecret) newlyEnrolled.push(`E2E_OWNER_TOTP_SECRET=${ownerSecret}`);
  if (adminSecret) newlyEnrolled.push(`E2E_ADMIN_TOTP_SECRET=${adminSecret}`);

  if (newlyEnrolled.length > 0) {
    writeFileSync(totpSecretOut, `${newlyEnrolled.join("\n")}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(
      `${newlyEnrolled.length} new TOTP factor(s) enrolled and verified; written to ${totpSecretOut}`,
    );
    console.log(
      "Set the matching E2E_*_TOTP_SECRET value(s) from that file, then delete the file. They are credentials.",
    );
  } else {
    console.log(
      "owner and admin already hold verified TOTP factors; existing secrets left untouched",
    );
  }

  console.log("");
  console.log("Synthetic E2E identities provisioned on the Cloud TEST project.");
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
