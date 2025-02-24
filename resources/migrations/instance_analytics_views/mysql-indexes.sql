-- audit_log
create index idx_audit_log_entity_qualified_id
    on audit_log ((case
           when model = 'Dataset' then (concat('card_', model_id))
           when model_id is null then null
           else (concat(lower(model), '_', model_id))
           end));

-- activity
create index idx_activity_entity_qualified_id
    on activity ((
            case when model = 'Dataset' then (concat('card_', model_id))
           when model_id is null then null
           else (concat(lower(model), '_', model_id))
           end));

-- field
create index idx_field_entity_qualified_id
    on metabase_field((concat('field_', id)));

-- query_execution
create index idx_query_execution_card_qualified_id
    on query_execution((concat('card_', card_id)));

-- user
create index idx_user_qualified_id
    on core_user((concat('user_', id)));

create index idx_user_full_name
    on core_user((concat(first_name, ' ', last_name)));

-- view_log
create index idx_view_log_timestamp
    on view_log(timestamp);


create index idx_view_log_entity_qualified_id
    on view_log((concat(model, '_', model_id)));