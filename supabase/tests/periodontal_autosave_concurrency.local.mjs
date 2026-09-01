import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

function execute(command, input, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { ...options, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (status) => resolve({ status, stdout, stderr })); child.stdin.end(input);
  });
}
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const uuid = (value) => `${literal(value)}::uuid`;
function requireSuccess(result, label) { if (result.status !== 0) throw new Error(`${label}: ${result.stderr.trim() || result.stdout.trim()}`); }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Two genuinely simultaneous autosave batches cannot be expressed inside one
 * pgTAP transaction, so the periodontal optimistic-concurrency race lives here.
 *
 * Two properties are proved:
 *
 *   1. Two batches submitted against the same expected_version: exactly one
 *      commits, the version advances by exactly one, and the loser reports a
 *      typed `stale version` conflict WITHOUT overwriting the winner's data.
 *   2. Cross-row applicability survives the race. One batch flips a tooth to an
 *      implant context while the other scores a natural-tooth index family on a
 *      surface of that same tooth. Whichever commits, the examination may never
 *      end up holding the natural-tooth family on a peri-implant surface.
 *
 * No measurement content is logged; the assertions read the database.
 */
export async function runPeriodontalAutosaveConcurrencyTest({ command, repositoryRoot, dockerEnvironment }) {
  const ids = Object.fromEntries(
    ["organization", "branch", "user", "member", "provider", "patient"].map((name) => [name, randomUUID()]),
  );
  const suffix = ids.organization.replaceAll("-", "").slice(0, 12);
  const options = { cwd: repositoryRoot, env: dockerEnvironment };

  const setup = `begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,phone_change,phone_change_token,reauthentication_token) values(${uuid(ids.user)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${literal(`perio-${suffix}@synthetic.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp(),'','','','','','','','');
insert into public.organizations(id,legal_name,business_name,slug) values(${uuid(ids.organization)},'Perio Race Synthetic Inc','Perio Race Synthetic',${literal(`perio-race-${suffix}`)});
insert into public.branches(id,organization_id,name,slug,code,address_line1,city,province) values(${uuid(ids.branch)},${uuid(ids.organization)},'Synthetic Main',${literal(`perio-race-main-${suffix}`)},'PER-R','1 Synthetic','Test City','Test Province');
insert into public.organization_members(id,organization_id,user_id,membership_status,joined_at) values(${uuid(ids.member)},${uuid(ids.organization)},${uuid(ids.user)},'active',statement_timestamp());
insert into public.branch_memberships(organization_id,branch_id,organization_member_id,access_status) values(${uuid(ids.organization)},${uuid(ids.branch)},${uuid(ids.member)},'active');
insert into public.member_roles(organization_id,organization_member_id,role_id,assigned_by) select ${uuid(ids.organization)},${uuid(ids.member)},id,${uuid(ids.user)} from public.roles where organization_id is null and code='DENTIST';
insert into public.providers(id,organization_id,linked_user_id,first_name,last_name,provider_type,status) values(${uuid(ids.provider)},${uuid(ids.organization)},${uuid(ids.user)},'Synthetic','Provider','REGULAR','active');
insert into public.provider_branches(organization_id,provider_id,branch_id,is_active) values(${uuid(ids.organization)},${uuid(ids.provider)},${uuid(ids.branch)},true);
insert into public.patients(id,organization_id,patient_number,first_name,last_name,birth_date,preferred_branch_id) values(${uuid(ids.patient)},${uuid(ids.organization)},${literal(`PER-${suffix}`)},'Synthetic','Patient','1990-01-01',${uuid(ids.branch)}); commit;`;

  const asActor = `set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub',${literal(ids.user)},true);`;

  const openDraft = `begin; ${asActor} select 'EXAM_ID=' || examination_id::text as marker from public.create_periodontal_draft_v2(${uuid(ids.branch)},${uuid(ids.patient)},'INITIAL',null,${uuid(randomUUID())}); commit;`;

  const cleanup = `begin; alter table public.audit_events disable trigger user;
delete from private.periodontal_workflow_idempotency where organization_id=${uuid(ids.organization)};
delete from public.periodontal_site_measurements where organization_id=${uuid(ids.organization)};
delete from public.periodontal_plaque_measurements where organization_id=${uuid(ids.organization)};
delete from public.periodontal_furcation_measurements where organization_id=${uuid(ids.organization)};
delete from public.periodontal_tooth_measurements where organization_id=${uuid(ids.organization)};
delete from public.periodontal_examinations where organization_id=${uuid(ids.organization)};
delete from public.audit_events where organization_id=${uuid(ids.organization)};
delete from public.clinical_encounters where organization_id=${uuid(ids.organization)};
delete from public.patients where organization_id=${uuid(ids.organization)};
delete from public.provider_branches where organization_id=${uuid(ids.organization)};
delete from public.providers where organization_id=${uuid(ids.organization)};
delete from public.member_roles where organization_id=${uuid(ids.organization)};
delete from public.branch_memberships where organization_id=${uuid(ids.organization)};
delete from public.organization_members where organization_id=${uuid(ids.organization)};
delete from public.payment_methods where organization_id=${uuid(ids.organization)};
delete from public.branches where organization_id=${uuid(ids.organization)};
delete from public.organizations where id=${uuid(ids.organization)};
delete from auth.users where id=${uuid(ids.user)};
alter table public.audit_events enable trigger user; commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "periodontal autosave concurrency setup");

    const opened = await execute(command, openDraft, options);
    requireSuccess(opened, "periodontal autosave concurrency draft");
    const examinationId = (opened.stdout.match(/EXAM_ID=([0-9a-f-]{36})/i) ?? [])[1];
    if (!examinationId) {
      throw new Error("the periodontal draft boundary returned no examination identity");
    }

    // ---- Race 1: one expected_version, two batches ------------------------
    const batch = (depth, key) =>
      `begin; ${asActor} select 'SAVED=' || version::text as marker from public.save_periodontal_measurements_v2(${uuid(examinationId)},1,${literal(
        JSON.stringify({ sites: [{ tooth_fdi: "16", site: "B", probing_depth_mm: depth, gingival_margin_mm: 0 }] }),
      )}::jsonb,${uuid(key)}); commit;`;

    const locker = execute(
      command,
      `begin; select id from public.periodontal_examinations where id=${uuid(examinationId)} for update; select pg_sleep(0.5); commit;`,
      options,
    );
    await delay(100);
    const versionRace = await Promise.all([
      execute(command, batch(3, randomUUID()), options),
      execute(command, batch(7, randomUUID()), options),
    ]);
    requireSuccess(await locker, "periodontal autosave concurrency lock");

    const winners = versionRace.filter((result) => result.status === 0);
    const losers = versionRace.filter((result) => result.status !== 0);
    if (winners.length !== 1 || losers.length !== 1) {
      throw new Error(
        `exactly one simultaneous autosave must commit, got ${winners.length} accepted and ${losers.length} refused`,
      );
    }
    if (!/stale version/.test(losers[0].stderr)) {
      throw new Error("the losing autosave must report a typed stale-version conflict");
    }
    if (!/SAVED=2/.test(winners[0].stdout)) {
      throw new Error("the winning autosave must advance the examination version by exactly one");
    }

    const versionProof = await execute(
      command,
      `select case when (select version from public.periodontal_examinations where id=${uuid(examinationId)})=2
         and (select count(*) from public.periodontal_site_measurements where examination_id=${uuid(examinationId)})=1
         then 'PERIO_VERSION_RACE_OK' else 'PERIO_VERSION_RACE_FAILED' end;`,
      options,
    );
    requireSuccess(versionProof, "periodontal autosave version proof");
    if (!versionProof.stdout.includes("PERIO_VERSION_RACE_OK")) {
      throw new Error("the refused autosave overwrote newer data or advanced the version twice");
    }

    // ---- Race 2: cross-row applicability ----------------------------------
    const implantBatch = `begin; ${asActor} select 'APPLIED' as marker from public.save_periodontal_measurements_v2(${uuid(examinationId)},2,${literal(
      JSON.stringify({ tooth: [{ tooth_fdi: "24", implant_context: true }] }),
    )}::jsonb,${uuid(randomUUID())}); commit;`;
    const naturalBatch = `begin; ${asActor} select 'APPLIED' as marker from public.save_periodontal_measurements_v2(${uuid(examinationId)},2,${literal(
      JSON.stringify({ plaque: [{ tooth_fdi: "24", surface: "BUCCAL", plaque_index: 1 }] }),
    )}::jsonb,${uuid(randomUUID())}); commit;`;

    const applicabilityLocker = execute(
      command,
      `begin; select id from public.periodontal_examinations where id=${uuid(examinationId)} for update; select pg_sleep(0.5); commit;`,
      options,
    );
    await delay(100);
    const applicabilityRace = await Promise.all([
      execute(command, implantBatch, options),
      execute(command, naturalBatch, options),
    ]);
    requireSuccess(await applicabilityLocker, "periodontal applicability concurrency lock");

    if (applicabilityRace.filter((result) => result.status === 0).length !== 1) {
      throw new Error("exactly one of the two simultaneous applicability batches must commit");
    }

    const applicabilityProof = await execute(
      command,
      `select case when not exists (
         select 1
         from public.periodontal_plaque_measurements as surface
         join public.periodontal_tooth_measurements as tooth
           on tooth.organization_id = surface.organization_id
          and tooth.examination_id = surface.examination_id
          and tooth.tooth_fdi = surface.tooth_fdi
         where surface.examination_id=${uuid(examinationId)}
           and tooth.implant_context
           and (surface.plaque_index is not null or surface.gingival_index is not null)
       ) then 'PERIO_APPLICABILITY_RACE_OK' else 'PERIO_APPLICABILITY_RACE_FAILED' end;`,
      options,
    );
    requireSuccess(applicabilityProof, "periodontal applicability proof");
    if (!applicabilityProof.stdout.includes("PERIO_APPLICABILITY_RACE_OK")) {
      throw new Error("a simultaneous implant flip and natural-family surface score both committed");
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "periodontal autosave concurrency cleanup");
  }
}
