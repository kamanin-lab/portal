


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, company_name, email_notifications)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'company_name', true)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_profile_list_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  removed_task_ids text[];
BEGIN
  IF OLD.clickup_list_ids IS NOT DISTINCT FROM NEW.clickup_list_ids THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(clickup_id) INTO removed_task_ids
  FROM public.task_cache
  WHERE profile_id = NEW.id
    AND list_id IS NOT NULL
    AND NOT (list_id = ANY(
      SELECT jsonb_array_elements_text(
        COALESCE(NEW.clickup_list_ids, '[]'::jsonb)
      )
    ));

  IF removed_task_ids IS NULL OR array_length(removed_task_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.read_receipts
  WHERE profile_id = NEW.id
    AND context LIKE 'task:%'
    AND REPLACE(context, 'task:', '') = ANY(removed_task_ids);

  DELETE FROM public.notifications
  WHERE profile_id = NEW.id
    AND task_id = ANY(removed_task_ids);

  DELETE FROM public.comment_cache
  WHERE profile_id = NEW.id
    AND task_id = ANY(removed_task_ids);

  DELETE FROM public.task_cache
  WHERE profile_id = NEW.id
    AND clickup_id = ANY(removed_task_ids);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_profile_list_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preserve_creator_on_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.created_by_name IS NOT NULL AND NEW.created_by_name IS NULL THEN
    NEW.created_by_name := OLD.created_by_name;
  END IF;
  IF OLD.created_by_user_id IS NOT NULL AND NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := OLD.created_by_user_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."preserve_creator_on_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_activity_decrease"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.last_activity_at := COALESCE(NEW.last_activity_at, NOW());
  ELSE
    NEW.last_activity_at := GREATEST(
      OLD.last_activity_at,
      COALESCE(NEW.last_activity_at, OLD.last_activity_at)
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_activity_decrease"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."comment_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_comment_id" "text" NOT NULL,
    "task_id" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "comment_text" "text" NOT NULL,
    "author_id" integer NOT NULL,
    "author_name" "text" NOT NULL,
    "author_email" "text",
    "author_avatar" "text",
    "clickup_created_at" timestamp with time zone NOT NULL,
    "last_synced" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "display_text" "text",
    "is_from_portal" boolean DEFAULT false,
    "attachments" "jsonb"
);

ALTER TABLE ONLY "public"."comment_cache" REPLICA IDENTITY FULL;


ALTER TABLE "public"."comment_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "task_id" "text",
    "comment_id" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['team_reply'::"text", 'status_change'::"text"])))
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "company_name" "text",
    "clickup_list_ids" "text"[],
    "email_notifications" boolean DEFAULT true,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "clickup_chat_channel_id" "text",
    "support_task_id" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."clickup_list_ids" IS 'ClickUp List IDs for Tasks feature (individual task tracking)';



CREATE TABLE IF NOT EXISTS "public"."read_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "context_type" "text" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."read_receipts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."read_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_id" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" NOT NULL,
    "status_color" "text",
    "priority" "text",
    "priority_color" "text",
    "due_date" timestamp with time zone,
    "clickup_url" "text",
    "list_id" "text",
    "list_name" "text",
    "raw_data" "jsonb",
    "last_synced" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_visible" boolean DEFAULT false,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid",
    "created_by_name" "text"
);


ALTER TABLE "public"."task_cache" OWNER TO "postgres";


ALTER TABLE ONLY "public"."comment_cache"
    ADD CONSTRAINT "comment_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."read_receipts"
    ADD CONSTRAINT "read_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."read_receipts"
    ADD CONSTRAINT "read_receipts_profile_id_context_type_key" UNIQUE ("profile_id", "context_type");



ALTER TABLE ONLY "public"."task_cache"
    ADD CONSTRAINT "task_cache_clickup_id_profile_id_key" UNIQUE ("clickup_id", "profile_id");



ALTER TABLE ONLY "public"."task_cache"
    ADD CONSTRAINT "task_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_cache"
    ADD CONSTRAINT "unique_comment_per_user" UNIQUE ("clickup_comment_id", "profile_id");



CREATE INDEX "idx_comment_cache_task_profile" ON "public"."comment_cache" USING "btree" ("task_id", "profile_id");



CREATE INDEX "idx_task_cache_activity_sort" ON "public"."task_cache" USING "btree" ("profile_id", "is_visible", "last_activity_at" DESC);



CREATE INDEX "idx_task_cache_clickup_id" ON "public"."task_cache" USING "btree" ("clickup_id");



CREATE INDEX "idx_task_cache_profile_id" ON "public"."task_cache" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "task_cache_clickup_profile_uq" ON "public"."task_cache" USING "btree" ("clickup_id", "profile_id");



CREATE OR REPLACE TRIGGER "on_profile_list_change" AFTER UPDATE OF "clickup_list_ids" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_profile_list_change"();



CREATE OR REPLACE TRIGGER "task_cache_activity_guard" BEFORE INSERT OR UPDATE ON "public"."task_cache" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_activity_decrease"();



CREATE OR REPLACE TRIGGER "trg_preserve_creator" BEFORE UPDATE ON "public"."task_cache" FOR EACH ROW EXECUTE FUNCTION "public"."preserve_creator_on_update"();



ALTER TABLE ONLY "public"."comment_cache"
    ADD CONSTRAINT "comment_cache_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."read_receipts"
    ADD CONSTRAINT "read_receipts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_cache"
    ADD CONSTRAINT "task_cache_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own cached comments" ON "public"."comment_cache" FOR DELETE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can delete their own cached tasks" ON "public"."task_cache" FOR DELETE USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own cached comments" ON "public"."comment_cache" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own cached tasks" ON "public"."task_cache" FOR INSERT WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own read receipts" ON "public"."read_receipts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can read own cached comments" ON "public"."comment_cache" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can update own cached comments" ON "public"."comment_cache" FOR UPDATE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own read receipts" ON "public"."read_receipts" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can update their own cached tasks" ON "public"."task_cache" FOR UPDATE USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can update their own read receipts" ON "public"."read_receipts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "profile_id")) WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can upsert own read receipts" ON "public"."read_receipts" FOR UPDATE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own read receipts" ON "public"."read_receipts" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can view their own cached tasks" ON "public"."task_cache" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can view their own read receipts" ON "public"."read_receipts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "profile_id"));



ALTER TABLE "public"."comment_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_cache_delete" ON "public"."comment_cache" FOR DELETE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "comment_cache_insert" ON "public"."comment_cache" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "comment_cache_select" ON "public"."comment_cache" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "comment_cache_update" ON "public"."comment_cache" FOR UPDATE USING (("auth"."uid"() = "profile_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "profile_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."read_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_cache_delete" ON "public"."task_cache" FOR DELETE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "task_cache_insert" ON "public"."task_cache" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "task_cache_select" ON "public"."task_cache" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "task_cache_update" ON "public"."task_cache" FOR UPDATE USING (("auth"."uid"() = "profile_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_profile_list_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_profile_list_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_profile_list_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."preserve_creator_on_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."preserve_creator_on_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."preserve_creator_on_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_activity_decrease"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_activity_decrease"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_activity_decrease"() TO "service_role";



GRANT ALL ON TABLE "public"."comment_cache" TO "anon";
GRANT ALL ON TABLE "public"."comment_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_cache" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."read_receipts" TO "anon";
GRANT ALL ON TABLE "public"."read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."read_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."task_cache" TO "anon";
GRANT ALL ON TABLE "public"."task_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."task_cache" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







