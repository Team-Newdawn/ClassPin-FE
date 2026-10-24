**ClassPin 운영 DB SQL 근거 기록 — 2026-08-31**

읽기 전용 조사로 수집한 정의다. 변경안이나 재실행 가능한 migration 묶음이 아니다. 함수 정의에 CREATE 문이 있어도 이번 조사에서는 실행하지 않았다. public 전체를 수집하므로 과거 PinFeedback 함수도 포함된다. 해석은 상세 분석 문서의 ClassPin 경계를 따른다. 연결된 JSON의 테이블 행 수는 도구의 추정치, counts와 quality의 행 수는 SELECT 실측치다.

**public.courses — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| owner_id | uuid | 아니오 |  |
| title | text | 아니오 |  |
| subject_domain | text | 예 |  |
| visibility | text | 아니오 | 'link'::text |
| created_at | timestamptz | 아니오 | now() |
| folder_id | uuid | 예 |  |

**public.lectures — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| course_id | uuid | 아니오 |  |
| seq_no | int4 | 아니오 | 1 |
| title | text | 아니오 |  |
| join_code | text | 아니오 |  |
| interaction_mode | text | 아니오 | 'live'::text |
| status | lecture_status | 아니오 | 'live'::lecture_status |
| current_page | int4 | 아니오 | 0 |
| started_at | timestamptz | 예 |  |
| ended_at | timestamptz | 예 |  |
| created_at | timestamptz | 아니오 | now() |
| show_question_pins | bool | 아니오 | true |
| presentation_qr_position | text | 아니오 | 'bottom-right'::text |
| show_presentation_qr | bool | 아니오 | true |
| presentation_interactions | bool | 아니오 | true |
| question_categories | jsonb | 아니오 | '{"why": {"label": "", "enabled": true, "archived": false}, "error": {"label": "", "enabled": true, "archived": false}, "concept": {"label": "", "enabled": true, "archived": false}, "example": {"label": "", "enabled": true, "archived": false}, "important": {"label": "", "enabled": true, "archived": false}}'::jsonb |

**public.materials — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| course_id | uuid | 아니오 |  |
| lecture_id | uuid | 아니오 |  |
| type | text | 아니오 |  |
| file_name | text | 아니오 |  |
| created_at | timestamptz | 아니오 | now() |

**public.material_versions — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| material_id | uuid | 아니오 |  |
| version_no | int4 | 아니오 | 1 |
| source_path | text | 아니오 |  |
| checksum | text | 예 |  |
| created_at | timestamptz | 아니오 | now() |

**public.slides — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| material_version_id | uuid | 아니오 |  |
| page_index | int4 | 아니오 |  |
| image_path | text | 아니오 |  |
| width_px | int4 | 예 |  |
| height_px | int4 | 예 |  |
| created_at | timestamptz | 아니오 | now() |

**public.region_anchors — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| slide_id | uuid | 아니오 |  |
| material_version_id | uuid | 아니오 |  |
| kind | text | 아니오 | 'point'::text |
| coords | jsonb | 아니오 |  |
| created_by | text | 아니오 | 'user'::text |
| created_at | timestamptz | 아니오 | now() |

**public.questions — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| course_id | uuid | 아니오 |  |
| lecture_id | uuid | 아니오 |  |
| slide_id | uuid | 예 |  |
| region_id | uuid | 예 |  |
| author_id | uuid | 예 |  |
| is_anonymous | bool | 아니오 | true |
| category | text | 아니오 | 'concept'::text |
| raw_text | text | 아니오 |  |
| status | question_status | 아니오 | 'unanswered'::question_status |
| occurred_in | text | 아니오 | 'live'::text |
| created_at | timestamptz | 아니오 | now() |
| updated_at | timestamptz | 아니오 | now() |
| reaction_count | int4 | 아니오 | 0 |
| marker | text | 아니오 | 'pin'::text |

**public.answers — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| question_id | uuid | 아니오 |  |
| author_id | uuid | 아니오 |  |
| body | text | 아니오 |  |
| visibility | text | 아니오 | 'participants'::text |
| is_ai_generated | bool | 아니오 | false |
| source_chunk_ids | _uuid | 예 |  |
| created_at | timestamptz | 아니오 | now() |

**public.course_brain_memory — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| course_id | uuid | 아니오 |  |
| lecture_id | uuid | 예 |  |
| chunk_type | text | 아니오 |  |
| source_id | uuid | 예 |  |
| content | text | 아니오 |  |
| embedding | vector | 예 |  |
| reuse_consent | bool | 아니오 | false |
| created_at | timestamptz | 아니오 | now() |

**public.profiles — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 |  |
| role | user_role | 아니오 | 'participant'::user_role |
| email | text | 예 |  |
| display_name | text | 예 |  |
| avatar_url | text | 예 |  |
| created_at | timestamptz | 아니오 | now() |
| updated_at | timestamptz | 아니오 | now() |

**public.campaigns — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| owner_id | uuid | 아니오 |  |
| title | text | 아니오 |  |
| guide_text | text | 예 |  |
| join_code | text | 아니오 |  |
| image_path | text | 예 |  |
| image_width | int4 | 예 |  |
| image_height | int4 | 예 |  |
| status | campaign_status | 아니오 | 'live'::campaign_status |
| created_at | timestamptz | 아니오 | now() |
| updated_at | timestamptz | 아니오 | now() |
| audience_groups | _text | 아니오 | '{}'::text[] |
| show_presentation_qr | bool | 아니오 | true |
| presentation_qr_position | text | 아니오 | 'bottom-right'::text |
| feedback_categories | jsonb | 아니오 | '{"bug": {"label": "", "enabled": true}, "idea": {"label": "", "enabled": true}, "praise": {"label": "", "enabled": true}, "improve": {"label": "", "enabled": true}, "confusing": {"label": "", "enabled": true}}'::jsonb |
| folder_id | uuid | 예 |  |
| show_presentation_pin_status | bool | 아니오 | true |
| presentation_pin_status_position | text | 아니오 | 'top-right'::text |
| presentation_autoplay | bool | 아니오 | true |

**public.feedback_pins — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| campaign_id | uuid | 아니오 |  |
| author_id | uuid | 예 |  |
| is_anonymous | bool | 아니오 | true |
| x | numeric | 아니오 |  |
| y | numeric | 아니오 |  |
| category | text | 예 |  |
| body | text | 아니오 |  |
| hidden | bool | 아니오 | false |
| created_at | timestamptz | 아니오 | now() |
| updated_at | timestamptz | 아니오 | now() |
| page_index | int4 | 아니오 | 0 |
| marker | text | 아니오 | 'pin'::text |
| reaction_count | int4 | 아니오 | 0 |

**public.slide_instructor_notes — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| slide_id | uuid | 아니오 |  |
| body | text | 아니오 | ''::text |
| created_at | timestamptz | 아니오 | now() |
| updated_at | timestamptz | 아니오 | now() |

**public.campaign_pages — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| campaign_id | uuid | 아니오 |  |
| page_index | int4 | 아니오 |  |
| image_path | text | 아니오 |  |
| image_width | int4 | 아니오 |  |
| image_height | int4 | 아니오 |  |
| created_at | timestamptz | 아니오 | now() |
| audience_groups | _text | 아니오 | '{}'::text[] |

**public.session_folders — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| owner_id | uuid | 아니오 |  |
| name | text | 아니오 |  |
| created_at | timestamptz | 아니오 | now() |
| color_index | int2 | 아니오 | 0 |

**public.feedback_pin_reactions — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| pin_id | uuid | 아니오 |  |
| reactor_id | uuid | 아니오 |  |
| created_at | timestamptz | 아니오 | now() |

**public.platform_experience_responses — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| id | uuid | 아니오 | gen_random_uuid() |
| lecture_id | uuid | 예 |  |
| campaign_id | uuid | 예 |  |
| author_id | uuid | 예 |  |
| experience | text | 아니오 |  |
| improvement | text | 아니오 |  |
| created_at | timestamptz | 아니오 | now() |

**public.question_reactions — RLS true**

| 열 | 자료형 | NULL 허용 | 기본값 |
| --- | --- | --- | --- |
| question_id | uuid | 아니오 |  |
| reactor_id | uuid | 아니오 |  |
| created_at | timestamptz | 아니오 | now() |

**제약 정의**

```sql
-- public.answers / answers_body_check
CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)));

-- public.answers / answers_visibility_check
CHECK ((visibility = ANY (ARRAY['private'::text, 'participants'::text, 'public'::text])));

-- public.answers / answers_author_id_fkey
FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.answers / answers_question_id_fkey
FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

-- public.answers / answers_pkey
PRIMARY KEY (id);

-- public.campaign_pages / campaign_pages_audience_groups_valid
CHECK (private.valid_campaign_audience_groups(audience_groups));

-- public.campaign_pages / campaign_pages_image_height_check
CHECK ((image_height > 0));

-- public.campaign_pages / campaign_pages_image_width_check
CHECK ((image_width > 0));

-- public.campaign_pages / campaign_pages_page_index_check
CHECK ((page_index >= 0));

-- public.campaign_pages / campaign_pages_campaign_id_fkey
FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- public.campaign_pages / campaign_pages_pkey
PRIMARY KEY (id);

-- public.campaign_pages / campaign_pages_campaign_id_page_index_key
UNIQUE (campaign_id, page_index);

-- public.campaigns / campaigns_audience_groups_valid
CHECK (private.valid_campaign_audience_groups(audience_groups));

-- public.campaigns / campaigns_feedback_categories_valid
CHECK (private.feedback_categories_are_valid(feedback_categories));

-- public.campaigns / campaigns_guide_text_check
CHECK (((guide_text IS NULL) OR (char_length(guide_text) <= 300)));

-- public.campaigns / campaigns_image_height_check
CHECK (((image_height IS NULL) OR (image_height > 0)));

-- public.campaigns / campaigns_image_width_check
CHECK (((image_width IS NULL) OR (image_width > 0)));

-- public.campaigns / campaigns_join_code_check
CHECK ((join_code ~ '^[A-Z0-9]{4,10}$'::text));

-- public.campaigns / campaigns_presentation_pin_status_position_check
CHECK ((presentation_pin_status_position = ANY (ARRAY['top-left'::text, 'top-right'::text, 'bottom-left'::text, 'bottom-right'::text])));

-- public.campaigns / campaigns_presentation_qr_position_check
CHECK ((presentation_qr_position = ANY (ARRAY['top-left'::text, 'top-right'::text, 'bottom-left'::text, 'bottom-right'::text])));

-- public.campaigns / campaigns_title_check
CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)));

-- public.campaigns / campaigns_folder_owner_fk
FOREIGN KEY (folder_id, owner_id) REFERENCES session_folders(id, owner_id) ON DELETE SET NULL (folder_id);

-- public.campaigns / campaigns_owner_id_fkey
FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.campaigns / campaigns_pkey
PRIMARY KEY (id);

-- public.campaigns / campaigns_join_code_key
UNIQUE (join_code);

-- public.course_brain_memory / course_brain_memory_chunk_type_check
CHECK ((chunk_type = ANY (ARRAY['question'::text, 'answer'::text, 'material_text'::text, 'slide_caption'::text, 'cluster_summary'::text, 'insight'::text])));

-- public.course_brain_memory / course_brain_memory_course_id_fkey
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

-- public.course_brain_memory / course_brain_memory_lecture_id_fkey
FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE;

-- public.course_brain_memory / course_brain_memory_pkey
PRIMARY KEY (id);

-- public.courses / courses_title_check
CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)));

-- public.courses / courses_visibility_check
CHECK ((visibility = ANY (ARRAY['private'::text, 'link'::text, 'public'::text])));

-- public.courses / courses_folder_owner_fk
FOREIGN KEY (folder_id, owner_id) REFERENCES session_folders(id, owner_id) ON DELETE SET NULL (folder_id);

-- public.courses / courses_owner_id_fkey
FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.courses / courses_pkey
PRIMARY KEY (id);

-- public.feedback_pin_reactions / feedback_pin_reactions_pin_id_fkey
FOREIGN KEY (pin_id) REFERENCES feedback_pins(id) ON DELETE CASCADE;

-- public.feedback_pin_reactions / feedback_pin_reactions_reactor_id_fkey
FOREIGN KEY (reactor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.feedback_pin_reactions / feedback_pin_reactions_pkey
PRIMARY KEY (pin_id, reactor_id);

-- public.feedback_pins / feedback_pins_body_check
CHECK (((char_length(body) >= 1) AND (char_length(body) <= 200)));

-- public.feedback_pins / feedback_pins_marker_check
CHECK ((marker = ANY (ARRAY['pin'::text, 'question'::text, 'smile'::text, 'idea'::text])));

-- public.feedback_pins / feedback_pins_page_index_check
CHECK ((page_index >= 0));

-- public.feedback_pins / feedback_pins_reaction_count_check
CHECK ((reaction_count >= 0));

-- public.feedback_pins / feedback_pins_x_check
CHECK (((x >= (0)::numeric) AND (x <= (1)::numeric)));

-- public.feedback_pins / feedback_pins_y_check
CHECK (((y >= (0)::numeric) AND (y <= (1)::numeric)));

-- public.feedback_pins / feedback_pins_author_id_fkey
FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- public.feedback_pins / feedback_pins_campaign_id_fkey
FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- public.feedback_pins / feedback_pins_pkey
PRIMARY KEY (id);

-- public.lectures / lectures_current_page_check
CHECK ((current_page >= 0));

-- public.lectures / lectures_interaction_mode_check
CHECK ((interaction_mode = ANY (ARRAY['live'::text, 'async'::text, 'hybrid'::text])));

-- public.lectures / lectures_join_code_check
CHECK ((join_code ~ '^[A-Z0-9]{6,10}$'::text));

-- public.lectures / lectures_presentation_qr_position_check
CHECK ((presentation_qr_position = ANY (ARRAY['top-left'::text, 'top-right'::text, 'bottom-left'::text, 'bottom-right'::text])));

-- public.lectures / lectures_seq_no_check
CHECK ((seq_no > 0));

-- public.lectures / lectures_title_check
CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)));

-- public.lectures / lectures_course_id_fkey
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

-- public.lectures / lectures_pkey
PRIMARY KEY (id);

-- public.lectures / lectures_course_id_seq_no_key
UNIQUE (course_id, seq_no);

-- public.lectures / lectures_join_code_key
UNIQUE (join_code);

-- public.material_versions / material_versions_version_no_check
CHECK ((version_no > 0));

-- public.material_versions / material_versions_material_id_fkey
FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;

-- public.material_versions / material_versions_pkey
PRIMARY KEY (id);

-- public.material_versions / material_versions_material_id_version_no_key
UNIQUE (material_id, version_no);

-- public.materials / materials_type_check
CHECK ((type = ANY (ARRAY['slide_deck'::text, 'pdf'::text, 'image'::text])));

-- public.materials / materials_course_id_fkey
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

-- public.materials / materials_lecture_id_fkey
FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE;

-- public.materials / materials_pkey
PRIMARY KEY (id);

-- public.platform_experience_responses / platform_experience_response_source
CHECK ((num_nonnulls(lecture_id, campaign_id) = 1));

-- public.platform_experience_responses / platform_experience_responses_experience_check
CHECK (((char_length(experience) >= 1) AND (char_length(experience) <= 1000)));

-- public.platform_experience_responses / platform_experience_responses_improvement_check
CHECK (((char_length(improvement) >= 1) AND (char_length(improvement) <= 1000)));

-- public.platform_experience_responses / platform_experience_responses_author_id_fkey
FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- public.platform_experience_responses / platform_experience_responses_campaign_id_fkey
FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- public.platform_experience_responses / platform_experience_responses_lecture_id_fkey
FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE;

-- public.platform_experience_responses / platform_experience_responses_pkey
PRIMARY KEY (id);

-- public.profiles / profiles_id_fkey
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.profiles / profiles_pkey
PRIMARY KEY (id);

-- public.question_reactions / question_reactions_question_id_fkey
FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

-- public.question_reactions / question_reactions_reactor_id_fkey
FOREIGN KEY (reactor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.question_reactions / question_reactions_pkey
PRIMARY KEY (question_id, reactor_id);

-- public.questions / question_region_slide
CHECK (((region_id IS NULL) OR (slide_id IS NOT NULL)));

-- public.questions / questions_marker_check
CHECK ((marker = ANY (ARRAY['pin'::text, 'question'::text, 'smile'::text, 'idea'::text])));

-- public.questions / questions_occurred_in_check
CHECK ((occurred_in = ANY (ARRAY['live'::text, 'post'::text])));

-- public.questions / questions_raw_text_check
CHECK (((char_length(raw_text) >= 1) AND (char_length(raw_text) <= 300)));

-- public.questions / questions_reaction_count_check
CHECK ((reaction_count >= 0));

-- public.questions / questions_author_id_fkey
FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- public.questions / questions_course_id_fkey
FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

-- public.questions / questions_lecture_id_fkey
FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE;

-- public.questions / questions_region_id_fkey
FOREIGN KEY (region_id) REFERENCES region_anchors(id) ON DELETE SET NULL;

-- public.questions / questions_slide_id_fkey
FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE SET NULL;

-- public.questions / questions_pkey
PRIMARY KEY (id);

-- public.region_anchors / region_anchors_created_by_check
CHECK ((created_by = ANY (ARRAY['user'::text, 'ai'::text, 'admin'::text])));

-- public.region_anchors / region_anchors_kind_check
CHECK ((kind = ANY (ARRAY['point'::text, 'box'::text, 'polygon'::text, 'path'::text])));

-- public.region_anchors / region_box_range
CHECK (((kind <> 'box'::text) OR COALESCE(((jsonb_typeof((coords -> 'x'::text)) = 'number'::text) AND (jsonb_typeof((coords -> 'y'::text)) = 'number'::text) AND (jsonb_typeof((coords -> 'width'::text)) = 'number'::text) AND (jsonb_typeof((coords -> 'height'::text)) = 'number'::text) AND ((((coords ->> 'x'::text))::numeric >= (0)::numeric) AND (((coords ->> 'x'::text))::numeric <= (1)::numeric)) AND ((((coords ->> 'y'::text))::numeric >= (0)::numeric) AND (((coords ->> 'y'::text))::numeric <= (1)::numeric)) AND (((coords ->> 'width'::text))::numeric > (0)::numeric) AND (((coords ->> 'height'::text))::numeric > (0)::numeric) AND ((((coords ->> 'x'::text))::numeric + ((coords ->> 'width'::text))::numeric) <= (1)::numeric) AND ((((coords ->> 'y'::text))::numeric + ((coords ->> 'height'::text))::numeric) <= (1)::numeric)), false)));

-- public.region_anchors / region_path_range
CHECK (((kind <> 'path'::text) OR private.valid_normalized_path(coords)));

-- public.region_anchors / region_point_range
CHECK (((kind <> 'point'::text) OR ((jsonb_typeof((coords -> 'x'::text)) = 'number'::text) AND (jsonb_typeof((coords -> 'y'::text)) = 'number'::text) AND ((((coords ->> 'x'::text))::numeric >= (0)::numeric) AND (((coords ->> 'x'::text))::numeric <= (1)::numeric)) AND ((((coords ->> 'y'::text))::numeric >= (0)::numeric) AND (((coords ->> 'y'::text))::numeric <= (1)::numeric)))));

-- public.region_anchors / region_user_supported_shape
CHECK (((created_by <> 'user'::text) OR (kind = ANY (ARRAY['point'::text, 'box'::text, 'path'::text]))));

-- public.region_anchors / region_anchors_material_version_id_fkey
FOREIGN KEY (material_version_id) REFERENCES material_versions(id) ON DELETE CASCADE;

-- public.region_anchors / region_anchors_slide_id_fkey
FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE;

-- public.region_anchors / region_anchors_pkey
PRIMARY KEY (id);

-- public.session_folders / session_folders_color_index_check
CHECK (((color_index >= 0) AND (color_index <= 5)));

-- public.session_folders / session_folders_name_check
CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 80))));

-- public.session_folders / session_folders_owner_id_fkey
FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- public.session_folders / session_folders_pkey
PRIMARY KEY (id);

-- public.session_folders / session_folders_id_owner_id_key
UNIQUE (id, owner_id);

-- public.slide_instructor_notes / slide_instructor_notes_body_check
CHECK ((char_length(body) <= 10000));

-- public.slide_instructor_notes / slide_instructor_notes_slide_id_fkey
FOREIGN KEY (slide_id) REFERENCES slides(id) ON DELETE CASCADE;

-- public.slide_instructor_notes / slide_instructor_notes_pkey
PRIMARY KEY (slide_id);

-- public.slides / slides_height_px_check
CHECK ((height_px > 0));

-- public.slides / slides_page_index_check
CHECK ((page_index >= 0));

-- public.slides / slides_width_px_check
CHECK ((width_px > 0));

-- public.slides / slides_material_version_id_fkey
FOREIGN KEY (material_version_id) REFERENCES material_versions(id) ON DELETE CASCADE;

-- public.slides / slides_pkey
PRIMARY KEY (id);

-- public.slides / slides_material_version_id_page_index_key
UNIQUE (material_version_id, page_index);
```

**인덱스 정의**

```sql
CREATE UNIQUE INDEX answers_pkey ON public.answers USING btree (id);
CREATE INDEX answers_question_idx ON public.answers USING btree (question_id);
CREATE UNIQUE INDEX campaign_pages_campaign_id_page_index_key ON public.campaign_pages USING btree (campaign_id, page_index);
CREATE INDEX campaign_pages_campaign_idx ON public.campaign_pages USING btree (campaign_id, page_index);
CREATE UNIQUE INDEX campaign_pages_pkey ON public.campaign_pages USING btree (id);
CREATE INDEX campaigns_folder_idx ON public.campaigns USING btree (folder_id);
CREATE INDEX campaigns_join_code_idx ON public.campaigns USING btree (join_code);
CREATE UNIQUE INDEX campaigns_join_code_key ON public.campaigns USING btree (join_code);
CREATE INDEX campaigns_owner_idx ON public.campaigns USING btree (owner_id);
CREATE UNIQUE INDEX campaigns_pkey ON public.campaigns USING btree (id);
CREATE INDEX brain_course_idx ON public.course_brain_memory USING btree (course_id, created_at DESC);
CREATE UNIQUE INDEX course_brain_memory_pkey ON public.course_brain_memory USING btree (id);
CREATE INDEX courses_folder_idx ON public.courses USING btree (folder_id);
CREATE INDEX courses_owner_idx ON public.courses USING btree (owner_id);
CREATE UNIQUE INDEX courses_pkey ON public.courses USING btree (id);
CREATE UNIQUE INDEX feedback_pin_reactions_pkey ON public.feedback_pin_reactions USING btree (pin_id, reactor_id);
CREATE INDEX feedback_pin_reactions_reactor_idx ON public.feedback_pin_reactions USING btree (reactor_id);
CREATE INDEX feedback_pins_author_idx ON public.feedback_pins USING btree (author_id);
CREATE INDEX feedback_pins_campaign_created_idx ON public.feedback_pins USING btree (campaign_id, created_at DESC);
CREATE INDEX feedback_pins_campaign_page_created_idx ON public.feedback_pins USING btree (campaign_id, page_index, created_at DESC);
CREATE UNIQUE INDEX feedback_pins_pkey ON public.feedback_pins USING btree (id);
CREATE UNIQUE INDEX lectures_course_id_seq_no_key ON public.lectures USING btree (course_id, seq_no);
CREATE INDEX lectures_course_idx ON public.lectures USING btree (course_id);
CREATE INDEX lectures_join_code_idx ON public.lectures USING btree (join_code);
CREATE UNIQUE INDEX lectures_join_code_key ON public.lectures USING btree (join_code);
CREATE UNIQUE INDEX lectures_pkey ON public.lectures USING btree (id);
CREATE UNIQUE INDEX material_versions_material_id_version_no_key ON public.material_versions USING btree (material_id, version_no);
CREATE UNIQUE INDEX material_versions_pin_feedback_source_idx ON public.material_versions USING btree (source_path) WHERE (source_path ~~ 'pin-feedback/%'::text);
CREATE UNIQUE INDEX material_versions_pkey ON public.material_versions USING btree (id);
CREATE INDEX materials_lecture_idx ON public.materials USING btree (lecture_id);
CREATE UNIQUE INDEX materials_pkey ON public.materials USING btree (id);
CREATE INDEX platform_experience_responses_campaign_idx ON public.platform_experience_responses USING btree (campaign_id, created_at DESC) WHERE (campaign_id IS NOT NULL);
CREATE INDEX platform_experience_responses_lecture_idx ON public.platform_experience_responses USING btree (lecture_id, created_at DESC) WHERE (lecture_id IS NOT NULL);
CREATE UNIQUE INDEX platform_experience_responses_pkey ON public.platform_experience_responses USING btree (id);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX question_reactions_pkey ON public.question_reactions USING btree (question_id, reactor_id);
CREATE INDEX question_reactions_reactor_idx ON public.question_reactions USING btree (reactor_id);
CREATE INDEX questions_author_idx ON public.questions USING btree (author_id);
CREATE INDEX questions_course_idx ON public.questions USING btree (course_id);
CREATE INDEX questions_lecture_created_idx ON public.questions USING btree (lecture_id, created_at DESC);
CREATE UNIQUE INDEX questions_pkey ON public.questions USING btree (id);
CREATE UNIQUE INDEX region_anchors_pkey ON public.region_anchors USING btree (id);
CREATE UNIQUE INDEX session_folders_id_owner_id_key ON public.session_folders USING btree (id, owner_id);
CREATE UNIQUE INDEX session_folders_owner_name_idx ON public.session_folders USING btree (owner_id, lower(name));
CREATE UNIQUE INDEX session_folders_pkey ON public.session_folders USING btree (id);
CREATE UNIQUE INDEX slide_instructor_notes_pkey ON public.slide_instructor_notes USING btree (slide_id);
CREATE UNIQUE INDEX slides_material_version_id_page_index_key ON public.slides USING btree (material_version_id, page_index);
CREATE UNIQUE INDEX slides_pkey ON public.slides USING btree (id);
```

**RLS 정책**

- public.answers: owners add answers / INSERT / PERMISSIVE / {authenticated}

```sql
-- USING
(없음 / not set)
-- WITH CHECK
((( SELECT auth.uid() AS uid) = author_id) AND (EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = answers.question_id) AND ( SELECT private.course_owned(q.course_id) AS course_owned)))))
```

- public.answers: owners view course answers / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = answers.question_id) AND ( SELECT private.course_owned(q.course_id) AS course_owned))))
-- WITH CHECK
(없음 / not set)
```

- public.answers: question authors view answers / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = answers.question_id) AND (q.author_id = ( SELECT auth.uid() AS uid))))))
-- WITH CHECK
(없음 / not set)
```

- public.campaign_pages: owners manage campaign pages / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.campaign_owned(campaign_pages.campaign_id) AS campaign_owned)
-- WITH CHECK
( SELECT private.campaign_owned(campaign_pages.campaign_id) AS campaign_owned)
```

- public.campaigns: only admins create campaigns / INSERT / RESTRICTIVE / {authenticated}

```sql
-- USING
(없음 / not set)
-- WITH CHECK
( SELECT private.is_admin() AS is_admin)
```

- public.campaigns: owners manage campaigns / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT auth.uid() AS uid) = owner_id)
-- WITH CHECK
(( SELECT auth.uid() AS uid) = owner_id)
```

- public.campaigns: participants view joined campaigns / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(EXISTS ( SELECT 1
   FROM feedback_pins p
  WHERE ((p.campaign_id = campaigns.id) AND (p.author_id = ( SELECT auth.uid() AS uid)))))
-- WITH CHECK
(없음 / not set)
```

- public.course_brain_memory: owners view course brain / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.course_owned(course_brain_memory.course_id) AS course_owned)
-- WITH CHECK
(없음 / not set)
```

- public.courses: only admins create courses / INSERT / RESTRICTIVE / {authenticated}

```sql
-- USING
(없음 / not set)
-- WITH CHECK
( SELECT private.is_admin() AS is_admin)
```

- public.courses: owners manage courses / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT auth.uid() AS uid) = owner_id)
-- WITH CHECK
(( SELECT auth.uid() AS uid) = owner_id)
```

- public.courses: participants view live courses / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (EXISTS ( SELECT 1
   FROM lectures l
  WHERE ((l.course_id = courses.id) AND (l.status = 'live'::lecture_status)))))
-- WITH CHECK
(없음 / not set)
```

- public.feedback_pins: authors update own visible feedback / UPDATE / PERMISSIVE / {authenticated}

```sql
-- USING
((( SELECT auth.uid() AS uid) = author_id) AND (hidden = false) AND ( SELECT private.campaign_is_live(feedback_pins.campaign_id) AS campaign_is_live))
-- WITH CHECK
((( SELECT auth.uid() AS uid) = author_id) AND (hidden = false) AND ( SELECT private.campaign_accepts_feedback_category(feedback_pins.campaign_id, feedback_pins.category) AS campaign_accepts_feedback_category))
```

- public.feedback_pins: authors view own feedback / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT auth.uid() AS uid) = author_id)
-- WITH CHECK
(없음 / not set)
```

- public.feedback_pins: owners update campaign feedback / UPDATE / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.campaign_owned(feedback_pins.campaign_id) AS campaign_owned)
-- WITH CHECK
( SELECT private.campaign_owned(feedback_pins.campaign_id) AS campaign_owned)
```

- public.feedback_pins: owners view campaign feedback / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.campaign_owned(feedback_pins.campaign_id) AS campaign_owned)
-- WITH CHECK
(없음 / not set)
```

- public.feedback_pins: participants add live feedback / INSERT / PERMISSIVE / {authenticated}

```sql
-- USING
(없음 / not set)
-- WITH CHECK
((( SELECT auth.uid() AS uid) = author_id) AND (hidden = false) AND ( SELECT private.campaign_accepts_feedback_category(feedback_pins.campaign_id, feedback_pins.category) AS campaign_accepts_feedback_category) AND ( SELECT private.campaign_page_exists(feedback_pins.campaign_id, feedback_pins.page_index) AS campaign_page_exists))
```

- public.lectures: owners manage lectures / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.course_owned(lectures.course_id) AS course_owned)
-- WITH CHECK
( SELECT private.course_owned(lectures.course_id) AS course_owned)
```

- public.lectures: participants view live lectures / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (status = 'live'::lecture_status))
-- WITH CHECK
(없음 / not set)
```

- public.material_versions: owners manage material versions / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
(EXISTS ( SELECT 1
   FROM materials m
  WHERE ((m.id = material_versions.material_id) AND ( SELECT private.course_owned(m.course_id) AS course_owned))))
-- WITH CHECK
(EXISTS ( SELECT 1
   FROM materials m
  WHERE ((m.id = material_versions.material_id) AND ( SELECT private.course_owned(m.course_id) AS course_owned))))
```

- public.material_versions: participants view live material versions / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (EXISTS ( SELECT 1
   FROM (materials m
     JOIN lectures l ON ((l.id = m.lecture_id)))
  WHERE ((m.id = material_versions.material_id) AND (l.status = 'live'::lecture_status)))))
-- WITH CHECK
(없음 / not set)
```

- public.materials: owners manage materials / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.course_owned(materials.course_id) AS course_owned)
-- WITH CHECK
( SELECT private.course_owned(materials.course_id) AS course_owned)
```

- public.materials: participants view live materials / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (EXISTS ( SELECT 1
   FROM lectures l
  WHERE ((l.id = materials.lecture_id) AND (l.status = 'live'::lecture_status)))))
-- WITH CHECK
(없음 / not set)
```

- public.platform_experience_responses: owners view platform experience responses / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(((lecture_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM lectures lecture
  WHERE ((lecture.id = platform_experience_responses.lecture_id) AND ( SELECT private.course_owned(lecture.course_id) AS course_owned))))) OR ((campaign_id IS NOT NULL) AND ( SELECT private.campaign_owned(platform_experience_responses.campaign_id) AS campaign_owned)))
-- WITH CHECK
(없음 / not set)
```

- public.profiles: users view own profile / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT auth.uid() AS uid) = id)
-- WITH CHECK
(없음 / not set)
```

- public.questions: admins delete course questions / DELETE / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_admin() AS is_admin) AND ( SELECT private.course_owned(questions.course_id) AS course_owned))
-- WITH CHECK
(없음 / not set)
```

- public.questions: authors update own unanswered questions / UPDATE / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (( SELECT auth.uid() AS uid) = author_id) AND (status = 'unanswered'::question_status) AND (EXISTS ( SELECT 1
   FROM lectures lecture
  WHERE ((lecture.id = questions.lecture_id) AND (lecture.course_id = questions.course_id) AND (lecture.status = 'live'::lecture_status)))))
-- WITH CHECK
(( SELECT private.is_participant() AS is_participant) AND (( SELECT auth.uid() AS uid) = author_id) AND (status = 'unanswered'::question_status) AND ( SELECT private.question_category_enabled(questions.lecture_id, questions.category) AS question_category_enabled) AND (EXISTS ( SELECT 1
   FROM lectures lecture
  WHERE ((lecture.id = questions.lecture_id) AND (lecture.course_id = questions.course_id) AND (lecture.status = 'live'::lecture_status)))))
```

- public.questions: authors view own questions / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (( SELECT auth.uid() AS uid) = author_id))
-- WITH CHECK
(없음 / not set)
```

- public.questions: owners update course questions / UPDATE / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.course_owned(questions.course_id) AS course_owned)
-- WITH CHECK
( SELECT private.course_owned(questions.course_id) AS course_owned)
```

- public.questions: owners view course questions / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
( SELECT private.course_owned(questions.course_id) AS course_owned)
-- WITH CHECK
(없음 / not set)
```

- public.questions: participants add live questions / INSERT / PERMISSIVE / {authenticated}

```sql
-- USING
(없음 / not set)
-- WITH CHECK
(( SELECT private.is_participant() AS is_participant) AND (( SELECT auth.uid() AS uid) = author_id) AND (status = 'unanswered'::question_status) AND ( SELECT private.question_category_enabled(questions.lecture_id, questions.category) AS question_category_enabled) AND (EXISTS ( SELECT 1
   FROM lectures lecture
  WHERE ((lecture.id = questions.lecture_id) AND (lecture.course_id = questions.course_id) AND (lecture.status = 'live'::lecture_status)))))
```

- public.region_anchors: owners view anchors / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(EXISTS ( SELECT 1
   FROM ((slides s
     JOIN material_versions mv ON ((mv.id = s.material_version_id)))
     JOIN materials m ON ((m.id = mv.material_id)))
  WHERE ((s.id = region_anchors.slide_id) AND ( SELECT private.course_owned(m.course_id) AS course_owned))))
-- WITH CHECK
(없음 / not set)
```

- public.region_anchors: participants create anchors in live lectures / INSERT / PERMISSIVE / {authenticated}

```sql
-- USING
(없음 / not set)
-- WITH CHECK
(( SELECT private.is_participant() AS is_participant) AND (created_by = 'user'::text) AND (EXISTS ( SELECT 1
   FROM (((slides s
     JOIN material_versions mv ON ((mv.id = s.material_version_id)))
     JOIN materials m ON ((m.id = mv.material_id)))
     JOIN lectures l ON ((l.id = m.lecture_id)))
  WHERE ((s.id = region_anchors.slide_id) AND (l.status = 'live'::lecture_status)))))
```

- public.region_anchors: question authors view own anchors / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.region_id = region_anchors.id) AND (q.author_id = ( SELECT auth.uid() AS uid))))))
-- WITH CHECK
(없음 / not set)
```

- public.session_folders: owners manage session folders / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
((( SELECT auth.uid() AS uid) = owner_id) AND ( SELECT private.is_admin() AS is_admin))
-- WITH CHECK
((( SELECT auth.uid() AS uid) = owner_id) AND ( SELECT private.is_admin() AS is_admin))
```

- public.slide_instructor_notes: owners manage slide instructor notes / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_admin() AS is_admin) AND (EXISTS ( SELECT 1
   FROM ((slides s
     JOIN material_versions mv ON ((mv.id = s.material_version_id)))
     JOIN materials m ON ((m.id = mv.material_id)))
  WHERE ((s.id = slide_instructor_notes.slide_id) AND ( SELECT private.course_owned(m.course_id) AS course_owned)))))
-- WITH CHECK
(( SELECT private.is_admin() AS is_admin) AND (EXISTS ( SELECT 1
   FROM ((slides s
     JOIN material_versions mv ON ((mv.id = s.material_version_id)))
     JOIN materials m ON ((m.id = mv.material_id)))
  WHERE ((s.id = slide_instructor_notes.slide_id) AND ( SELECT private.course_owned(m.course_id) AS course_owned)))))
```

- public.slides: only admins delete slides / DELETE / RESTRICTIVE / {authenticated}

```sql
-- USING
( SELECT private.is_admin() AS is_admin)
-- WITH CHECK
(없음 / not set)
```

- public.slides: owners manage slides / ALL / PERMISSIVE / {authenticated}

```sql
-- USING
(EXISTS ( SELECT 1
   FROM (material_versions mv
     JOIN materials m ON ((m.id = mv.material_id)))
  WHERE ((mv.id = slides.material_version_id) AND ( SELECT private.course_owned(m.course_id) AS course_owned))))
-- WITH CHECK
(EXISTS ( SELECT 1
   FROM (material_versions mv
     JOIN materials m ON ((m.id = mv.material_id)))
  WHERE ((mv.id = slides.material_version_id) AND ( SELECT private.course_owned(m.course_id) AS course_owned))))
```

- public.slides: participants view live slides / SELECT / PERMISSIVE / {authenticated}

```sql
-- USING
(( SELECT private.is_participant() AS is_participant) AND (EXISTS ( SELECT 1
   FROM ((material_versions mv
     JOIN materials m ON ((m.id = mv.material_id)))
     JOIN lectures l ON ((l.id = m.lecture_id)))
  WHERE ((mv.id = slides.material_version_id) AND (l.status = 'live'::lecture_status)))))
-- WITH CHECK
(없음 / not set)
```

**트리거 정의**

```sql
CREATE TRIGGER answers_capture_memory AFTER INSERT ON public.answers FOR EACH ROW EXECUTE FUNCTION private.capture_answer_memory();

CREATE TRIGGER feedback_pin_reactions_sync_count AFTER INSERT OR DELETE ON public.feedback_pin_reactions FOR EACH ROW EXECUTE FUNCTION private.sync_feedback_pin_reaction_count();

CREATE TRIGGER lectures_validate_question_categories BEFORE INSERT OR UPDATE OF question_categories ON public.lectures FOR EACH ROW EXECUTE FUNCTION private.validate_lecture_question_categories();

CREATE TRIGGER question_reactions_sync_count AFTER INSERT OR DELETE ON public.question_reactions FOR EACH ROW EXECUTE FUNCTION private.sync_question_reaction_count();

CREATE TRIGGER questions_capture_memory AFTER INSERT ON public.questions FOR EACH ROW EXECUTE FUNCTION private.capture_question_memory();

CREATE TRIGGER questions_validate_category BEFORE INSERT OR UPDATE OF lecture_id, category ON public.questions FOR EACH ROW EXECUTE FUNCTION private.validate_question_category();
```

**함수 정의**

**private.campaign_accepts_feedback_category**

```sql
CREATE OR REPLACE FUNCTION private.campaign_accepts_feedback_category(target_campaign_id uuid, target_category text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.campaigns c
    where c.id = target_campaign_id
      and c.status = 'live'
      and case
        when target_category is null then not exists (
          select 1
          from jsonb_each(c.feedback_categories) as item
          where item.value -> 'enabled' = 'true'::jsonb
            and item.value -> 'archived' is distinct from 'true'::jsonb
        )
        else coalesce((c.feedback_categories -> target_category ->> 'enabled')::boolean, false)
          and not coalesce((c.feedback_categories -> target_category ->> 'archived')::boolean, false)
      end
  );
$function$

```

**private.campaign_is_live**

```sql
CREATE OR REPLACE FUNCTION private.campaign_is_live(target_campaign_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.campaigns
    where id = target_campaign_id and status = 'live'
  );
$function$

```

**private.campaign_owned**

```sql
CREATE OR REPLACE FUNCTION private.campaign_owned(target_campaign_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.campaigns
    where id = target_campaign_id and owner_id = (select auth.uid())
  );
$function$

```

**private.campaign_page_exists**

```sql
CREATE OR REPLACE FUNCTION private.campaign_page_exists(target_campaign_id uuid, target_page_index integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.campaign_pages
    where campaign_id = target_campaign_id and page_index = target_page_index
  );
$function$

```

**private.capture_answer_memory**

```sql
CREATE OR REPLACE FUNCTION private.capture_answer_memory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.questions;
begin
  select * into target from public.questions where id = new.question_id;
  update public.questions set status = 'answered', updated_at = now() where id = new.question_id;
  insert into public.course_brain_memory(course_id, lecture_id, chunk_type, source_id, content)
  values (target.course_id, target.lecture_id, 'answer', new.id, new.body);
  return new;
end;
$function$

```

**private.capture_question_memory**

```sql
CREATE OR REPLACE FUNCTION private.capture_question_memory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.course_brain_memory(course_id, lecture_id, chunk_type, source_id, content)
  values (new.course_id, new.lecture_id, 'question', new.id, new.raw_text);
  return new;
end;
$function$

```

**private.course_owned**

```sql
CREATE OR REPLACE FUNCTION private.course_owned(target_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.courses
    where id = target_course_id and owner_id = (select auth.uid())
  );
$function$

```

**private.feedback_categories_are_valid**

```sql
CREATE OR REPLACE FUNCTION private.feedback_categories_are_valid(value jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when jsonb_typeof(value) <> 'object' then false
    else (
      select count(*) <= 50
        and count(*) filter (where item.value -> 'archived' is distinct from 'true'::jsonb) <= 20
        and coalesce(bool_and(coalesce(item.key ~ '^[a-z0-9][a-z0-9-]{0,63}$', false)), true)
        and coalesce(bool_and(coalesce(jsonb_typeof(item.value) = 'object', false)), true)
        and coalesce(bool_and(coalesce(jsonb_typeof(item.value -> 'label') = 'string', false)), true)
        and coalesce(bool_and(coalesce(char_length(item.value ->> 'label') <= 40, false)), true)
        and coalesce(bool_and(coalesce((item.value ->> 'label') = btrim(item.value ->> 'label'), false)), true)
        and coalesce(bool_and(coalesce(
          char_length(item.value ->> 'label') > 0
          or item.key = any (array['praise', 'improve', 'confusing', 'bug', 'idea'])
        , false)), true)
        and coalesce(bool_and(coalesce(jsonb_typeof(item.value -> 'enabled') = 'boolean', false)), true)
        and coalesce(bool_and(coalesce(
          item.value -> 'archived' is null
          or jsonb_typeof(item.value -> 'archived') = 'boolean'
        , false)), true)
      from jsonb_each(value) as item
    )
  end;
$function$

```

**private.find_campaign_by_code**

```sql
CREATE OR REPLACE FUNCTION private.find_campaign_by_code(target_code text)
 RETURNS SETOF campaigns
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.campaigns
  where (select auth.uid()) is not null
    and char_length(target_code) between 4 and 10
    and join_code = upper(target_code)
    and status in ('live', 'ended');
$function$

```

**private.find_campaign_pages_by_code**

```sql
CREATE OR REPLACE FUNCTION private.find_campaign_pages_by_code(target_code text, target_audience_group text)
 RETURNS SETOF campaign_pages
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select page.*
  from public.campaign_pages as page
  join public.campaigns as campaign on campaign.id = page.campaign_id
  where (select auth.uid()) is not null
    and char_length(target_code) between 4 and 10
    and campaign.join_code = upper(target_code)
    and campaign.status in ('live', 'ended')
    and (
      cardinality(campaign.audience_groups) = 0
      or (
        target_audience_group = any(campaign.audience_groups)
        and target_audience_group = any(page.audience_groups)
      )
    )
  order by page.page_index;
$function$

```

**private.find_campaign_player**

```sql
CREATE OR REPLACE FUNCTION private.find_campaign_player(target_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', campaign.id,
      'title', campaign.title,
      'guide_text', campaign.guide_text,
      'join_code', campaign.join_code,
      'image_path', campaign.image_path,
      'image_width', campaign.image_width,
      'image_height', campaign.image_height,
      'status', campaign.status,
      'show_presentation_qr', campaign.show_presentation_qr,
      'presentation_qr_position', campaign.presentation_qr_position,
      'presentation_autoplay', campaign.presentation_autoplay,
      'show_presentation_pin_status', campaign.show_presentation_pin_status,
      'presentation_pin_status_position', campaign.presentation_pin_status_position,
      'audience_groups', campaign.audience_groups,
      'feedback_categories', campaign.feedback_categories,
      'created_at', campaign.created_at
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'campaign_id', page.campaign_id,
        'page_index', page.page_index,
        'image_path', page.image_path,
        'image_width', page.image_width,
        'image_height', page.image_height,
        'audience_groups', page.audience_groups
      ) order by page.page_index)
      from public.campaign_pages as page
      where page.campaign_id = campaign.id
    ), '[]'::jsonb),
    'pins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pin.id,
        'campaign_id', pin.campaign_id,
        'author_id', null,
        'page_index', pin.page_index,
        'x', pin.x,
        'y', pin.y,
        'category', pin.category,
        'body', pin.body,
        'marker', pin.marker,
        'reaction_count', pin.reaction_count,
        'reacted_by_me', exists (
          select 1
          from public.feedback_pin_reactions as reaction
          where reaction.pin_id = pin.id
            and reaction.reactor_id = (select auth.uid())
        ),
        'hidden', false,
        'created_at', pin.created_at
      ) order by pin.created_at desc)
      from public.feedback_pins as pin
      where pin.campaign_id = campaign.id and pin.hidden = false
    ), '[]'::jsonb)
  )
  from public.campaigns as campaign
  where (select auth.uid()) is not null
    and campaign.id = target_campaign_id
    and campaign.status in ('live', 'ended');
$function$

```

**private.find_lecture_questions**

```sql
CREATE OR REPLACE FUNCTION private.find_lecture_questions(target_lecture_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', question.id,
    'lecture_id', question.lecture_id,
    'slide_id', question.slide_id,
    'category', question.category,
    'marker', question.marker,
    'raw_text', question.raw_text,
    'status', question.status,
    'reaction_count', question.reaction_count,
    'reacted_by_me', exists (
      select 1
      from public.question_reactions as reaction
      where reaction.question_id = question.id
        and reaction.reactor_id = (select auth.uid())
    ),
    'is_mine', question.author_id = (select auth.uid()),
    'created_at', question.created_at,
    'region_anchors', case when anchor.id is null then null else jsonb_build_object(
      'kind', anchor.kind,
      'coords', anchor.coords
    ) end,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'body', answer.body,
        'created_at', answer.created_at
      ) order by answer.created_at)
      from public.answers as answer
      where answer.question_id = question.id
        and answer.visibility in ('participants', 'public')
    ), '[]'::jsonb)
  ) order by question.created_at desc), '[]'::jsonb)
  from public.questions as question
  left join public.region_anchors as anchor on anchor.id = question.region_id
  where (select auth.uid()) is not null
    and (select private.is_participant())
    and question.lecture_id = target_lecture_id
    and question.status <> 'archived'::public.question_status
    and exists (
      select 1
      from public.lectures as lecture
      where lecture.id = question.lecture_id
        and lecture.status = 'live'::public.lecture_status
    );
$function$

```

**private.handle_new_user**

```sql
CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, role, email, display_name, avatar_url)
  values (
    new.id,
    case when coalesce(new.is_anonymous, false) then 'participant'::public.user_role else 'admin'::public.user_role end,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$

```

**private.handle_user_updated**

```sql
CREATE OR REPLACE FUNCTION private.handle_user_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.profiles set
    role = case when coalesce(new.is_anonymous, false) then role else 'admin'::public.user_role end,
    email = new.email,
    display_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', display_name),
    avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url),
    updated_at = now()
  where id = new.id;
  return new;
end;
$function$

```

**private.import_feedback_campaign**

```sql
CREATE OR REPLACE FUNCTION private.import_feedback_campaign(target_campaign_id uuid, target_course_id uuid, target_lecture_id uuid, target_material_id uuid, target_version_id uuid, target_join_code text, target_slides jsonb, target_question_categories jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  source_campaign public.campaigns%rowtype;
  source_page_count integer;
  mapped_page_count integer;
  fallback_category text;
  existing_lecture_id uuid;
  source_pin record;
  imported_question_id uuid;
  imported_region_id uuid;
begin
  if actor_id is null or not (select private.is_admin()) then
    raise exception using errcode = '42501', message = 'Instructor authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_campaign_id::text, 0));

  select material.lecture_id
  into existing_lecture_id
  from public.material_versions as version
  join public.materials as material on material.id = version.material_id
  join public.courses as course on course.id = material.course_id
  where version.source_path = 'pin-feedback/' || target_campaign_id::text
    and course.owner_id = actor_id
  limit 1;
  if existing_lecture_id is not null then
    return existing_lecture_id;
  end if;

  select * into source_campaign
  from public.campaigns
  where id = target_campaign_id and owner_id = actor_id;
  if not found then
    raise exception using errcode = '42501', message = 'Feedback campaign not found';
  end if;
  if target_join_code !~ '^[A-Z0-9]{6,10}$' then
    raise exception using errcode = '22023', message = 'Invalid lecture join code';
  end if;
  if exists (select 1 from public.lectures where join_code = target_join_code) then
    raise exception using errcode = '23505', message = 'Lecture join code already exists';
  end if;
  if not (select private.valid_question_category_settings(target_question_categories)) then
    raise exception using errcode = '22023', message = 'Invalid question category settings';
  end if;

  select count(*) into source_page_count
  from public.campaign_pages
  where campaign_id = target_campaign_id;
  if source_page_count < 1 or source_page_count > 500
    or jsonb_typeof(target_slides) <> 'array'
    or jsonb_array_length(target_slides) <> source_page_count then
    raise exception using errcode = '22023', message = 'Campaign page mapping is incomplete';
  end if;

  select count(*) into mapped_page_count
  from jsonb_to_recordset(target_slides) as mapping(
    id uuid,
    source_page_id uuid,
    page_index integer,
    image_path text
  )
  join public.campaign_pages as page
    on page.id = mapping.source_page_id
   and page.campaign_id = target_campaign_id
   and page.page_index = mapping.page_index
  join storage.objects as object
    on object.bucket_id = 'lecture-slides'
   and object.name = mapping.image_path
  where mapping.id is not null
    and mapping.image_path like (actor_id::text || '/' || target_lecture_id::text || '/pin-feedback/%');

  if mapped_page_count <> source_page_count
    or (select count(distinct mapping.source_page_id) from jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)) <> source_page_count
    or (select count(distinct mapping.page_index) from jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)) <> source_page_count then
    raise exception using errcode = '22023', message = 'Campaign page mapping is invalid';
  end if;

  if exists (
    select 1
    from public.feedback_pins as pin
    where pin.campaign_id = target_campaign_id
      and pin.hidden = false
      and pin.category is not null
      and not (target_question_categories ? pin.category)
  ) then
    raise exception using errcode = '22023', message = 'Feedback category mapping is incomplete';
  end if;

  select category.key into fallback_category
  from jsonb_each(target_question_categories) as category
  where (category.value ->> 'enabled')::boolean = true
    and (category.value ->> 'archived')::boolean = false
  limit 1;

  insert into public.courses(id, owner_id, folder_id, title, visibility, created_at)
  values (target_course_id, actor_id, source_campaign.folder_id, source_campaign.title, 'link', source_campaign.created_at);

  insert into public.lectures(
    id, course_id, title, join_code, status, current_page,
    presentation_interactions, show_question_pins, show_presentation_qr,
    presentation_qr_position, question_categories, ended_at, created_at
  ) values (
    target_lecture_id, target_course_id, source_campaign.title, target_join_code, 'ended', 0,
    true, true, source_campaign.show_presentation_qr,
    source_campaign.presentation_qr_position, target_question_categories, now(), source_campaign.created_at
  );

  insert into public.materials(id, course_id, lecture_id, type, file_name, created_at)
  values (target_material_id, target_course_id, target_lecture_id, 'slide_deck', source_campaign.title || ' (PinFeedback)', source_campaign.created_at);

  insert into public.material_versions(id, material_id, version_no, source_path, created_at)
  values (target_version_id, target_material_id, 1, 'pin-feedback/' || target_campaign_id::text, source_campaign.created_at);

  insert into public.slides(id, material_version_id, page_index, image_path, width_px, height_px, created_at)
  select mapping.id, target_version_id, mapping.page_index, mapping.image_path, page.image_width, page.image_height, page.created_at
  from jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)
  join public.campaign_pages as page on page.id = mapping.source_page_id;

  for source_pin in
    select pin.*, mapping.id as target_slide_id
    from public.feedback_pins as pin
    join public.campaign_pages as page
      on page.campaign_id = pin.campaign_id and page.page_index = pin.page_index
    join jsonb_to_recordset(target_slides) as mapping(id uuid, source_page_id uuid, page_index integer, image_path text)
      on mapping.source_page_id = page.id
    where pin.campaign_id = target_campaign_id and pin.hidden = false
    order by pin.created_at
  loop
    imported_region_id := gen_random_uuid();
    imported_question_id := gen_random_uuid();

    insert into public.region_anchors(id, slide_id, material_version_id, kind, coords, created_by, created_at)
    values (
      imported_region_id,
      source_pin.target_slide_id,
      target_version_id,
      'point',
      jsonb_build_object('x', source_pin.x, 'y', source_pin.y),
      'user',
      source_pin.created_at
    );

    insert into public.questions(
      id, course_id, lecture_id, slide_id, region_id, author_id, is_anonymous,
      category, marker, raw_text, status, occurred_in, created_at, updated_at
    ) values (
      imported_question_id,
      target_course_id,
      target_lecture_id,
      source_pin.target_slide_id,
      imported_region_id,
      source_pin.author_id,
      true,
      coalesce(source_pin.category, fallback_category),
      source_pin.marker,
      source_pin.body,
      'unanswered',
      'post',
      source_pin.created_at,
      source_pin.updated_at
    );

    insert into public.question_reactions(question_id, reactor_id, created_at)
    select imported_question_id, reaction.reactor_id, reaction.created_at
    from public.feedback_pin_reactions as reaction
    where reaction.pin_id = source_pin.id
    on conflict do nothing;
  end loop;

  return target_lecture_id;
end;
$function$

```

**private.is_admin**

```sql
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$function$

```

**private.is_participant**

```sql
CREATE OR REPLACE FUNCTION private.is_participant()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'participant'
  );
$function$

```

**private.question_category_enabled**

```sql
CREATE OR REPLACE FUNCTION private.question_category_enabled(target_lecture_id uuid, target_category text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((lecture.question_categories -> target_category ->> 'enabled')::boolean, false)
    and not coalesce((lecture.question_categories -> target_category ->> 'archived')::boolean, false)
  from public.lectures as lecture
  where lecture.id = target_lecture_id;
$function$

```

**private.set_feedback_pin_reaction**

```sql
CREATE OR REPLACE FUNCTION private.set_feedback_pin_reaction(target_pin_id uuid, target_reacted boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  target_campaign_id uuid;
  target_author_id uuid;
  target_hidden boolean;
  target_status public.campaign_status;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if target_reacted is null then
    raise exception using errcode = '22004', message = 'Reaction state is required';
  end if;

  select pin.campaign_id
  into target_campaign_id
  from public.feedback_pins as pin
  where pin.id = target_pin_id;

  if not found then
    raise exception using errcode = '42501', message = 'Feedback pin cannot be reacted to';
  end if;

  -- 캠페인→PIN 순으로 잠가 종료·삭제와 반응 쓰기 사이의 TOCTOU를 막는다.
  select campaign.status
  into target_status
  from public.campaigns as campaign
  where campaign.id = target_campaign_id
  for share;

  select pin.author_id, pin.hidden
  into target_author_id, target_hidden
  from public.feedback_pins as pin
  where pin.id = target_pin_id and pin.campaign_id = target_campaign_id
  for update;

  if not found or target_hidden or target_status is distinct from 'live'::public.campaign_status then
    raise exception using errcode = '42501', message = 'Feedback pin cannot be reacted to';
  end if;
  if target_author_id = actor_id then
    raise exception using errcode = '42501', message = 'Authors cannot react to their own feedback pin';
  end if;

  if target_reacted then
    insert into public.feedback_pin_reactions(pin_id, reactor_id)
    values (target_pin_id, actor_id)
    on conflict (pin_id, reactor_id) do nothing;
  else
    delete from public.feedback_pin_reactions
    where pin_id = target_pin_id and reactor_id = actor_id;
  end if;

  return target_reacted;
end;
$function$

```

**private.set_question_reaction**

```sql
CREATE OR REPLACE FUNCTION private.set_question_reaction(target_question_id uuid, target_reacted boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  target_lecture_id uuid;
  target_author_id uuid;
  target_lecture_status public.lecture_status;
  target_question_status public.question_status;
begin
  if actor_id is null or not (select private.is_participant()) then
    raise exception using errcode = '42501', message = 'Participant authentication required';
  end if;
  if target_reacted is null then
    raise exception using errcode = '22004', message = 'Reaction state is required';
  end if;

  select question.lecture_id
  into target_lecture_id
  from public.questions as question
  where question.id = target_question_id;

  if not found then
    raise exception using errcode = '42501', message = 'Question cannot be reacted to';
  end if;

  select lecture.status
  into target_lecture_status
  from public.lectures as lecture
  where lecture.id = target_lecture_id
  for share;

  select question.author_id, question.status
  into target_author_id, target_question_status
  from public.questions as question
  where question.id = target_question_id
    and question.lecture_id = target_lecture_id
  for update;

  if not found
    or target_lecture_status is distinct from 'live'::public.lecture_status
    or target_question_status = 'archived'::public.question_status then
    raise exception using errcode = '42501', message = 'Question cannot be reacted to';
  end if;
  if target_author_id = actor_id then
    raise exception using errcode = '42501', message = 'Authors cannot react to their own question';
  end if;

  if target_reacted then
    insert into public.question_reactions(question_id, reactor_id)
    values (target_question_id, actor_id)
    on conflict (question_id, reactor_id) do nothing;
  else
    delete from public.question_reactions
    where question_id = target_question_id and reactor_id = actor_id;
  end if;

  return target_reacted;
end;
$function$

```

**private.sync_feedback_pin_reaction_count**

```sql
CREATE OR REPLACE FUNCTION private.sync_feedback_pin_reaction_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.feedback_pins
    set reaction_count = reaction_count + 1
    where id = new.pin_id;
    return new;
  end if;

  update public.feedback_pins
  set reaction_count = greatest(reaction_count - 1, 0)
  where id = old.pin_id;
  return old;
end;
$function$

```

**private.sync_question_reaction_count**

```sql
CREATE OR REPLACE FUNCTION private.sync_question_reaction_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.questions
    set reaction_count = reaction_count + 1
    where id = new.question_id;
    return new;
  end if;

  update public.questions
  set reaction_count = greatest(reaction_count - 1, 0)
  where id = old.question_id;
  return old;
end;
$function$

```

**private.valid_campaign_audience_groups**

```sql
CREATE OR REPLACE FUNCTION private.valid_campaign_audience_groups(groups text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select groups is not null
    and cardinality(groups) <= 20
    and not exists (
      select 1 from unnest(groups) as group_name
      where group_name is null
        or group_name <> btrim(group_name)
        or char_length(group_name) not between 1 and 40
    )
    and cardinality(groups) = (
      select count(distinct lower(group_name)) from unnest(groups) as group_name
    );
$function$

```

**private.valid_normalized_path**

```sql
CREATE OR REPLACE FUNCTION private.valid_normalized_path(value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  points jsonb;
  point jsonb;
  point_x numeric;
  point_y numeric;
begin
  if jsonb_typeof(value) <> 'object'
    or jsonb_typeof(value -> 'x') <> 'number'
    or jsonb_typeof(value -> 'y') <> 'number' then
    return false;
  end if;

  point_x := (value ->> 'x')::numeric;
  point_y := (value ->> 'y')::numeric;
  if point_x not between 0 and 1 or point_y not between 0 and 1 then
    return false;
  end if;

  points := value -> 'points';
  if jsonb_typeof(points) <> 'array'
    or jsonb_array_length(points) not between 2 and 512 then
    return false;
  end if;

  for point in select element from jsonb_array_elements(points) as elements(element)
  loop
    if jsonb_typeof(point) <> 'array' or jsonb_array_length(point) <> 2 then
      return false;
    end if;
    if jsonb_typeof(point -> 0) <> 'number' or jsonb_typeof(point -> 1) <> 'number' then
      return false;
    end if;

    point_x := (point ->> 0)::numeric;
    point_y := (point ->> 1)::numeric;
    if point_x not between 0 and 1 or point_y not between 0 and 1 then
      return false;
    end if;
  end loop;

  return true;
exception when others then
  return false;
end;
$function$

```

**private.valid_question_category_settings**

```sql
CREATE OR REPLACE FUNCTION private.valid_question_category_settings(settings jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  total_count integer;
  visible_count integer;
  enabled_count integer;
  invalid_count integer;
begin
  if settings is null or jsonb_typeof(settings) <> 'object' then
    return false;
  end if;

  select
    count(*),
    count(*) filter (where (item.value ->> 'archived')::boolean = false),
    count(*) filter (where (item.value ->> 'enabled')::boolean = true and (item.value ->> 'archived')::boolean = false),
    count(*) filter (where not (
      item.key ~ '^[a-z0-9][a-z0-9-]{0,63}$'
      and jsonb_typeof(item.value) = 'object'
      and jsonb_typeof(item.value -> 'label') = 'string'
      and char_length(item.value ->> 'label') <= 40
      and item.value ->> 'label' = btrim(item.value ->> 'label')
      and (
        item.key in ('concept', 'why', 'example', 'error', 'important', 'praise', 'improve', 'confusing', 'bug', 'idea')
        or char_length(item.value ->> 'label') > 0
      )
      and jsonb_typeof(item.value -> 'enabled') = 'boolean'
      and jsonb_typeof(item.value -> 'archived') = 'boolean'
    ))
  into total_count, visible_count, enabled_count, invalid_count
  from jsonb_each(settings) as item;

  return total_count between 1 and 50
    and visible_count <= 20
    and enabled_count >= 1
    and invalid_count = 0;
exception
  when others then return false;
end;
$function$

```

**private.validate_lecture_question_categories**

```sql
CREATE OR REPLACE FUNCTION private.validate_lecture_question_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select private.valid_question_category_settings(new.question_categories)) then
    raise exception using errcode = '23514', message = 'Invalid question category settings';
  end if;
  if exists (
    select 1
    from public.questions as question
    where question.lecture_id = new.id
      and not (new.question_categories ? question.category)
  ) then
    raise exception using errcode = '23514', message = 'A used question category cannot be removed';
  end if;
  return new;
end;
$function$

```

**private.validate_question_category**

```sql
CREATE OR REPLACE FUNCTION private.validate_question_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1
    from public.lectures as lecture
    where lecture.id = new.lecture_id
      and lecture.question_categories ? new.category
  ) then
    raise exception using errcode = '23514', message = 'Question category is not configured for this lecture';
  end if;
  return new;
end;
$function$

```

**public.append_lecture_slides**

```sql
CREATE OR REPLACE FUNCTION public.append_lecture_slides(target_material_version_id uuid, new_slides jsonb)
 RETURNS SETOF slides
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  next_page_index integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Instructor access is required.' using errcode = '42501';
  end if;

  if new_slides is null
    or jsonb_typeof(new_slides) <> 'array'
    or jsonb_array_length(new_slides) < 1
    or jsonb_array_length(new_slides) > 20 then
    raise exception 'Between 1 and 20 slides are required.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new_slides) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'id', '') = ''
      or coalesce(item.value ->> 'image_path', '') = ''
      or item.value ->> 'image_path' not like (select auth.uid())::text || '/%'
      or item.value ->> 'image_path' like '%..%'
  ) then
    raise exception 'Slide payload is invalid.' using errcode = '22023';
  end if;

  perform 1
  from public.material_versions mv
  join public.materials m on m.id = mv.material_id
  where mv.id = target_material_version_id
    and (select private.course_owned(m.course_id))
  for update of mv;

  if not found then
    raise exception 'Material version was not found.' using errcode = '42501';
  end if;

  select coalesce(max(s.page_index) + 1, 0)
  into next_page_index
  from public.slides s
  where s.material_version_id = target_material_version_id;

  return query
  insert into public.slides (id, material_version_id, page_index, image_path)
  select
    (item.value ->> 'id')::uuid,
    target_material_version_id,
    (next_page_index + item.position - 1)::integer,
    item.value ->> 'image_path'
  from jsonb_array_elements(new_slides) with ordinality as item(value, position)
  returning *;
end;
$function$

```

**public.delete_lecture_slide**

```sql
CREATE OR REPLACE FUNCTION public.delete_lecture_slide(target_slide_id uuid)
 RETURNS TABLE(deleted_image_path text, deleted_page_index integer, deleted_question_count integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  target_material_version_id uuid;
  target_lecture_id uuid;
  target_page_index integer;
  target_image_path text;
  slide_count integer;
  removed_questions integer;
  moved_slide record;
begin
  if not (select private.is_admin()) then
    raise exception 'Instructor access is required.' using errcode = '42501';
  end if;

  select s.material_version_id, m.lecture_id, s.page_index, s.image_path
  into target_material_version_id, target_lecture_id, target_page_index, target_image_path
  from public.slides s
  join public.material_versions mv on mv.id = s.material_version_id
  join public.materials m on m.id = mv.material_id
  where s.id = target_slide_id
    and (select private.course_owned(m.course_id))
  for update of mv;

  if not found then
    raise exception 'Slide was not found.' using errcode = '42501';
  end if;

  select count(*)::integer
  into slide_count
  from public.slides s
  where s.material_version_id = target_material_version_id;

  if slide_count <= 1 then
    raise exception 'The final slide cannot be deleted.' using errcode = '22023';
  end if;

  delete from public.questions q
  where q.slide_id = target_slide_id;
  get diagnostics removed_questions = row_count;

  delete from public.slides s
  where s.id = target_slide_id;

  -- unique(material_version_id, page_index)가 즉시 검사되므로 앞 번호부터 하나씩 당긴다.
  for moved_slide in
    select s.id, s.page_index
    from public.slides s
    where s.material_version_id = target_material_version_id
      and s.page_index > target_page_index
    order by s.page_index
  loop
    update public.slides
    set page_index = moved_slide.page_index - 1
    where id = moved_slide.id;
  end loop;

  update public.lectures
  set current_page = case
    when current_page > target_page_index then current_page - 1
    when current_page = target_page_index then least(target_page_index, slide_count - 2)
    else current_page
  end
  where id = target_lecture_id;

  -- 마지막 장을 지우면 뒤 슬라이드 UPDATE가 없으므로, 남은 첫 장에 no-op UPDATE를
  -- 발생시켜 필터된 Realtime 구독도 전체 슬라이드를 다시 읽게 한다.
  update public.slides
  set page_index = page_index
  where id = (
    select s.id
    from public.slides s
    where s.material_version_id = target_material_version_id
    order by s.page_index
    limit 1
  );

  return query select target_image_path, target_page_index, removed_questions;
end;
$function$

```

**public.find_campaign_pages**

```sql
CREATE OR REPLACE FUNCTION public.find_campaign_pages(target_code text, target_audience_group text DEFAULT NULL::text)
 RETURNS SETOF campaign_pages
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.find_campaign_pages_by_code(target_code, target_audience_group);
$function$

```

**public.find_campaign_player**

```sql
CREATE OR REPLACE FUNCTION public.find_campaign_player(target_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select private.find_campaign_player(target_campaign_id);
$function$

```

**public.find_lecture_questions**

```sql
CREATE OR REPLACE FUNCTION public.find_lecture_questions(target_lecture_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select private.find_lecture_questions(target_lecture_id);
$function$

```

**public.find_live_campaign**

```sql
CREATE OR REPLACE FUNCTION public.find_live_campaign(target_code text)
 RETURNS SETOF campaigns
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from private.find_campaign_by_code(target_code);
$function$

```

**public.import_feedback_campaign**

```sql
CREATE OR REPLACE FUNCTION public.import_feedback_campaign(target_campaign_id uuid, target_course_id uuid, target_lecture_id uuid, target_material_id uuid, target_version_id uuid, target_join_code text, target_slides jsonb, target_question_categories jsonb)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.import_feedback_campaign(
    target_campaign_id,
    target_course_id,
    target_lecture_id,
    target_material_id,
    target_version_id,
    target_join_code,
    target_slides,
    target_question_categories
  );
$function$

```

**public.rls_auto_enable**

```sql
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$

```

**public.set_campaign_audience_groups**

```sql
CREATE OR REPLACE FUNCTION public.set_campaign_audience_groups(target_campaign_id uuid, target_audience_groups text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not (select private.valid_campaign_audience_groups(target_audience_groups)) then
    raise exception 'Invalid audience groups';
  end if;

  update public.campaign_pages as page
  set audience_groups = array(
    select group_name
    from unnest(page.audience_groups) as group_name
    where group_name = any(target_audience_groups)
  )
  where page.campaign_id = target_campaign_id;

  update public.campaigns
  set audience_groups = target_audience_groups, updated_at = now()
  where id = target_campaign_id;

  if not found then
    raise exception 'Campaign not found';
  end if;
end;
$function$

```

**public.set_feedback_pin_reaction**

```sql
CREATE OR REPLACE FUNCTION public.set_feedback_pin_reaction(target_pin_id uuid, target_reacted boolean)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.set_feedback_pin_reaction(target_pin_id, target_reacted);
$function$

```

**public.set_question_reaction**

```sql
CREATE OR REPLACE FUNCTION public.set_question_reaction(target_question_id uuid, target_reacted boolean)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.set_question_reaction(target_question_id, target_reacted);
$function$

```

**public.submit_platform_experience_response**

```sql
CREATE OR REPLACE FUNCTION public.submit_platform_experience_response(target_platform text, target_code text, target_experience text, target_improvement text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  response_id uuid;
  target_lecture_id uuid;
  target_campaign_id uuid;
  normalized_experience text := btrim(target_experience);
  normalized_improvement text := btrim(target_improvement);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if char_length(normalized_experience) not between 1 and 1000
    or char_length(normalized_improvement) not between 1 and 1000 then
    raise exception 'Response fields must contain 1 to 1000 characters.' using errcode = '23514';
  end if;

  if target_platform = 'lecture' then
    select lecture.id
    into target_lecture_id
    from public.lectures as lecture
    where lecture.join_code = upper(btrim(target_code))
      and lecture.status in ('live', 'ended');

    if target_lecture_id is null then
      raise exception 'Lecture not found.' using errcode = 'P0002';
    end if;

    insert into public.platform_experience_responses (
      lecture_id,
      author_id,
      experience,
      improvement
    )
    values (
      target_lecture_id,
      (select auth.uid()),
      normalized_experience,
      normalized_improvement
    )
    returning id into response_id;
  elsif target_platform = 'feedback' then
    select campaign.id
    into target_campaign_id
    from public.campaigns as campaign
    where campaign.join_code = upper(btrim(target_code))
      and campaign.status in ('live', 'ended');

    if target_campaign_id is null then
      raise exception 'Campaign not found.' using errcode = 'P0002';
    end if;

    insert into public.platform_experience_responses (
      campaign_id,
      author_id,
      experience,
      improvement
    )
    values (
      target_campaign_id,
      (select auth.uid()),
      normalized_experience,
      normalized_improvement
    )
    returning id into response_id;
  else
    raise exception 'Unsupported platform.' using errcode = '22023';
  end if;

  return response_id;
end;
$function$

```

**이번 조사에서 사용한 주요 SELECT**

**q_constraints**

```sql
select n.nspname as schema_name, c.relname as table_name, con.conname, con.contype, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname, con.contype, con.conname
```

**q_routines**

```sql
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer, p.provolatile, p.proacl::text as privileges from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2
```

**q_policies**

```sql
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname
```

**sql_functions**

```sql
select n.nspname as schema_name, p.proname, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2
```

**sql_triggers**

```sql
select n.nspname as schema_name,c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 2,3
```

**sql_indexes**

```sql
select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname
```

**sql_counts**

```sql
select now() as checked_at,
(select count(*) from public.courses) as courses,
(select count(*) from public.lectures) as lectures,
(select count(*) from public.materials) as materials,
(select count(*) from public.material_versions) as material_versions,
(select count(*) from public.slides) as slides,
(select count(*) from public.region_anchors) as anchors,
(select count(*) from public.questions) as questions,
(select count(*) from public.answers) as answers,
(select count(*) from public.question_reactions) as reactions,
(select count(*) from public.course_brain_memory) as memories,
(select count(*) from public.session_folders) as folders,
(select count(*) from public.platform_experience_responses) as experience_responses,
(select count(*) from public.campaigns) as legacy_campaigns,
(select count(*) from public.feedback_pins) as legacy_feedback_pins
```

**query_quality**

```sql
select jsonb_build_object(
'snapshot_at', now(),
'versions', (select jsonb_build_object('total',count(*),'checksum_present',count(checksum),'import_marker',count(*) filter(where source_path like 'pin-feedback/%'),'max_version_no',max(version_no)) from public.material_versions),
'versioned_materials', (select count(*) from (select material_id from public.material_versions group by material_id having count(*)>1) x),
'slides', (select jsonb_build_object('total',count(*),'with_dimensions',count(*) filter(where width_px is not null and height_px is not null)) from public.slides),
'questions_by_origin', (select jsonb_agg(x) from (select case when v.source_path like 'pin-feedback/%' then 'legacy_import' else 'other' end origin,q.occurred_in,count(*) from public.questions q left join public.slides s on s.id=q.slide_id left join public.material_versions v on v.id=s.material_version_id group by 1,2) x),
'question_states', (select jsonb_object_agg(status,n) from (select status,count(*) n from public.questions group by status) x),
'anchor_shapes', (select jsonb_object_agg(kind,n) from (select kind,count(*) n from public.region_anchors group by kind) x),
'memory', (select jsonb_build_object('total',count(*),'with_embeddings',count(embedding),'reuse_consent_true',count(*) filter(where reuse_consent is true),'question_count',count(*) filter(where chunk_type='question'),'answer_count',count(*) filter(where chunk_type='answer')) from public.course_brain_memory),
'private_answers', (select count(*) from public.answers where visibility='private'),
'courses_without_lectures', (select count(*) from public.courses c where not exists(select 1 from public.lectures l where l.course_id=c.id)),
'anchors_without_questions', (select count(*) from public.region_anchors a where not exists(select 1 from public.questions q where q.region_id=a.id)),
'memory_missing_question', (select count(*) from public.course_brain_memory b where b.chunk_type='question' and not exists(select 1 from public.questions q where q.id=b.source_id)),
'memory_missing_answer', (select count(*) from public.course_brain_memory b where b.chunk_type='answer' and not exists(select 1 from public.answers a where a.id=b.source_id)),
'memory_question_text_mismatch', (select count(*) from public.course_brain_memory b join public.questions q on q.id=b.source_id where b.chunk_type='question' and b.content is distinct from q.raw_text),
'memory_answer_text_mismatch', (select count(*) from public.course_brain_memory b join public.answers a on a.id=b.source_id where b.chunk_type='answer' and b.content is distinct from a.body),
'question_course_lecture_mismatch', (select count(*) from public.questions q join public.lectures l on l.id=q.lecture_id where q.course_id<>l.course_id),
'question_slide_lecture_mismatch', (select count(*) from public.questions q join public.slides s on s.id=q.slide_id join public.material_versions v on v.id=s.material_version_id join public.materials m on m.id=v.material_id where q.lecture_id is distinct from m.lecture_id or q.course_id is distinct from m.course_id),
'question_region_slide_mismatch', (select count(*) from public.questions q join public.region_anchors a on a.id=q.region_id where q.slide_id is distinct from a.slide_id),
'anchor_version_mismatch', (select count(*) from public.region_anchors a join public.slides s on s.id=a.slide_id where a.material_version_id<>s.material_version_id),
'reaction_count_mismatch', (select count(*) from public.questions q where q.reaction_count<>(select count(*) from public.question_reactions r where r.question_id=q.id))
) as quality;
```

**query_metadata**

```sql
select jsonb_build_object(
'buckets', (select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) from storage.buckets),
'published_tables', (select jsonb_agg(jsonb_build_object('publication',pubname,'schema',schemaname,'table',tablename)) from pg_publication_tables where schemaname='public'),
'app_table_grants',(select jsonb_agg(jsonb_build_object('grantee',grantee,'table',table_name,'privilege',privilege_type)) from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated') and table_name in ('questions','answers','region_anchors','question_reactions','course_brain_memory')),
'app_column_grants',(select jsonb_agg(jsonb_build_object('grantee',grantee,'table',table_name,'column',column_name,'privilege',privilege_type)) from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated') and privilege_type='UPDATE' and table_name in ('questions','answers','region_anchors','question_reactions')),
'lecture_category_check', (select count(*) from pg_constraint where conrelid='public.lectures'::regclass and conname='lectures_question_categories_valid')
) as metadata;
```

**query_truth_test**

```sql
with samples(label,coords) as (values ('valid_point','{"x":0.2,"y":0.3}'::jsonb),('missing_x','{"y":0.3}'::jsonb),('missing_both','{}'::jsonb))
select label, (jsonb_typeof(coords->'x')='number' and jsonb_typeof(coords->'y')='number' and (coords->>'x')::numeric between 0 and 1 and (coords->>'y')::numeric between 0 and 1) as point_check_result,private.valid_normalized_path(coords) as path_validator_result from samples;
```

**query_lastquality**

```sql
select
(select count(*) from public.questions q where exists(select 1 from public.answers a where a.question_id=q.id)) as questions_with_answer,
(select count(*) from public.questions q where q.status='resolved' and not exists(select 1 from public.answers a where a.question_id=q.id)) as resolved_without_answer,
(select count(*) from public.region_anchors a where a.kind='point' and (jsonb_typeof(a.coords->'x') is distinct from 'number' or jsonb_typeof(a.coords->'y') is distinct from 'number')) as point_missing_numeric_xy,
(select count(*) from public.region_anchors a where a.kind='path' and (jsonb_typeof(a.coords->'points') is distinct from 'array' or not(a.coords ? 'x' and a.coords ? 'y'))) as path_missing_shape,
(select count(*) from public.questions where slide_id is null) as questions_without_slide,
(select count(*) from public.questions where region_id is null) as questions_without_anchor,
(select jsonb_object_agg(status,n) from(select status,count(*) n from public.lectures group by status)x) as lecture_states;
```


