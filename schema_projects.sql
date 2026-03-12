-- =============================================================================
-- KAMANIN Portal: Project Experience Tables
-- Run AFTER schema.sql (depends on profiles table)
-- =============================================================================

-- 1. project_config — Maps a ClickUp List to a Portal Project
CREATE TABLE IF NOT EXISTS "public"."project_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_list_id" "text" NOT NULL,
    "clickup_phase_field_id" "text",
    "name" "text" NOT NULL,
    "type" "text" NOT NULL DEFAULT '',
    "client_name" "text" NOT NULL DEFAULT '',
    "client_initials" "text" NOT NULL DEFAULT '',
    "start_date" "text",
    "target_date" "text",
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."project_config" OWNER TO "postgres";

ALTER TABLE ONLY "public"."project_config"
    ADD CONSTRAINT "project_config_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."project_config"
    ADD CONSTRAINT "project_config_clickup_list_id_key" UNIQUE ("clickup_list_id");


-- 2. project_access — Which profiles can see which projects
CREATE TABLE IF NOT EXISTS "public"."project_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_config_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."project_access" OWNER TO "postgres";

ALTER TABLE ONLY "public"."project_access"
    ADD CONSTRAINT "project_access_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."project_access"
    ADD CONSTRAINT "project_access_project_config_id_profile_id_key" UNIQUE ("project_config_id", "profile_id");

ALTER TABLE ONLY "public"."project_access"
    ADD CONSTRAINT "project_access_project_config_id_fkey" FOREIGN KEY ("project_config_id") REFERENCES "public"."project_config"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."project_access"
    ADD CONSTRAINT "project_access_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


-- 3. chapter_config — Phase dropdown option → Chapter + portal enrichment
CREATE TABLE IF NOT EXISTS "public"."chapter_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_config_id" "uuid" NOT NULL,
    "clickup_cf_option_id" "text",
    "title" "text" NOT NULL,
    "sort_order" integer NOT NULL DEFAULT 0,
    "narrative" "text" NOT NULL DEFAULT '',
    "next_narrative" "text" NOT NULL DEFAULT '',
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."chapter_config" OWNER TO "postgres";

ALTER TABLE ONLY "public"."chapter_config"
    ADD CONSTRAINT "chapter_config_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."chapter_config"
    ADD CONSTRAINT "chapter_config_project_config_id_fkey" FOREIGN KEY ("project_config_id") REFERENCES "public"."project_config"("id") ON DELETE CASCADE;


-- 4. step_enrichment — Portal-only metadata per step (AI-generated or manual)
CREATE TABLE IF NOT EXISTS "public"."step_enrichment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_task_id" "text" NOT NULL,
    "why_it_matters" "text" NOT NULL DEFAULT '',
    "what_becomes_fixed" "text" NOT NULL DEFAULT '',
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."step_enrichment" OWNER TO "postgres";

ALTER TABLE ONLY "public"."step_enrichment"
    ADD CONSTRAINT "step_enrichment_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."step_enrichment"
    ADD CONSTRAINT "step_enrichment_clickup_task_id_key" UNIQUE ("clickup_task_id");


-- 5. project_task_cache — Cached ClickUp tasks for projects (separate from ticket task_cache)
CREATE TABLE IF NOT EXISTS "public"."project_task_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_id" "text" NOT NULL,
    "project_config_id" "uuid" NOT NULL,
    "chapter_config_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" NOT NULL,
    "status_color" "text",
    "due_date" "text",
    "assignees" "jsonb" DEFAULT '[]'::"jsonb",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "raw_data" "jsonb",
    "is_visible" boolean NOT NULL DEFAULT true,
    "last_synced" timestamp with time zone DEFAULT "now"(),
    "last_activity_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."project_task_cache" REPLICA IDENTITY FULL;

ALTER TABLE "public"."project_task_cache" OWNER TO "postgres";

ALTER TABLE ONLY "public"."project_task_cache"
    ADD CONSTRAINT "project_task_cache_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."project_task_cache"
    ADD CONSTRAINT "project_task_cache_clickup_id_project_config_id_key" UNIQUE ("clickup_id", "project_config_id");

ALTER TABLE ONLY "public"."project_task_cache"
    ADD CONSTRAINT "project_task_cache_project_config_id_fkey" FOREIGN KEY ("project_config_id") REFERENCES "public"."project_config"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."project_task_cache"
    ADD CONSTRAINT "project_task_cache_chapter_config_id_fkey" FOREIGN KEY ("chapter_config_id") REFERENCES "public"."chapter_config"("id") ON DELETE SET NULL;

CREATE INDEX "idx_project_task_cache_project" ON "public"."project_task_cache" USING "btree" ("project_config_id");
CREATE INDEX "idx_project_task_cache_chapter" ON "public"."project_task_cache" USING "btree" ("chapter_config_id");


-- =============================================================================
-- 6. ALTER notifications — extend type constraint + add project navigation columns
-- =============================================================================

ALTER TABLE "public"."notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_type_check"
    CHECK ("type" = ANY (ARRAY[
        'team_reply'::"text",
        'status_change'::"text",
        'step_ready'::"text",
        'project_reply'::"text",
        'project_update'::"text"
    ]));

ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "project_config_id" "uuid" REFERENCES "public"."project_config"("id") ON DELETE SET NULL;
ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "clickup_task_id" "text";


-- =============================================================================
-- 7. RLS Policies
-- =============================================================================

-- project_config: readable by users with project_access
ALTER TABLE "public"."project_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_config_select" ON "public"."project_config"
    FOR SELECT USING (
        "id" IN (SELECT "project_config_id" FROM "public"."project_access" WHERE "profile_id" = "auth"."uid"())
    );

-- project_access: users see only their own access rows
ALTER TABLE "public"."project_access" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_access_select" ON "public"."project_access"
    FOR SELECT USING ("profile_id" = "auth"."uid"());

-- chapter_config: readable via project_access
ALTER TABLE "public"."chapter_config" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chapter_config_select" ON "public"."chapter_config"
    FOR SELECT USING (
        "project_config_id" IN (SELECT "project_config_id" FROM "public"."project_access" WHERE "profile_id" = "auth"."uid"())
    );

-- step_enrichment: readable by anyone with access to the task's project
-- (uses project_task_cache to resolve clickup_task_id → project_config_id → project_access)
ALTER TABLE "public"."step_enrichment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "step_enrichment_select" ON "public"."step_enrichment"
    FOR SELECT USING (
        "clickup_task_id" IN (
            SELECT "clickup_id" FROM "public"."project_task_cache"
            WHERE "project_config_id" IN (
                SELECT "project_config_id" FROM "public"."project_access" WHERE "profile_id" = "auth"."uid"()
            )
        )
    );

-- project_task_cache: readable via project_access
ALTER TABLE "public"."project_task_cache" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_task_cache_select" ON "public"."project_task_cache"
    FOR SELECT USING (
        "project_config_id" IN (SELECT "project_config_id" FROM "public"."project_access" WHERE "profile_id" = "auth"."uid"())
    );


-- =============================================================================
-- 8. Grants (match existing pattern from schema.sql)
-- =============================================================================

GRANT ALL ON TABLE "public"."project_config" TO "anon";
GRANT ALL ON TABLE "public"."project_config" TO "authenticated";
GRANT ALL ON TABLE "public"."project_config" TO "service_role";

GRANT ALL ON TABLE "public"."project_access" TO "anon";
GRANT ALL ON TABLE "public"."project_access" TO "authenticated";
GRANT ALL ON TABLE "public"."project_access" TO "service_role";

GRANT ALL ON TABLE "public"."chapter_config" TO "anon";
GRANT ALL ON TABLE "public"."chapter_config" TO "authenticated";
GRANT ALL ON TABLE "public"."chapter_config" TO "service_role";

GRANT ALL ON TABLE "public"."step_enrichment" TO "anon";
GRANT ALL ON TABLE "public"."step_enrichment" TO "authenticated";
GRANT ALL ON TABLE "public"."step_enrichment" TO "service_role";

GRANT ALL ON TABLE "public"."project_task_cache" TO "anon";
GRANT ALL ON TABLE "public"."project_task_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."project_task_cache" TO "service_role";
