-- Land Areas Table with EXIF Data Support
-- This script updates the land_areas table to include EXIF data storage
-- The exif_data column is already included in the schema below

-- Drop existing table if you need to recreate (WARNING: This will delete all data)
-- DROP TABLE IF EXISTS public.land_areas CASCADE;

-- Create or update the land_areas table
CREATE TABLE IF NOT EXISTS public.land_areas (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  user_id integer NULL,
  path jsonb NOT NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  lhid text NULL,
  title_number text NULL,
  lo_name text NULL,
  moa text NULL,
  barangay_name text NULL,
  total_area text NULL,
  survey_number text NULL,
  lot_number text NULL,
  current_status text NULL,
  current_status_desc text NULL,
  problem_category text NULL,
  sub_category text NULL,
  remarks text NULL,
  land_status text NULL DEFAULT 'workable'::text,
  exif_data jsonb NULL,  -- Stores EXIF data from camera captures
  CONSTRAINT land_areas_pkey PRIMARY KEY (id),
  CONSTRAINT land_areas_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT land_areas_land_status_check CHECK (
    (land_status = ANY (ARRAY['workable'::text, 'problematic'::text]))
  )
) TABLESPACE pg_default;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS land_areas_land_status_idx 
  ON public.land_areas USING btree (land_status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS land_areas_created_at_idx 
  ON public.land_areas USING btree (created_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS land_areas_barangay_idx 
  ON public.land_areas USING btree (barangay_name) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS land_areas_status_idx 
  ON public.land_areas USING btree (current_status) TABLESPACE pg_default;

-- Optional: Create an index on EXIF data for GPS coordinates if you plan to query by location
-- This uses GIN index for JSONB data
CREATE INDEX IF NOT EXISTS land_areas_exif_data_idx 
  ON public.land_areas USING gin (exif_data) TABLESPACE pg_default;

-- If you need to add the exif_data column to an existing table, use this:
-- ALTER TABLE public.land_areas ADD COLUMN IF NOT EXISTS exif_data jsonb NULL;

-- Example EXIF data structure that will be stored:
-- {
--   "latitude": 14.599512,
--   "longitude": 120.984222,
--   "altitude": 15.5,
--   "make": "Samsung",
--   "model": "SM-G998B",
--   "dateTime": "2025-10-23T14:30:00.000Z",
--   "software": "Android 13",
--   "orientation": 1,
--   "exposureTime": 0.008,
--   "fNumber": 1.8,
--   "iso": 100,
--   "focalLength": 5.4,
--   "flash": 0,
--   "whiteBalance": 0,
--   "imageWidth": 4000,
--   "imageHeight": 3000
-- }

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL ON public.land_areas TO authenticated;
-- GRANT SELECT ON public.land_areas TO anon;

