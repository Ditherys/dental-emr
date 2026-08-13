import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const bootstrapSchema = z.object({
  APP_ENVIRONMENT: z.enum(["development", "test", "production"]),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_PROJECT_ID: z.string().regex(/^[a-z0-9]+$/),
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_URL: z.url(),
  // z.guid(), not z.uuid(): PostgreSQL's uuid type does not constrain the
  // version nibble, and the synthetic tenant graph uses ids that Zod's
  // versioned validator rejects. See src/lib/validation/database-uuid.ts.
  BOOTSTRAP_ORGANIZATION_ID: z.guid(),
  BOOTSTRAP_OWNER_EMAIL: z.email().max(320),
  BOOTSTRAP_CONFIRMATION: z.literal(
    "I_UNDERSTAND_THIS_CREATES_FIRST_OWNER",
  ),
});

const parsed = bootstrapSchema.safeParse(process.env);

if (!parsed.success) {
  const invalidNames = parsed.error.issues
    .map((issue) => issue.path[0])
    .filter((name) => typeof name === "string")
    .join(", ");
  console.error(`Missing or invalid bootstrap variable(s): ${invalidNames}.`);
  process.exit(1);
}

const {
  APP_ENVIRONMENT: appEnvironment,
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_PROJECT_ID: projectId,
  SUPABASE_SECRET_KEY: secretKey,
  APP_URL: appUrl,
  BOOTSTRAP_ORGANIZATION_ID: organizationId,
  BOOTSTRAP_OWNER_EMAIL: ownerEmail,
} = parsed.data;
const parsedSupabaseUrl = new URL(url);
const expectedSupabaseOrigin = `https://${projectId}.supabase.co`;

if (
  parsedSupabaseUrl.origin !== expectedSupabaseOrigin ||
  parsedSupabaseUrl.username ||
  parsedSupabaseUrl.password ||
  parsedSupabaseUrl.pathname !== "/" ||
  parsedSupabaseUrl.search ||
  parsedSupabaseUrl.hash
) {
  console.error(
    "First-owner bootstrap refused: NEXT_PUBLIC_SUPABASE_URL does not match SUPABASE_PROJECT_ID.",
  );
  process.exit(1);
}

if (appEnvironment === "production") {
  console.error(
    "First-owner bootstrap refused: production provisioning is outside the Phase 1 workflow.",
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});
const invitationId = randomUUID();
const normalizedEmail = ownerEmail.trim().toLowerCase();

const { error: prepareError } = await admin.rpc(
  "prepare_first_owner_invitation",
  {
    p_invitation_id: invitationId,
    p_organization_id: organizationId,
    p_email: normalizedEmail,
  },
);

if (prepareError) {
  console.error(
    "First-owner bootstrap was refused. Verify the organization is active and has no existing workforce member.",
  );
  process.exit(1);
}

const redirectTo = `${new URL(appUrl).origin}/auth/confirm?next=%2Faccept-invite`;
const { data, error: inviteError } =
  await admin.auth.admin.inviteUserByEmail(normalizedEmail, { redirectTo });

if (inviteError || !data.user) {
  await admin.rpc("fail_workforce_invitation", {
    p_invitation_id: invitationId,
  });
  console.error("Supabase Auth could not deliver the first-owner invitation.");
  process.exit(1);
}

const { error: finalizeError } = await admin.rpc(
  "finalize_workforce_invitation",
  {
    p_invitation_id: invitationId,
    p_actor_user_id: null,
    p_auth_user_id: data.user.id,
  },
);

if (finalizeError) {
  await Promise.allSettled([
    admin.auth.admin.deleteUser(data.user.id),
    admin.rpc("fail_workforce_invitation", {
      p_invitation_id: invitationId,
    }),
  ]);
  console.error(
    "The first-owner tenant binding failed; the newly provisioned Auth identity was cleaned up.",
  );
  process.exit(1);
}

console.log(`First-owner invitation created: ${invitationId}`);
