--Just a utility function
CREATE OR REPLACE FUNCTION sort_array(BIGINT [])
	RETURNS BIGINT [] AS $$
SELECT ARRAY(SELECT unnest($1) ORDER BY 1);
$$ LANGUAGE SQL IMMUTABLE;

/**
 * User and account details
 */
CREATE TABLE projects (
	api_key UUID PRIMARY KEY,
	name TEXT NOT NULL DEFAULT '' CHECK(length(name)>0 AND length(name) < 128),
	enabled BOOLEAN NOT NULL DEFAULT TRUE,
	should_transform_page_expression TEXT NULL CHECK (length(should_transform_page_expression) < 1024),
	should_transform_script_expression TEXT NULL CHECK (length(should_transform_script_expression) < 1024),
	run_on_mobile_browsers BOOLEAN DEFAULT FALSE,
	--List of match patterns for domains/scripts which will allow cross-origin injection for scripts loaded from them
	cors_allowed_patterns TEXT[] NOT NULL DEFAULT '{}',
	follow_script_source_map_comments BOOLEAN DEFAULT TRUE NOT NULL,
	script_source_map_extra_cookies TEXT[] NOT NULL DEFAULT '{}',
	script_source_map_extra_headers TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE users (--Known users
	user_id BIGSERIAL NOT NULL PRIMARY KEY,
	uid TEXT UNIQUE NOT NULL, --UID claim returned via Firebase authentication
	email TEXT NULL, --Last known email associated with account
	name TEXT NULL, --Last known user name associated with account
	first_login BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE user_projects (--Maps users to API keys they have access to
	user_id BIGINT REFERENCES users(user_id),
	api_key UUID NOT NULL REFERENCES projects (api_key)
);

/**
 * Collection information
 */
CREATE TABLE scripts (--Assign an ID and store content for every unique apiKey, url, and script content hash
	script_id BIGSERIAL PRIMARY KEY,
	api_key UUID NOT NULL REFERENCES projects (api_key),
	url TEXT NOT NULL,
	hash INT NOT NULL,
	UNIQUE (api_key, url, hash)
);
CREATE INDEX ON scripts (api_key);
CREATE INDEX ON scripts (url, hash);

CREATE TABLE script_content (--Script content, kept separately from script to cache separately.
	script_id BIGINT NOT NULL UNIQUE REFERENCES scripts (script_id),
	content TEXT NOT NULL,
	source_map JSONB NULL --A JSON object containing all the information necessary for a source mapping.
);
CREATE INDEX ON script_content (script_id);

CREATE TABLE script_source_mapped_scripts (--All "urls" found in a script's source map
	script_id BIGINT NOT NULL REFERENCES scripts (script_id),
	url TEXT NOT NULL
);
CREATE INDEX ON script_source_mapped_scripts (script_id);

CREATE TABLE script_metadata (--Miscellaneous bookkeeping on scripts. Separate from script table as is mutable.
	script_id BIGINT PRIMARY KEY REFERENCES scripts (script_id),
	mapped BOOLEAN DEFAULT FALSE NOT NULL,
	use_count BIGINT DEFAULT 0 NOT NULL
);

/*
 * Caches
 */
CREATE TABLE script_configurations (--A cacheable configuration object from which actual client configs are generated. Required for sourcemap reconstruction.
	script_configuration_id BIGSERIAL PRIMARY KEY,
	script_id BIGINT NOT NULL REFERENCES scripts (script_id),
	json JSONB NOT NULL,
	time TIMESTAMP DEFAULT (localtimestamp) NOT NULL
);
CREATE INDEX script_configurations_by_time
	ON script_configurations (time);
CREATE INDEX script_configurations_by_script
	ON script_configurations (script_id);

/*
 * Script symbol location mapping
 */
CREATE TABLE script_sets (--Sets of scripts, nontransitive
	script_set_id BIGSERIAL PRIMARY KEY,
	members BIGINT [] NOT NULL UNIQUE,
	use_count BIGINT NOT NULL
);
CREATE INDEX ON script_sets USING GIN (members);
CREATE UNIQUE INDEX ON script_sets (sort_array(members));

CREATE TABLE statement_sets (--Set of statements mapped to each other, transitive
	statement_set_id BIGSERIAL PRIMARY KEY,
	weighted_execution_sum BIGINT NOT NULL DEFAULT 0,
	script_set BIGINT DEFAULT 0 NOT NULL REFERENCES script_sets (script_set_id)
);

CREATE TABLE IF NOT EXISTS statement_set_members (
	script_id BIGINT REFERENCES scripts (script_id) NOT NULL,
	symbol_position INT NOT NULL CHECK (symbol_position >= 0),
	UNIQUE (script_id, symbol_position),
	statement_set_id BIGINT REFERENCES statement_sets (statement_set_id) NOT NULL
);


CREATE TABLE statement_set_mapping_failures (
	-- Describes failed attempts at locating a statement set in a script.
	-- Enough entries may preclude even attempting to locate a statement set in future scripts.
	script_id BIGINT REFERENCES scripts (script_id) NOT NULL,
	statement_set_id BIGINT REFERENCES statement_sets (statement_set_id),
	UNIQUE (script_id, statement_set_id)
);


--Ensure there's a script set for every statement_set's script members
CREATE OR REPLACE FUNCTION create_script_set()
	RETURNS TRIGGER AS $$
DECLARE
	member_scripts BIGINT [];
	result_script_set_id BIGINT;
BEGIN
	SELECT sort_array(array_agg(script_id))
	FROM statement_set_members
	WHERE statement_set_id = new.statement_set_id
	INTO member_scripts;

	WITH updated AS (INSERT INTO script_sets (members, use_count)
		SELECT
			mems.*, coalesce(uc.usc, 0)
		FROM (SELECT coalesce(member_scripts, '{}')) AS mems
			LEFT JOIN (SELECT sum(use_count) AS usc
			FROM script_metadata
			WHERE script_id = ANY (member_scripts)) uc ON TRUE
	ON CONFLICT DO NOTHING
	RETURNING script_set_id)
	(SELECT * FROM updated
	 UNION ALL
	 SELECT script_set_id FROM script_sets WHERE sort_array(members) = member_scripts)
	 INTO result_script_set_id;
	new.script_set := result_script_set_id;
	RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_script_set_trigger
BEFORE INSERT OR UPDATE ON statement_sets
FOR EACH ROW EXECUTE PROCEDURE create_script_set();


CREATE FUNCTION update_script_set()
	RETURNS TRIGGER AS $$
BEGIN
	UPDATE statement_sets
	SET script_set = script_set --Useless update for trigger
	WHERE statement_set_id = new.statement_set_id;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_script_set_trigger
AFTER INSERT OR UPDATE ON statement_set_members
FOR EACH ROW EXECUTE PROCEDURE update_script_set();

--Update the script set as uses increase
CREATE FUNCTION update_script_set_use_count()
	RETURNS TRIGGER AS $$
BEGIN
	IF tg_op = 'UPDATE'
	THEN
		UPDATE script_sets
		SET use_count = script_sets.use_count + new.use_count - old.use_count
		WHERE new.script_id = ANY (script_sets.members);
	ELSE
		UPDATE script_sets
		SET use_count = script_sets.use_count + new.use_count
		WHERE new.script_id = ANY (script_sets.members);
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_script_set_use_count
AFTER INSERT OR UPDATE ON script_metadata
FOR EACH ROW EXECUTE PROCEDURE update_script_set_use_count();


/*
 * Script transformation configuration
 */
CREATE TYPE SCRIPT_COMMAND_TYPES AS ENUM ('INCLUSION', 'ADD_CODE');

CREATE TABLE script_commands (--User-specified commands to apply to a script served to clients
	script_command_id BIGSERIAL PRIMARY KEY,
	api_key UUID REFERENCES projects (api_key) NOT NULL,
	url TEXT NOT NULL,
	script_id BIGINT NOT NULL REFERENCES scripts (script_id),
	symbol_position INT NOT NULL CHECK (symbol_position >= 0),
	command_type SCRIPT_COMMAND_TYPES NOT NULL,
	command_data JSONB NOT NULL
);
CREATE INDEX ON script_commands (url);


CREATE TYPE DEFAULTABLE_BOOLEAN AS ENUM ('TRUE', 'FALSE', 'DEFAULT');

CREATE TABLE script_settings (
	api_key UUID REFERENCES projects (api_key),
	url TEXT NOT NULL,
	from_source_map_url TEXT NULL,
	UNIQUE (api_key, url, from_source_map_url),
	collection_enabled DEFAULTABLE_BOOLEAN DEFAULT 'DEFAULT'
);
CREATE INDEX ON script_settings (api_key, url, from_source_map_url);

CREATE TABLE script_version_to_script_version_mappings (
	from_id BIGINT REFERENCES scripts (script_id) NOT NULL,
	to_id BIGINT REFERENCES scripts (script_id) NOT NULL,
	from_symbol_position INT NOT NULL,
	to_symbol_position INT NOT NULL,
	UNIQUE (from_id, to_id, from_symbol_position)
);
CREATE INDEX ON script_version_to_script_version_mappings (from_id, from_symbol_position);
CREATE INDEX ON script_version_to_script_version_mappings (to_id, to_symbol_position);


/*
 * Tables storing data directly collected from clients
 */
CREATE TABLE transformed_sessions (--Session information from collection clients
	transformed_session_id BIGSERIAL PRIMARY KEY,
	api_key UUID NOT NULL REFERENCES projects (api_key),
	ip_address INET NOT NULL,
	start_time TIMESTAMP DEFAULT (localtimestamp) NOT NULL,
	end_time TIMESTAMP DEFAULT (NULL) NULL
);
CREATE INDEX ON transformed_sessions (api_key);
CREATE INDEX ON transformed_sessions (ip_address);

CREATE TABLE transformed_session_script_configurations (--A mapping of which script configurations were sent for every script in a session
	transformed_session_id BIGINT REFERENCES transformed_sessions (transformed_session_id) NOT NULL,
	script_id BIGINT REFERENCES scripts (script_id) NOT NULL,
	script_configuration_id BIGINT REFERENCES script_configurations (script_configuration_id) NOT NULL,
	seed INT NOT NULL --Random seed used to customize script execution
);
CREATE INDEX ON transformed_session_script_configurations (transformed_session_id);
CREATE INDEX ON transformed_session_script_configurations (script_id);



CREATE TABLE script_command_added_code_results (
	added_code_result_id BIGSERIAL PRIMARY KEY NOT NULL,
	script_command_id BIGINT REFERENCES script_commands(script_command_id) ON DELETE CASCADE NOT NULL,
	transformed_session_id BIGINT REFERENCES transformed_sessions(transformed_session_id) NOT NULL,
	time TIMESTAMP DEFAULT (localtimestamp) NOT NULL,
	result JSONB NOT NULL
);
CREATE INDEX ON script_command_added_code_results(script_command_id);
CREATE INDEX ON script_command_added_code_results(transformed_session_id);


CREATE TABLE unsummed_executed_lines (
	script_id BIGINT NOT NULL REFERENCES scripts (script_id),
	symbol_position INT NOT NULL CHECK (symbol_position >= 0),
	weighted_executions BIGINT NOT NULL
);

CREATE TABLE executed_lines_log (--Stores number of times lines of interest executed in a file per user session.
	transformed_session_id BIGINT NOT NULL REFERENCES transformed_sessions (transformed_session_id),
	script_id BIGINT NOT NULL REFERENCES scripts (script_id),
	symbol_position INT NOT NULL CHECK (symbol_position >=
		0), --The starting character index of the javascript declaration, as parsed by acorn
	weighted_executions BIGINT NOT NULL, --Number of weighted executions. As a performance measure, clients are given less probability of executing a line in exchange for more execution weight as the total number of executions increases.
	UNIQUE (transformed_session_id, script_id, symbol_position)
);
CREATE INDEX ON executed_lines_log (script_id, symbol_position);
CREATE INDEX ON executed_lines_log (transformed_session_id);

/*
 * Second-order aggregate data
 */
CREATE TABLE script_execution_sums (--A table derived from execution_sums that holds the aggregate count
	script_id BIGINT NOT NULL REFERENCES scripts (script_id),
	symbol_position INT NOT NULL CHECK (symbol_position >= 0),
	UNIQUE (script_id, symbol_position),
	weighted_executions BIGINT NOT NULL
);
CREATE INDEX ON script_execution_sums (script_id, symbol_position);

--Ensure there's a script execution sum row for every script_id, symbol_position that occurs in executed_lines
CREATE FUNCTION ensure_script_execution_sum(arg_script_id BIGINT, arg_symbol_position INT)
	RETURNS VOID AS $$
BEGIN
	INSERT INTO script_execution_sums (script_id, symbol_position, weighted_executions)
	VALUES (arg_script_id, arg_symbol_position, 0)
	ON CONFLICT (script_id, symbol_position)
		DO NOTHING;
END;
$$ LANGUAGE plpgsql;

--Ensure there's a statement set for every script_id/symbol_position pair referenced in a command or in an executed line
CREATE FUNCTION ensure_statement_set(arg_script_id BIGINT, arg_symbol_position INT)
	RETURNS VOID AS $$
DECLARE
	existing_set_id BIGINT;
BEGIN
	existing_set_id := (SELECT statement_set_id
	FROM statement_set_members
	WHERE script_id = arg_script_id AND symbol_position = arg_symbol_position);
	IF existing_set_id IS NULL
	THEN
		INSERT INTO statement_sets DEFAULT VALUES RETURNING statement_set_id
			INTO existing_set_id;
		INSERT INTO statement_set_members (script_id, symbol_position, statement_set_id)
		VALUES (arg_script_id, arg_symbol_position, existing_set_id);
	END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION ensure_statement_support_rows_trigger()
	RETURNS TRIGGER AS $$
BEGIN
	PERFORM
		ensure_statement_set(new.script_id, new.symbol_position),
		ensure_script_execution_sum(new.script_id, new.symbol_position);
	RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER create_statement_set_commands_trigger
AFTER INSERT ON script_commands
FOR EACH ROW EXECUTE PROCEDURE ensure_statement_support_rows_trigger();


CREATE OR REPLACE FUNCTION update_execution_sums()
	RETURNS VOID AS $$
BEGIN
	--Claim data for processing
	CREATE TEMPORARY TABLE lines(script_id BIGINT, symbol_position INT, weighted_executions BIGINT) ON COMMIT DROP;
	WITH u as (DELETE FROM unsummed_executed_lines RETURNING script_id, symbol_position, weighted_executions)
	INSERT INTO lines SELECT script_id, symbol_position, sum(weighted_executions) FROM u GROUP BY script_id, symbol_position;
	--Ensure support rows exist for this data
	PERFORM
		ensure_statement_set(script_id, symbol_position), ensure_script_execution_sum(script_id, symbol_position)
	FROM lines;

	UPDATE script_execution_sums
	SET weighted_executions = script_execution_sums.weighted_executions + lines.weighted_executions
	FROM lines
	WHERE script_execution_sums.script_id = lines.script_id AND
		script_execution_sums.symbol_position = lines.symbol_position;

	WITH statement_set_updates AS (
		SELECT statement_set_id, sum(weighted_executions) as weighted_executions FROM statement_set_members
			JOIN lines USING (script_id, symbol_position)
		GROUP BY statement_set_id
	)
	UPDATE statement_sets
	SET weighted_execution_sum = weighted_execution_sum + statement_set_updates.weighted_executions
	FROM statement_set_updates WHERE statement_set_updates.statement_set_id = statement_sets.statement_set_id;
END;
$$ LANGUAGE plpgsql;

/*
 * Reports/logs
 */
CREATE TABLE dead_code_reports(
	report_id BIGSERIAL PRIMARY KEY,
	api_key UUID REFERENCES projects (api_key) NOT NULL,
	created TIMESTAMP DEFAULT (localtimestamp) NOT NULL,
	report_json JSONB NOT NULL
);

/*
 * Internal work processing
 */
CREATE TYPE JOB_TYPES AS ENUM ('GENERATE_SCRIPT_CONFIGURATION');

CREATE TABLE jobs (
	job_id BIGSERIAL PRIMARY KEY NOT NULL,
	submitted TIMESTAMP DEFAULT (localtimestamp) NOT NULL,
	scheduled_run_time TIMESTAMP DEFAULT (localtimestamp) NOT NULL,
	finished TIMESTAMP NULL,
	type JOB_TYPES NOT NULL,
	parameter TEXT NOT NULL,
	data JSONB NOT NULL,
	result JSONB NULL,
	worker UUID NULL
);
CREATE INDEX ON jobs (type, parameter);
CREATE INDEX ON jobs (finished);
CREATE UNIQUE INDEX ON jobs (type, parameter)
	WHERE finished IS NULL;

CREATE TABLE pending_jobs (
	job_id BIGINT NOT NULL REFERENCES jobs (job_id),
	type TEXT NOT NULL,
	scheduled_run_time TIMESTAMP NOT NULL
);
CREATE INDEX ON pending_jobs (type);
CREATE INDEX ON pending_jobs (scheduled_run_time);


CREATE FUNCTION insert_into_queue()
	RETURNS TRIGGER AS $$
BEGIN
	INSERT INTO pending_jobs (job_id, type, scheduled_run_time) VALUES (new.job_id, new.type, new.scheduled_run_time);
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER insert_into_queue_trigger
AFTER INSERT ON jobs
FOR EACH ROW EXECUTE PROCEDURE insert_into_queue();

INSERT INTO projects VALUES ('e5b72ba4-9c06-47aa-86b3-193b78732aa9' :: UUID, 'Developer key');
INSERT INTO users(user_id, uid, email, name) VALUES (0, '7yAwpgpG9oZuuJPmjxwhVESBko12', 'test@developer.com', 'Test Developer');
INSERT INTO user_projects VALUES (0, 'e5b72ba4-9c06-47aa-86b3-193b78732aa9' :: UUID);