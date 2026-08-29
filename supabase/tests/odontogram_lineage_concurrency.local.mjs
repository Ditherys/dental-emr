import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

function execute(command, input, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { ...options, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

function literal(value) { return `'${value.replaceAll("'", "''")}'`; }
function requireSuccess(result, label) {
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr.trim() || result.stdout.trim()}`);
}

export async function runOdontogramLineageConcurrencyTest({ command, repositoryRoot, dockerEnvironment }) {
  const encounterId = randomUUID();
  const predecessorId = randomUUID();
  const firstId = randomUUID();
  const secondId = randomUUID();
  const options = { cwd: repositoryRoot, env: dockerEnvironment };
  const org = "22000000-0000-0000-0000-000000000001";
  const branch = "32000000-0000-0000-0000-000000000001";
  const patient = "d45e073b-77d0-4c67-a656-aed601cc5c18";
  const provider = "72000000-0000-0000-0000-000000000001";

  const setup = `insert into public.clinical_encounters (id,organization_id,branch_id,patient_id,treating_provider_id,status)
values (${literal(encounterId)}::uuid,${literal(org)}::uuid,${literal(branch)}::uuid,${literal(patient)}::uuid,${literal(provider)}::uuid,'OPEN');
insert into public.periodontal_examinations (id,organization_id,patient_id,encounter_id,examination_kind,status,version,finalized_at,finalized_by,finalized_provider_id)
select ${literal(predecessorId)}::uuid,${literal(org)}::uuid,${literal(patient)}::uuid,${literal(encounterId)}::uuid,'INITIAL','FINAL',1,statement_timestamp(),id,${literal(provider)}::uuid from auth.users order by created_at limit 1;`;
  const insertChild = (id) => `begin;
insert into public.periodontal_examinations (id,organization_id,patient_id,encounter_id,predecessor_examination_id,examination_kind,status,version)
values (${literal(id)}::uuid,${literal(org)}::uuid,${literal(patient)}::uuid,${literal(encounterId)}::uuid,${literal(predecessorId)}::uuid,'AMENDMENT','DRAFT',2);
select pg_sleep(0.2);
commit;`;
  const cleanup = `begin;
alter table public.periodontal_examinations disable trigger user;
delete from public.periodontal_examinations where id in (${literal(firstId)}::uuid,${literal(secondId)}::uuid,${literal(predecessorId)}::uuid);
alter table public.periodontal_examinations enable trigger user;
delete from public.clinical_encounters where id=${literal(encounterId)}::uuid;
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "odontogram concurrency setup");
    const results = await Promise.all([execute(command, insertChild(firstId), options), execute(command, insertChild(secondId), options)]);
    const committed = results.filter((result) => result.status === 0).length;
    const uniqueRejected = results.filter((result) => result.status !== 0 && /duplicate key value violates unique constraint "periodontal_examinations_one_amendment_idx"/i.test(result.stderr)).length;
    if (committed !== 1 || uniqueRejected !== 1) {
      throw new Error(`expected one amendment commit and one unique rejection; received ${results.map((result) => result.status).join(",")}`);
    }
  } finally {
    requireSuccess(await execute(command, cleanup, options), "odontogram concurrency cleanup");
  }

  await runBridgeAndImplantLineageConcurrencyTest({ command, options, org, patient });
  await runClinicalEntryLineageConcurrencyTest({ command, options, org, patient });
}

async function runClinicalEntryLineageConcurrencyTest({ command, options, org, patient }) {
  const predecessor = randomUUID();
  const successorA = randomUUID();
  const successorB = randomUUID();
  const racePredecessor = randomUUID();
  const raceSuccessor = randomUUID();
  const raceVoid = randomUUID();
  const u = (value) => `${literal(value)}::uuid`;
  const entry = (id, tooth, supersedes = null, version = 1) => `insert into public.tooth_clinical_entries
    (id,organization_id,patient_id,tooth_code,kind,clinical_code,status,lifecycle,provenance,supersedes_entry_id,version)
    values (${u(id)},${literal(org)}::uuid,${literal(patient)}::uuid,${literal(tooth)},'FINDING','CARIES','ACTIVE','OPEN','INTERNAL',${supersedes ? u(supersedes) : "null"},${version});`;
  const setup = `${entry(predecessor, "41")}${entry(racePredecessor, "42")}`;
  const cleanup = `begin;
alter table public.tooth_clinical_entry_voids disable trigger user;
alter table public.tooth_clinical_entries disable trigger user;
delete from public.tooth_clinical_entry_voids where id=${u(raceVoid)} or entry_id=${u(racePredecessor)};
delete from public.tooth_clinical_entries where id in (${u(successorA)},${u(successorB)},${u(predecessor)},${u(raceSuccessor)},${u(racePredecessor)});
alter table public.tooth_clinical_entries enable trigger user;
alter table public.tooth_clinical_entry_voids enable trigger user;
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "clinical lineage concurrency setup");
    const duplicateSuccessors = await Promise.all([
      execute(command, `begin;${entry(successorA, "41", predecessor, 2)}select pg_sleep(0.2);commit;`, options),
      execute(command, `begin;${entry(successorB, "41", predecessor, 2)}select pg_sleep(0.2);commit;`, options),
    ]);
    assertOneCommitOneRejection(duplicateSuccessors, "clinical duplicate successor", /tooth_clinical_entries_one_successor_idx/i);

    const amendVsVoid = await Promise.all([
      execute(command, `begin;${entry(raceSuccessor, "42", racePredecessor, 2)}select pg_sleep(0.2);commit;`, options),
      execute(command, `begin;insert into public.tooth_clinical_entry_voids (id,organization_id,entry_id,reason) values (${u(raceVoid)},${literal(org)}::uuid,${u(racePredecessor)},'synthetic concurrency');select pg_sleep(0.2);commit;`, options),
    ]);
    assertOneCommitOneRejection(amendVsVoid, "clinical amend-vs-void", /tooth clinical (successor|void) lineage is invalid/i);
  } finally {
    requireSuccess(await execute(command, cleanup, options), "clinical lineage concurrency cleanup");
  }
}

async function runBridgeAndImplantLineageConcurrencyTest({ command, options, org, patient }) {
  const ids = Object.fromEntries([
    "bridgeRollback", "bridgeRollbackUnit", "bridgeSuccessorPredecessor",
    "bridgeSuccessorA", "bridgeSuccessorB", "bridgeRacePredecessor",
    "bridgeRaceSuccessor", "bridgeRaceVoid", "implantRollbackFixture",
    "implantRollbackInvalid", "implantSuccessorPredecessor", "implantSuccessorA",
    "implantSuccessorB", "implantRacePredecessor", "implantRaceSuccessor",
    "implantRaceVoid",
  ].map((name) => [name, randomUUID()]));

  const uuid = (name) => `${literal(ids[name])}::uuid`;
  const bridge = (id, tooth, supersedes = null, version = 1) => `
insert into public.dental_bridges
  (id,organization_id,patient_id,record_kind,provenance,sealed_at,supersedes_bridge_id,version)
values
  (${uuid(id)},${literal(org)}::uuid,${literal(patient)}::uuid,'CURRENT',
   'PREEXISTING_EXTERNAL',statement_timestamp(),${supersedes ? uuid(supersedes) : "null"},${version});`;
  const implant = (id, tooth, supersedes = null, version = 1) => `
insert into public.dental_implant_components
  (id,organization_id,patient_id,tooth_fdi,ordinal,component_kind,record_kind,
   provenance,sealed_at,supersedes_component_id,version)
values
  (${uuid(id)},${literal(org)}::uuid,${literal(patient)}::uuid,${literal(tooth)},1,
   'FIXTURE','CURRENT','PREEXISTING_EXTERNAL',statement_timestamp(),
   ${supersedes ? uuid(supersedes) : "null"},${version});`;

  const setup = [
    bridge("bridgeSuccessorPredecessor", "14"),
    bridge("bridgeRacePredecessor", "24"),
    implant("implantSuccessorPredecessor", "34"),
    implant("implantRacePredecessor", "44"),
  ].join("\n");

  const cleanup = `begin;
alter table public.dental_bridge_units disable trigger user;
alter table public.dental_bridge_voids disable trigger user;
alter table public.dental_bridges disable trigger user;
alter table public.dental_implant_component_voids disable trigger user;
alter table public.dental_implant_components disable trigger user;
delete from public.dental_bridge_units where bridge_id in (${uuid("bridgeRollback")},${uuid("bridgeSuccessorPredecessor")},${uuid("bridgeSuccessorA")},${uuid("bridgeSuccessorB")},${uuid("bridgeRacePredecessor")},${uuid("bridgeRaceSuccessor")});
delete from public.dental_bridge_voids where id=${uuid("bridgeRaceVoid")} or bridge_id in (${uuid("bridgeRacePredecessor")});
delete from public.dental_bridges where id in (${uuid("bridgeRollback")},${uuid("bridgeSuccessorA")},${uuid("bridgeSuccessorB")},${uuid("bridgeSuccessorPredecessor")},${uuid("bridgeRaceSuccessor")},${uuid("bridgeRacePredecessor")});
delete from public.dental_implant_component_voids where id=${uuid("implantRaceVoid")} or component_id in (${uuid("implantRacePredecessor")});
delete from public.dental_implant_components where id in (${uuid("implantRollbackInvalid")},${uuid("implantRollbackFixture")},${uuid("implantSuccessorA")},${uuid("implantSuccessorB")},${uuid("implantSuccessorPredecessor")},${uuid("implantRaceSuccessor")},${uuid("implantRacePredecessor")});
alter table public.dental_implant_components enable trigger user;
alter table public.dental_implant_component_voids enable trigger user;
alter table public.dental_bridges enable trigger user;
alter table public.dental_bridge_voids enable trigger user;
alter table public.dental_bridge_units enable trigger user;
commit;`;

  try {
    requireSuccess(await execute(command, setup, options), "bridge/implant concurrency setup");

    const failedBridgeConstruction = await execute(command, `begin;
insert into public.dental_bridges
  (id,organization_id,patient_id,record_kind,provenance)
values (${uuid("bridgeRollback")},${literal(org)}::uuid,${literal(patient)}::uuid,'CURRENT','PREEXISTING_EXTERNAL');
insert into public.dental_bridge_units
  (id,organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind)
values (${uuid("bridgeRollbackUnit")},${literal(org)}::uuid,${uuid("bridgeRollback")},'15',1,'ABUTMENT','NATURAL_TOOTH');
insert into public.dental_bridge_units
  (organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind)
values (${literal(org)}::uuid,${uuid("bridgeRollback")},'16',1,'PONTIC','NONE');
update public.dental_bridges set sealed_at=statement_timestamp() where id=${uuid("bridgeRollback")};
commit;`, options);
    if (failedBridgeConstruction.status === 0) throw new Error("invalid bridge construction unexpectedly committed");
    const bridgeRollbackProof = await execute(command, `select case when count(*)=0 then 'BRIDGE_ROLLBACK_OK' else 'BRIDGE_ROLLBACK_FAILED' end from public.dental_bridges where id=${uuid("bridgeRollback")};`, options);
    requireSuccess(bridgeRollbackProof, "bridge rollback proof");
    if (!bridgeRollbackProof.stdout.includes("BRIDGE_ROLLBACK_OK")) throw new Error("failed bridge construction left a parent row");

    const failedImplantConstruction = await execute(command, `begin;
${implant("implantRollbackFixture", "35")}
insert into public.dental_implant_components
  (id,organization_id,patient_id,tooth_fdi,ordinal,component_kind,record_kind,
   provenance,sealed_at,depends_on_component_id)
values (${uuid("implantRollbackInvalid")},${literal(org)}::uuid,${literal(patient)}::uuid,
  '35',2,'ATTACHMENT','CURRENT','PREEXISTING_EXTERNAL',statement_timestamp(),${uuid("implantRollbackFixture")});
commit;`, options);
    if (failedImplantConstruction.status === 0) throw new Error("invalid implant construction unexpectedly committed");
    const implantRollbackProof = await execute(command, `select case when count(*)=0 then 'IMPLANT_ROLLBACK_OK' else 'IMPLANT_ROLLBACK_FAILED' end from public.dental_implant_components where id in (${uuid("implantRollbackFixture")},${uuid("implantRollbackInvalid")});`, options);
    requireSuccess(implantRollbackProof, "implant rollback proof");
    if (!implantRollbackProof.stdout.includes("IMPLANT_ROLLBACK_OK")) throw new Error("failed implant construction left a component row");

    const bridgeSuccessors = await Promise.all([
      execute(command, `begin;${bridge("bridgeSuccessorA", "14", "bridgeSuccessorPredecessor", 2)}select pg_sleep(0.2);commit;`, options),
      execute(command, `begin;${bridge("bridgeSuccessorB", "14", "bridgeSuccessorPredecessor", 2)}select pg_sleep(0.2);commit;`, options),
    ]);
    assertOneCommitOneRejection(bridgeSuccessors, "bridge duplicate successor", /dental_bridges_one_successor_idx/i);

    const implantSuccessors = await Promise.all([
      execute(command, `begin;${implant("implantSuccessorA", "34", "implantSuccessorPredecessor", 2)}select pg_sleep(0.2);commit;`, options),
      execute(command, `begin;${implant("implantSuccessorB", "34", "implantSuccessorPredecessor", 2)}select pg_sleep(0.2);commit;`, options),
    ]);
    assertOneCommitOneRejection(implantSuccessors, "implant duplicate successor", /dental_implant_components_one_successor_idx/i);

    const bridgeAmendVsVoid = await Promise.all([
      execute(command, `begin;${bridge("bridgeRaceSuccessor", "24", "bridgeRacePredecessor", 2)}select pg_sleep(0.2);commit;`, options),
      execute(command, `begin;insert into public.dental_bridge_voids (id,organization_id,bridge_id,reason) values (${uuid("bridgeRaceVoid")},${literal(org)}::uuid,${uuid("bridgeRacePredecessor")},'synthetic concurrency');select pg_sleep(0.2);commit;`, options),
    ]);
    assertOneCommitOneRejection(bridgeAmendVsVoid, "bridge amend-vs-void", /bridge (successor|void) lineage is invalid/i);

    const implantAmendVsVoid = await Promise.all([
      execute(command, `begin;${implant("implantRaceSuccessor", "44", "implantRacePredecessor", 2)}select pg_sleep(0.2);commit;`, options),
      execute(command, `begin;insert into public.dental_implant_component_voids (id,organization_id,component_id,reason) values (${uuid("implantRaceVoid")},${literal(org)}::uuid,${uuid("implantRacePredecessor")},'synthetic concurrency');select pg_sleep(0.2);commit;`, options),
    ]);
    assertOneCommitOneRejection(implantAmendVsVoid, "implant amend-vs-void", /implant (successor|void) lineage is invalid/i);
  } finally {
    requireSuccess(await execute(command, cleanup, options), "bridge/implant concurrency cleanup");
  }
}

function assertOneCommitOneRejection(results, label, expectedError) {
  const committed = results.filter((result) => result.status === 0).length;
  const rejected = results.filter((result) => result.status !== 0 && expectedError.test(result.stderr)).length;
  if (committed !== 1 || rejected !== 1) {
    throw new Error(`${label}: expected one commit and one expected rejection; received ${results.map((result) => `${result.status}:${result.stderr.trim()}`).join(" | ")}`);
  }
}
