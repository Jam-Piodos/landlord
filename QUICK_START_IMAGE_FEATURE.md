# Quick Start: Land Area Image Capture

## ✅ What's Been Done

All code has been implemented! Here's what was added:

### 1. ✅ Frontend Code (`Home.tsx`)
- Camera capture with EXIF extraction
- Image upload to Supabase Storage
- Update confirmation when image exists
- Image viewer in Land Information modal
- User-friendly "Capture Land Image" button

### 2. ✅ Dependencies Installed
- `@capacitor/camera` - Camera access
- `exifr` - EXIF data extraction
- `@capacitor/cli` - Capacitor sync

### 3. ✅ Documentation Created
- `LAND_IMAGE_FEATURE_README.md` - Complete feature guide
- `SUPABASE_STORAGE_SETUP.md` - Storage setup & policies
- `database-schema-with-image.sql` - Database schema

---

## 🚀 Setup Steps (In Order)

### Step 1: Update Database Schema
Run this SQL in your Supabase SQL Editor:

```sql
-- Add new columns to land_areas table
ALTER TABLE public.land_areas 
ADD COLUMN IF NOT EXISTS land_image_url text NULL,
ADD COLUMN IF NOT EXISTS exif_data jsonb NULL;
```

### Step 2: Create Storage Bucket & Policies
Run this complete SQL script in Supabase SQL Editor:

```sql
-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('land-area-images', 'land-area-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy 1: Allow authenticated users to upload
CREATE POLICY "Allow authenticated users to upload land images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'land-area-images' 
  AND (storage.foldername(name))[1] = 'land-images'
);

-- Policy 2: Allow public read access
CREATE POLICY "Allow public read access to land images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'land-area-images');

-- Policy 3: Allow authenticated users to update
CREATE POLICY "Allow authenticated users to update land images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'land-area-images')
WITH CHECK (bucket_id = 'land-area-images');

-- Policy 4: Allow authenticated users to delete
CREATE POLICY "Allow authenticated users to delete land images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'land-area-images');
```

### Step 3: Build & Deploy

#### For Web Testing:
```bash
npm run dev
```

#### For Android:
```bash
# 1. Build web assets
npm run build

# 2. Sync with Android
npx cap sync android

# 3. Open in Android Studio
npx cap open android

# 4. Build and run on device
```

---

## 📱 How to Use

### As a Surveyor:

1. **Open a land area** (click on polygon)
2. **Click "Capture Land Image"** button
3. **Take a photo** with your device camera
4. **Review image and GPS data**
5. **Click "Save Image"** to upload

### If Image Already Exists:
- A confirmation dialog will appear
- Preview shows the new image
- Click "Yes, Replace Image" to update
- Or "Cancel" to keep the old image

### Viewing Images:
- Open any land area with an image
- Image displays at top of Land Information modal
- Click image to view full-size
- GPS and camera metadata shown below image

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Database columns added (`land_image_url`, `exif_data`)
- [ ] Storage bucket `land-area-images` created
- [ ] Bucket is set to **public**
- [ ] All 4 storage policies applied
- [ ] App builds without errors
- [ ] Camera opens on device
- [ ] Image uploads successfully
- [ ] Image displays in land info modal
- [ ] GPS coordinates appear in metadata
- [ ] Update confirmation works when replacing images

---

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Camera won't open | Check device permissions, restart app |
| No GPS data | Enable Location Services, take photo outdoors |
| Upload fails | Check internet, verify bucket & policies exist |
| Image won't display | Verify bucket is public, check policies |
| Can't replace image | Ensure DELETE policy is applied |

---

## 📊 Storage Bucket Configuration

**Bucket Name**: `land-area-images`

**Settings**:
- ✅ Public: Yes
- 📁 Folder: `land-images/`
- 📏 File Size: 5MB (default)
- 📷 Types: `image/jpeg`, `image/png`, `image/jpg`

**File Naming**: `land-{area-id}-{timestamp}.jpg`

**Example URL**: 
```
https://yourproject.supabase.co/storage/v1/object/public/land-area-images/land-images/land-abc123-1729695000000.jpg
```

---

## 📋 Database Schema Reference

### `land_areas` Table Additions:

```sql
land_image_url text NULL        -- Public URL of the image
exif_data jsonb NULL            -- GPS and camera metadata
```

### Example `exif_data` Content:
```json
{
  "latitude": 14.599512,
  "longitude": 120.984222,
  "altitude": 15.5,
  "make": "Samsung",
  "model": "SM-G998B",
  "dateTime": "2025-10-23T14:30:00.000Z"
}
```

---

## 🎯 What Changed in the UI

### Before:
- "Capture EXIF" button (technical term)
- Direct save without checking existing images
- EXIF data only, no image storage

### After:
- "Capture Land Image" button (user-friendly)
- Confirmation when replacing existing images
- Full image storage + metadata
- Image viewer in land info modal
- "Image Metadata" instead of "EXIF Data"

---

## 📚 Full Documentation

For detailed information, see:
- **`LAND_IMAGE_FEATURE_README.md`** - Complete feature guide
- **`SUPABASE_STORAGE_SETUP.md`** - Storage policies & troubleshooting
- **`database-schema-with-image.sql`** - Full database schema

---

## 🎉 You're Ready!

Everything is implemented and ready to test. Just complete the 3 setup steps above and you can start capturing land images with GPS data!

**Need help?** Check the full documentation files or the troubleshooting sections.

