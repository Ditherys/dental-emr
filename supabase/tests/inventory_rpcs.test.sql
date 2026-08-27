begin;

select extensions.no_plan();

-- Synthetic-only P19-02 graph, GUC-as-postgres. admin-a holds inventory.manage
-- and inventory.view (org-wide ADMIN in Org A), dentist-a (DENTIST) and
-- reception-a (RECEPTIONIST) hold no inventory permission, and admin-b is a
-- foreign ADMIN in Org B. Fixture inserts run as the owner; every RPC call runs
-- as postgres with the request.jwt.claim.sub GUC driving auth.uid().
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e1010000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-a@p1902.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1010000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1902.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1010000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@p1902.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1010000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-b@p1902.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e1020000-0000-0000-0000-000000000001','P1902 Synthetic A Inc.','P1902 A','p1902-a'),
  ('e1020000-0000-0000-0000-000000000002','P1902 Synthetic B Inc.','P1902 B','p1902-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e1030000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','P1902 A Main','p1902-a-main','P1902-A','1 Synthetic St','Test City','Test Province'),
  ('e1030000-0000-0000-0000-000000000002','e1020000-0000-0000-0000-000000000001','P1902 A Branch 2','p1902-a-2','P1902-A2','2 Synthetic St','Test City','Test Province'),
  ('e1030000-0000-0000-0000-000000000003','e1020000-0000-0000-0000-000000000002','P1902 B Main','p1902-b-main','P1902-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e1040000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','e1010000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e1040000-0000-0000-0000-000000000002','e1020000-0000-0000-0000-000000000001','e1010000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e1040000-0000-0000-0000-000000000003','e1020000-0000-0000-0000-000000000001','e1010000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e1040000-0000-0000-0000-000000000004','e1020000-0000-0000-0000-000000000002','e1010000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e1020000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1040000-0000-0000-0000-000000000001','active'),
  ('e1020000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000002','e1040000-0000-0000-0000-000000000001','active'),
  ('e1020000-0000-0000-0000-000000000002','e1030000-0000-0000-0000-000000000003','e1040000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e1020000-0000-0000-0000-000000000001'::uuid,'e1040000-0000-0000-0000-000000000001'::uuid,'ADMIN'::text,null::uuid,'e1010000-0000-0000-0000-000000000001'::uuid),
  ('e1020000-0000-0000-0000-000000000001'::uuid,'e1040000-0000-0000-0000-000000000002'::uuid,'DENTIST'::text,null::uuid,'e1010000-0000-0000-0000-000000000001'::uuid),
  ('e1020000-0000-0000-0000-000000000001'::uuid,'e1040000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,null::uuid,'e1010000-0000-0000-0000-000000000001'::uuid),
  ('e1020000-0000-0000-0000-000000000002'::uuid,'e1040000-0000-0000-0000-000000000004'::uuid,'ADMIN'::text,null::uuid,'e1010000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;

create temp table r1902_items (seq integer primary key, id uuid);
create temp table r1902_transfers (seq integer primary key, id uuid);
grant select on r1902_items to authenticated;
grant select on r1902_transfers to authenticated;

-- Grant surface and definer hygiene.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.create_inventory_item(uuid,text,text,text,text,integer,boolean)'::regprocedure,
  'public.update_inventory_item(uuid,uuid,integer,text,text,text,integer,boolean,boolean)'::regprocedure,
  'public.list_inventory_items(uuid,boolean)'::regprocedure,
  'public.receive_stock(uuid,uuid,integer,text,date)'::regprocedure,
  'public.adjust_stock(uuid,uuid,integer,integer,text)'::regprocedure,
  'public.issue_stock(uuid,uuid,integer,integer,text)'::regprocedure,
  'public.create_inventory_transfer(uuid,uuid,uuid,uuid,integer,text)'::regprocedure,
  'public.confirm_transfer_receipt(uuid,uuid,integer)'::regprocedure,
  'public.cancel_inventory_transfer(uuid,uuid,integer,text)'::regprocedure,
  'public.list_inventory_stock(uuid,uuid,boolean)'::regprocedure,
  'public.list_inventory_movements(uuid,uuid)'::regprocedure,
  'public.get_inventory_aggregate(uuid)'::regprocedure,
  'public.list_inventory_transfers(uuid,text)'::regprocedure,
  'private.has_inventory_permission_at_branch(uuid,text)'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),14,'the fourteen P19 inventory definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.create_inventory_item(uuid,text,text,text,text,integer,boolean)','execute')
  and has_function_privilege('authenticated','public.update_inventory_item(uuid,uuid,integer,text,text,text,integer,boolean,boolean)','execute')
  and has_function_privilege('authenticated','public.list_inventory_items(uuid,boolean)','execute')
  and has_function_privilege('authenticated','public.receive_stock(uuid,uuid,integer,text,date)','execute')
  and has_function_privilege('authenticated','public.adjust_stock(uuid,uuid,integer,integer,text)','execute')
  and has_function_privilege('authenticated','public.issue_stock(uuid,uuid,integer,integer,text)','execute')
  and has_function_privilege('authenticated','public.create_inventory_transfer(uuid,uuid,uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.confirm_transfer_receipt(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.cancel_inventory_transfer(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.list_inventory_stock(uuid,uuid,boolean)','execute')
  and has_function_privilege('authenticated','public.list_inventory_movements(uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.get_inventory_aggregate(uuid)','execute')
  and has_function_privilege('authenticated','public.list_inventory_transfers(uuid,text)','execute')
  and not has_function_privilege('anon','public.create_inventory_item(uuid,text,text,text,text,integer,boolean)','execute')
  and not has_function_privilege('service_role','public.create_inventory_item(uuid,text,text,text,text,integer,boolean)','execute')
  and not has_function_privilege('anon','public.get_inventory_aggregate(uuid)','execute')
  and not has_function_privilege('service_role','public.get_inventory_aggregate(uuid)','execute'),
  'only authenticated has the thirteen exact P19 RPC grants'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_inventory_permission_at_branch(uuid,text)'),
    ('private.protect_inventory_movements()'),
    ('private.enforce_consumable_inventory_stock()'),
    ('private.prevent_stocked_item_equipment_conversion()')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the private inventory permission helper and the append-only trigger are not executable by browser or service roles');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000001',true);

-- Item catalog lifecycle: create, list scope, versioned update, audit.
insert into r1902_items (seq, id)
select 1, item_id from public.create_inventory_item('e1030000-0000-0000-0000-000000000001','ANESTHETIC','Anesthetic 2% Cartridge','CONSUMABLE','box',10,true);
insert into r1902_items (seq, id)
select 2, item_id from public.create_inventory_item('e1030000-0000-0000-0000-000000000001','GLOVES','Surgical Gloves','CONSUMABLE','pair',10,false);
insert into r1902_items (seq, id)
select 3, item_id from public.create_inventory_item('e1030000-0000-0000-0000-000000000001','SUTURES','Suture','CONSUMABLE','box',5,false);
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.item.created'),3,'each item create writes exactly one inventory.item.created audit event');
select extensions.is((select count(*)::integer from public.list_inventory_items('e1030000-0000-0000-0000-000000000001',false)),3,'item listing returns every active item in the acting organization');
select extensions.is((select code || ':' || category || ':' || unit || ':' || reorder_level::text || ':' || lot_tracking::text from public.list_inventory_items('e1030000-0000-0000-0000-000000000001',false) where item_id=(select id from r1902_items where seq=1)),'ANESTHETIC:CONSUMABLE:box:10:true','item creation persists the full catalog projection');
select extensions.is((select version from public.update_inventory_item('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=2),1,'Surgical Gloves','CONSUMABLE','box',10,false,true)),2,'an item updates with an optimistic version bump');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.item.updated'),1,'each item update writes exactly one inventory.item.updated audit event');
select extensions.throws_ok($$select public.update_inventory_item('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=2),1,'Surgical Gloves','CONSUMABLE','box',10,false,true)$$,'P0001','stale version','a stale expected version is rejected on item update');
select extensions.throws_ok($$select public.create_inventory_item('e1030000-0000-0000-0000-000000000001','lower','Lower','CONSUMABLE','box',0,false)$$,'22023','invalid input','a lowercase item code is rejected');
select extensions.throws_ok($$select public.create_inventory_item('e1030000-0000-0000-0000-000000000001','DRILL','   ','CONSUMABLE','box',0,false)$$,'22023','invalid input','a blank item name is rejected');
select extensions.throws_ok($$select public.create_inventory_item('e1030000-0000-0000-0000-000000000001','DRILL','Drill','TOOL','box',0,false)$$,'22023','invalid input','an invented item category is rejected');
select extensions.throws_ok($$select public.create_inventory_item('e1030000-0000-0000-0000-000000000001','DRILL','Drill','EQUIPMENT','box',-1,false)$$,'22023','invalid input','a negative reorder level is rejected');
select extensions.throws_ok($$select public.create_inventory_item('e1030000-0000-0000-0000-000000000001','ANESTHETIC','Duplicate','CONSUMABLE','box',0,false)$$,'23505',null,'a duplicate item code in the same organization is rejected');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.item.created'),3,'rejected item creates write no audit event');

-- Receive: additive, per-branch balances, lot metadata, audit metadata.
select extensions.is((select quantity_on_hand || ':' || version from public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),10,null,null)),'10:1','the first receipt creates the branch stock row at version one');
select extensions.is((select quantity_on_hand || ':' || version from public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),5,null,null)),'15:2','a second receipt adds to the same branch balance');
select extensions.is((select quantity_on_hand || ':' || version from public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=2),5,null,null)),'5:1','receiving a second item creates its own stock row');
select extensions.is((select quantity_on_hand || ':' || version from public.receive_stock('e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=2),5,null,null)),'5:1','a receipt at another branch creates an independent per-branch balance');
select extensions.is((select quantity_on_hand || ':' || version from public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=3),5,'LOT-A',date '2027-01-01')),'5:1','a receipt with lot and expiry metadata is accepted');
select extensions.is((select quantity_on_hand || ':' || version from public.receive_stock('e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=3),5,null,null)),'5:1','a receipt at the second branch seeds its own balance');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.received'),6,'each receipt writes exactly one inventory.stock.received audit event');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and movement_type='RECEIPT'),6,'each receipt appends exactly one RECEIPT ledger row');
select extensions.ok((select lot_number='LOT-A' and expiry_date=date '2027-01-01' from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and branch_id='e1030000-0000-0000-0000-000000000001' and movement_type='RECEIPT' and item_id=(select id from r1902_items where seq=3)),'the lot/expiry receipt persists its metadata on the ledger row');
select extensions.is((select metadata->>'quantity' from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.received' order by occurred_at desc limit 1),'5','the receive audit event carries bounded {quantity} metadata');
select extensions.throws_ok($$select public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),0,null,null)$$,'22023','invalid input','a non-positive receipt quantity is rejected');
select extensions.throws_ok($$select public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),1,repeat('l',101),null)$$,'22023','invalid input','an oversized lot number is rejected');

-- Adjust: reason required, optimistic version, cannot drive balance negative.
select extensions.is((select quantity_on_hand || ':' || version from public.adjust_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),2,2,'damaged units correction')),'17:3','a reasoned adjustment bumps the balance and version');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and movement_type='ADJUSTMENT' and quantity_delta=2),1,'the adjustment appends exactly one ADJUSTMENT ledger row');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.adjusted'),1,'the adjustment writes exactly one inventory.stock.adjusted audit event');
select extensions.is((select metadata->>'quantity_delta' from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.adjusted' order by occurred_at desc limit 1),'2','the adjust audit event carries bounded {quantity_delta} metadata');
select extensions.throws_ok($$select public.adjust_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),3,1,null)$$,'22023','invalid input','an adjustment without a reason is rejected');
select extensions.throws_ok($$select public.adjust_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),3,0,'zero delta')$$,'22023','invalid input','a zero adjustment delta is rejected');
select extensions.throws_ok($$select public.adjust_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),1,2,'stale')$$,'P0001','stale version','a stale version is rejected on adjustment');
select extensions.throws_ok($$select public.adjust_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=3),1,-10,'over-correction')$$,'P0001','insufficient stock','an adjustment that drives the balance negative is rejected');

-- Issue: reason required, optimistic version, cannot exceed balance.
select extensions.is((select quantity_on_hand || ':' || version from public.issue_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),3,3,'chairside dispensing')),'14:4','a reasoned issue reduces the balance and bumps the version');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and movement_type='ISSUE' and quantity_delta=-3),1,'the issue appends exactly one ISSUE ledger row with a negative delta');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.issued'),1,'the issue writes exactly one inventory.stock.issued audit event');
select extensions.throws_ok($$select public.issue_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),4,1,null)$$,'22023','invalid input','an issue without a reason is rejected');
select extensions.throws_ok($$select public.issue_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),4,0,'zero')$$,'22023','invalid input','a non-positive issue quantity is rejected');
select extensions.throws_ok($$select public.issue_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),1,1,'stale')$$,'P0001','stale version','a stale version is rejected on issue');
select extensions.throws_ok($$select public.issue_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),4,100,'overdraw')$$,'P0001','insufficient stock','an issue larger than the balance is rejected');

-- Negative stock is prevented end-to-end: receive 5 then try to issue 10.
select extensions.throws_ok($$select public.issue_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=3),1,10,'overdraw')$$,'P0001','insufficient stock','issuing ten against a five-unit balance is rejected end-to-end');
select extensions.is((select quantity_on_hand || ':' || version from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=3),false) limit 1),'5:1','the rejected issue leaves the balance and version untouched');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and movement_type='ISSUE' and item_id=(select id from r1902_items where seq=3)),0,'the rejected issue appends no ISSUE ledger row');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.issued' and entity_id in (select id from public.inventory_stock where item_id=(select id from r1902_items where seq=3))),0,'the rejected issue writes no audit event');

-- Transfer: source balance reduced at creation, destination unchanged until
-- confirm, then and only then the destination balance increases.
insert into r1902_transfers (seq, id)
select 1, transfer_id from public.create_inventory_transfer('e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1),4,'surplus to branch two');
select extensions.is((select quantity_on_hand || ':' || version from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),false) limit 1),'10:5','creating the transfer reduces the source balance to ten');
select extensions.is((select count(*)::integer from public.list_inventory_stock('e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1),false)),0,'the destination balance is unchanged after creation (no stock row yet)');
select extensions.is((select status || ':' || version from public.inventory_transfers where id=(select id from r1902_transfers where seq=1)),'SENT:1','the transfer starts SENT at version one');
select extensions.is((select count(*)::integer from public.list_inventory_transfers('e1030000-0000-0000-0000-000000000001','SENT')),1,'the source branch can list its pending transfer');
select extensions.is((select count(*)::integer from public.list_inventory_transfers('e1030000-0000-0000-0000-000000000002','SENT')),1,'the destination branch can list its pending transfer before confirmation');
select extensions.is((select item_code || ':' || quantity::text || ':' || status from public.list_inventory_transfers('e1030000-0000-0000-0000-000000000002','SENT') where transfer_id=(select id from r1902_transfers where seq=1)),'ANESTHETIC:4:SENT','the transfer projection returns the bounded item, quantity, and state');
select extensions.throws_ok($$select public.list_inventory_transfers('e1030000-0000-0000-0000-000000000002','LOST')$$,'22023','invalid input','an invented transfer-list status is rejected');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and movement_type='TRANSFER_OUT' and transfer_id=(select id from r1902_transfers where seq=1)),1,'creation appends exactly one TRANSFER_OUT ledger row at the source');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and movement_type='TRANSFER_IN' and transfer_id=(select id from r1902_transfers where seq=1)),0,'no TRANSFER_IN row exists before confirmation');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.created'),1,'transfer creation writes exactly one inventory.transfer.created audit event');
select extensions.ok((select metadata->>'source'='e1030000-0000-0000-0000-000000000001' and metadata->>'destination'='e1030000-0000-0000-0000-000000000002' and metadata->>'quantity'='4' from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.created' order by occurred_at desc limit 1),'the transfer audit event carries bounded {source, destination, quantity} metadata');
select extensions.throws_ok($$select public.create_inventory_transfer('e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),1,'self transfer')$$,'22023','invalid input','a transfer with identical source and destination is rejected');
select extensions.throws_ok($$select public.create_inventory_transfer('e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000003',(select id from r1902_items where seq=1),1,'foreign destination')$$,'42501','not authorized','a transfer to a foreign-organization branch is rejected');
select extensions.throws_ok($$select public.create_inventory_transfer('e1030000-0000-0000-0000-000000000002','e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1),1,'forged source')$$,'42501','not authorized','a submitted source branch cannot differ from the authorized acting branch');
select extensions.throws_ok($$select public.create_inventory_transfer('e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1),100,'overdraw')$$,'P0001','insufficient stock','a transfer larger than the source balance is rejected');
select extensions.is((select quantity_on_hand || ':' || version from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),false) limit 1),'10:5','the rejected transfer leaves the source balance untouched');

select extensions.throws_ok($$select public.confirm_transfer_receipt('e1030000-0000-0000-0000-000000000001',(select id from r1902_transfers where seq=1),1)$$,'42501','not authorized','only the destination branch may confirm receipt');
select extensions.is((select status || ':' || version from public.inventory_transfers where id=(select id from r1902_transfers where seq=1)),'SENT:1','a denied confirmation leaves the transfer SENT');
select extensions.is((select status from public.confirm_transfer_receipt('e1030000-0000-0000-0000-000000000002',(select id from r1902_transfers where seq=1),1)),'RECEIVED','the destination branch confirm moves the transfer to RECEIVED');
select extensions.is((select quantity_on_hand || ':' || version from public.list_inventory_stock('e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1),false) limit 1),'4:1','confirmation increases the destination balance to four');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and branch_id='e1030000-0000-0000-0000-000000000002' and movement_type='TRANSFER_IN' and transfer_id=(select id from r1902_transfers where seq=1)),1,'confirmation appends exactly one TRANSFER_IN ledger row at the destination');
select extensions.is((select version from public.inventory_transfers where id=(select id from r1902_transfers where seq=1)),2,'confirmation bumps the transfer version');
select extensions.ok((select confirmed_by='e1010000-0000-0000-0000-000000000001' and confirmed_at is not null from public.inventory_transfers where id=(select id from r1902_transfers where seq=1)),'confirmation stamps confirmed_by and confirmed_at');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.received'),1,'confirmation writes exactly one inventory.transfer.received audit event');
select extensions.throws_ok($$select public.confirm_transfer_receipt('e1030000-0000-0000-0000-000000000002',(select id from r1902_transfers where seq=1),2)$$,'P0001','invalid state','a confirmed transfer rejects re-confirmation');
select extensions.throws_ok($$select public.confirm_transfer_receipt('e1030000-0000-0000-0000-000000000001','e1090000-0000-0000-0000-000000000099',1)$$,'42501','not authorized','confirming a missing or foreign transfer is denied');

-- Cancel: reverses the source TRANSFER_OUT back onto the source balance.
insert into r1902_transfers (seq, id)
select 2, transfer_id from public.create_inventory_transfer('e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=2),2,'cover branch two stock');
select extensions.is((select quantity_on_hand || ':' || version from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=2),false) limit 1),'3:2','creating the second transfer reduces the source balance to three');
select extensions.throws_ok($$select public.cancel_inventory_transfer('e1030000-0000-0000-0000-000000000001',(select id from r1902_transfers where seq=2),1,null)$$,'22023','invalid input','a cancellation without a reason is rejected');
select extensions.throws_ok($$select public.cancel_inventory_transfer('e1030000-0000-0000-0000-000000000001',(select id from r1902_transfers where seq=2),2,'stale')$$,'P0001','stale version','a stale version is rejected on cancellation');
select extensions.throws_ok($$select public.cancel_inventory_transfer('e1030000-0000-0000-0000-000000000002',(select id from r1902_transfers where seq=2),1,'forged source')$$,'42501','not authorized','only the source acting branch may cancel a pending transfer');
select extensions.is((select status || ':' || version from public.inventory_transfers where id=(select id from r1902_transfers where seq=2)),'SENT:1','a rejected cancellation leaves the transfer SENT');
select extensions.is((select status from public.cancel_inventory_transfer('e1030000-0000-0000-0000-000000000001',(select id from r1902_transfers where seq=2),1,'shipment not needed')),'CANCELLED','a SENT transfer can be cancelled');
select extensions.is((select quantity_on_hand || ':' || version from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=2),false) limit 1),'5:3','cancelling reverses the source balance back to five');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and branch_id='e1030000-0000-0000-0000-000000000001' and movement_type='ADJUSTMENT' and quantity_delta=2 and transfer_id=(select id from r1902_transfers where seq=2)),1,'cancelling appends an ADJUSTMENT ledger row at the source reversing the transfer');
select extensions.is((select version from public.inventory_transfers where id=(select id from r1902_transfers where seq=2)),2,'cancelling bumps the transfer version');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.cancelled'),1,'cancelling writes exactly one inventory.transfer.cancelled audit event');
select extensions.is((select metadata->>'reason' from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.cancelled' order by occurred_at desc limit 1),'shipment not needed','the cancel audit event carries bounded {reason} metadata');
select extensions.throws_ok($$select public.cancel_inventory_transfer('e1030000-0000-0000-0000-000000000001',(select id from r1902_transfers where seq=2),2,'again')$$,'P0001','invalid state','a cancelled transfer rejects further cancellation');
select extensions.throws_ok($$select public.cancel_inventory_transfer('e1030000-0000-0000-0000-000000000001',(select id from r1902_transfers where seq=1),2,'already received')$$,'P0001','invalid state','a RECEIVED transfer cannot be cancelled');

-- Reads: per-branch stock with derived low-stock, movement ledger, aggregate.
-- Branch-specific low stock: GLOVES has balance 5 at both branches; A Main uses
-- the catalog reorder of 10 (low), A Branch 2 uses its override of 0 (not low).
update public.inventory_stock set reorder_level_override = 0
where organization_id='e1020000-0000-0000-0000-000000000001'
  and branch_id='e1030000-0000-0000-0000-000000000002'
  and item_id=(select id from r1902_items where seq=2);
select extensions.is((select count(*)::integer from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',null,false)),3,'per-branch stock lists every stocked item at the acting branch');
select extensions.is((select low_stock from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=2),false) limit 1),true,'GLOVES at A Main is low against the catalog reorder level');
select extensions.is((select low_stock from public.list_inventory_stock('e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=2),false) limit 1),false,'GLOVES at A Branch 2 is not low against its zero override');
select extensions.is((select count(*)::integer from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',null,true)),1,'the low-only filter at A Main returns exactly the low GLOVES row');
select extensions.is((select count(*)::integer from public.list_inventory_stock('e1030000-0000-0000-0000-000000000002',null,true)),1,'the low-only filter at A Branch 2 returns the received ANESTHETIC row below its reorder');
select extensions.is((select quantity_on_hand from public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),false) limit 1),10,'per-branch stock at A Main reflects the final ANESTHETIC balance');
select extensions.is((select quantity_on_hand from public.list_inventory_stock('e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1),false) limit 1),4,'per-branch stock at A Branch 2 reflects the confirmed transfer receipt');

select extensions.is((select count(*)::integer from public.list_inventory_movements('e1030000-0000-0000-0000-000000000001',null)),9,'the movement ledger at A Main lists all nine ledger rows');
select extensions.is((select count(*)::integer from public.list_inventory_movements('e1030000-0000-0000-0000-000000000002',null)),3,'the movement ledger at A Branch 2 lists its three ledger rows');
select extensions.is((select count(*)::integer from public.list_inventory_movements('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1))),5,'the item filter narrows the ledger to that item');
select extensions.is((select movement_type || ':' || quantity_delta::text || ':' || (transfer_id is not null)::text from public.list_inventory_movements('e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1)) limit 1),'TRANSFER_IN:4:true','the ledger projection exposes the confirmed transfer-in row with its transfer reference');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action like 'inventory.%'),16,'the read projections write no audit events');

-- Aggregate preserves per-branch breakdowns.
select extensions.is((select count(*)::integer from public.get_inventory_aggregate('e1030000-0000-0000-0000-000000000001')),3,'the aggregate returns one row per active item across the organization');
select extensions.is((select total_on_hand::text from public.get_inventory_aggregate('e1030000-0000-0000-0000-000000000001') where item_code='ANESTHETIC'),'14','the aggregate totals the ANESTHETIC balances across both branches');
select extensions.ok((select branches @> '[{"branch":"e1030000-0000-0000-0000-000000000001","quantity":10,"low":false}]'::jsonb
  and branches @> '[{"branch":"e1030000-0000-0000-0000-000000000002","quantity":4,"low":true}]'::jsonb
  and pg_catalog.jsonb_array_length(branches)=2
  from public.get_inventory_aggregate('e1030000-0000-0000-0000-000000000001') where item_code='ANESTHETIC'),'the aggregate preserves the ANESTHETIC per-branch breakdown');
select extensions.ok((select branches @> '[{"branch":"e1030000-0000-0000-0000-000000000001","quantity":5,"low":true}]'::jsonb
  and branches @> '[{"branch":"e1030000-0000-0000-0000-000000000002","quantity":5,"low":false}]'::jsonb
  and pg_catalog.jsonb_array_length(branches)=2
  from public.get_inventory_aggregate('e1030000-0000-0000-0000-000000000001') where item_code='GLOVES'),'the aggregate preserves the GLOVES per-branch low-stock breakdown');

-- Ledger immutability enforced against direct writes.
select extensions.throws_ok($$update public.inventory_movements set reason='tampered' where organization_id='e1020000-0000-0000-0000-000000000001'$$,'23514',null,'direct UPDATE against the movement ledger is rejected');
select extensions.throws_ok($$delete from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001'$$,'23514',null,'direct DELETE against the movement ledger is rejected');

-- Exactly-one-audit-per-mutation summary.
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.item.created'),3,'exactly three item.created audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.item.updated'),1,'exactly one item.updated audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.received'),6,'exactly six stock.received audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.adjusted'),1,'exactly one stock.adjusted audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.issued'),1,'exactly one stock.issued audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.created'),2,'exactly two transfer.created audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.received'),1,'exactly one transfer.received audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.transfer.cancelled'),1,'exactly one transfer.cancelled audit');

-- Permission denials: dentist and receptionist have neither permission; a
-- foreign-organization admin is denied every Org A surface.
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.list_inventory_items('e1030000-0000-0000-0000-000000000001',false)$$,'42501','not authorized','a dentist without inventory.view cannot list items');
select extensions.throws_ok($$select public.list_inventory_stock('e1030000-0000-0000-0000-000000000001',null,false)$$,'42501','not authorized','a dentist without inventory.view cannot read stock');
select extensions.throws_ok($$select public.list_inventory_movements('e1030000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','a dentist without inventory.view cannot read movements');
select extensions.throws_ok($$select public.get_inventory_aggregate('e1030000-0000-0000-0000-000000000001')$$,'42501','not authorized','a dentist without inventory.view cannot read the aggregate');
select extensions.throws_ok($$select public.list_inventory_transfers('e1030000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','a dentist without inventory.view cannot read transfers');
select extensions.throws_ok($$select public.create_inventory_item('e1030000-0000-0000-0000-000000000001','DENTAL','Dental','CONSUMABLE','box',0,false)$$,'42501','not authorized','a dentist without inventory.manage cannot create items');
select extensions.throws_ok($$select public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),1,null,null)$$,'42501','not authorized','a dentist without inventory.manage cannot receive stock');
select extensions.throws_ok($$select public.create_inventory_transfer('e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000002',(select id from r1902_items where seq=1),1,'denied')$$,'42501','not authorized','a dentist without inventory.manage cannot create transfers');
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_inventory_items('e1030000-0000-0000-0000-000000000001',false)$$,'42501','not authorized','a receptionist without inventory.view cannot list items');
select extensions.throws_ok($$select public.adjust_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),1,1,'denied')$$,'42501','not authorized','a receptionist without inventory.manage cannot adjust stock');
select extensions.throws_ok($$select public.confirm_transfer_receipt('e1030000-0000-0000-0000-000000000002',(select id from r1902_transfers where seq=2),1)$$,'42501','not authorized','a receptionist without inventory.manage cannot confirm transfers');
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.list_inventory_items('e1030000-0000-0000-0000-000000000001',false)$$,'42501','not authorized','a foreign-organization admin cannot list Org A items');
select extensions.throws_ok($$select public.create_inventory_item('e1030000-0000-0000-0000-000000000001','INTRUDER','Intruder','CONSUMABLE','box',0,false)$$,'42501','not authorized','a foreign-organization admin cannot create Org A items');
select extensions.throws_ok($$select public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=1),1,null,null)$$,'42501','not authorized','a foreign-organization admin cannot touch Org A stock');
select extensions.throws_ok($$select public.get_inventory_aggregate('e1030000-0000-0000-0000-000000000001')$$,'42501','not authorized','a foreign-organization admin cannot read the Org A aggregate');
select extensions.is((select count(*)::integer from public.create_inventory_item('e1030000-0000-0000-0000-000000000003','FOREIGN','Foreign Item','CONSUMABLE','unit',0,false)),1,'a foreign-organization admin can manage their own organization inventory');
select extensions.is((select count(*)::integer from public.list_inventory_items('e1030000-0000-0000-0000-000000000003',false)),1,'a foreign-organization admin lists only their own organization items');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.item.created'),3,'denied and foreign actors write no Org A audit events');
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000001',true);
select extensions.is((select count(*)::integer from public.list_inventory_items('e1030000-0000-0000-0000-000000000001',false)),3,'Org A still lists exactly its own three items after the foreign test');

-- Audit-rollback: a blocked audit event rolls back the mutation and its ledger row.
insert into r1902_items (seq, id)
select 4, item_id from public.create_inventory_item('e1030000-0000-0000-0000-000000000001','FILM','X-Ray Film','CONSUMABLE','box',0,false);
create function private.r1902_block_inventory_audit() returns trigger language plpgsql as $$begin if new.action='inventory.stock.received' then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger r1902_block_inventory_audit before insert on public.audit_events for each row execute function private.r1902_block_inventory_audit();
select extensions.throws_ok($$select public.receive_stock('e1030000-0000-0000-0000-000000000001',(select id from r1902_items where seq=4),5,null,null)$$,'P0001','audit blocked','a failing inventory.stock.received audit event rejects the receipt');
drop trigger r1902_block_inventory_audit on public.audit_events;
drop function private.r1902_block_inventory_audit();
select extensions.is((select count(*)::integer from public.inventory_stock where organization_id='e1020000-0000-0000-0000-000000000001' and item_id=(select id from r1902_items where seq=4)),0,'a blocked audit rolls back the stock row');
select extensions.is((select count(*)::integer from public.inventory_movements where organization_id='e1020000-0000-0000-0000-000000000001' and item_id=(select id from r1902_items where seq=4)),0,'a blocked audit rolls back the movement ledger row');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='inventory.stock.received' and entity_id in (select id from public.inventory_stock where item_id=(select id from r1902_items where seq=4))),0,'a blocked audit rolls back its own audit row');

-- Equipment remains separate from consumable stock at the database boundary.
insert into public.inventory_items (id,organization_id,code,name,category,unit)
values ('e1080000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','DENTAL_CHAIR','Dental Chair','EQUIPMENT','unit');
select extensions.throws_ok($$select public.receive_stock('e1030000-0000-0000-0000-000000000001','e1080000-0000-0000-0000-000000000001',1,null,null)$$,'23514','stock is limited to consumable items','equipment cannot receive a consumable stock balance');
select extensions.throws_ok($$update public.inventory_items set category='EQUIPMENT' where id=(select id from r1902_items where seq=1)$$,'23514','an item with stock history must remain consumable','a consumable with stock history cannot be reclassified as equipment');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
