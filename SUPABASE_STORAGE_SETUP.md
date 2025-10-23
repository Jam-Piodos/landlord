# Supabase Storage Setup for Land Area Images

This document provides step-by-step instructions for setting up Supabase Storage bucket and policies for the Land Area Image feature.

## 1. Create Storage Bucket

### Via Supabase Dashboard:
1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Configure the bucket:
   - **Name**: `land-area-images`
   - **Public bucket**: ✅ **Enable** (so images can be viewed without authentication)
   - **File size limit**: 5MB (recommended, adjust as needed)
   - **Allowed MIME types**: `image/jpeg`, `image/png`, `image/jpg`
5. Click **"Create bucket"**

### Via SQL (Alternative):
```sql
-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('land-area-images', 'land-area-images', true);
```

## 2. Set Up Storage Policies

Storage policies control who can upload, view, and delete images. Apply these policies to the `land-area-images` bucket.

### Policy 1: Allow Authenticated Users to Upload Images
**Policy Name**: `Allow authenticated users to upload land images`

**Operation**: `INSERT`

**Target roles**: `authenticated`

**Policy definition**:
```sql
CREATE POLICY "Allow authenticated users to upload land images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'land-area-images' 
  AND (storage.foldername(name))[1] = 'land-images'
);
```

**What it does**: Allows logged-in users to upload images to the `land-images` folder within the bucket.

---

### Policy 2: Allow Public Read Access to Images
**Policy Name**: `Allow public read access to land images`

**Operation**: `SELECT`

**Target roles**: `public`, `authenticated`, `anon`

**Policy definition**:
```sql
CREATE POLICY "Allow public read access to land images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'land-area-images');
```

**What it does**: Allows anyone (including unauthenticated users) to view the images. This is necessary for the public URLs to work.

---

### Policy 3: Allow Authenticated Users to Update Their Images
**Policy Name**: `Allow authenticated users to update land images`

**Operation**: `UPDATE`

**Target roles**: `authenticated`

**Policy definition**:
```sql
CREATE POLICY "Allow authenticated users to update land images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'land-area-images')
WITH CHECK (bucket_id = 'land-area-images');
```

**What it does**: Allows logged-in users to update (replace) images in the bucket.

---

### Policy 4: Allow Authenticated Users to Delete Images
**Policy Name**: `Allow authenticated users to delete land images`

**Operation**: `DELETE`

**Target roles**: `authenticated`

**Policy definition**:
```sql
CREATE POLICY "Allow authenticated users to delete land images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'land-area-images');
```

**What it does**: Allows logged-in users to delete images from the bucket (used when replacing old images).

---

## 3. Apply All Policies at Once

You can run this complete SQL script in the Supabase SQL Editor:

```sql
-- Create the storage bucket (if not already created via dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('land-area-images', 'land-area-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy 1: Upload
CREATE POLICY "Allow authenticated users to upload land images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'land-area-images' 
  AND (storage.foldername(name))[1] = 'land-images'
);

-- Policy 2: Read (Public Access)
CREATE POLICY "Allow public read access to land images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'land-area-images');

-- Policy 3: Update
CREATE POLICY "Allow authenticated users to update land images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'land-area-images')
WITH CHECK (bucket_id = 'land-area-images');

-- Policy 4: Delete
CREATE POLICY "Allow authenticated users to delete land images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'land-area-images');
```

## 4. Configure Bucket Settings (Optional)

### File Size Limit
```sql
-- Set maximum file size to 5MB
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'land-area-images';
```

### Allowed MIME Types
```sql
-- Restrict to image types only
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg']
WHERE id = 'land-area-images';
```

## 5. Verify Setup

### Test Upload (via SQL)
```sql
-- Check if bucket exists and is public
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'land-area-images';
```

### Test Policies
```sql
-- View all policies for the bucket
SELECT *
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage';
```

## 6. Folder Structure

The app automatically organizes images in this structure:
```
land-area-images/
└── land-images/
    ├── land-{uuid}-{timestamp}.jpg
    ├── land-{uuid}-{timestamp}.jpg
    └── ...
```

Example path: `land-images/land-abc123-1729695000000.jpg`

Example public URL: `https://your-project.supabase.co/storage/v1/object/public/land-area-images/land-images/land-abc123-1729695000000.jpg`

## 7. Security Considerations

### Current Setup (Public Bucket)
- ✅ **Pros**: 
  - Simple to implement
  - Images load quickly without authentication
  - Shareable URLs
  
- ⚠️ **Cons**: 
  - Anyone with the URL can view images
  - Images are publicly accessible

### Alternative: Private Bucket (More Secure)

If you need to restrict image access to authenticated users only:

1. Create the bucket as **private** instead of public
2. Use different policies:

```sql
-- For private bucket, change the SELECT policy:
CREATE POLICY "Allow authenticated users to read land images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'land-area-images');
```

3. Update the app code to use **signed URLs** instead of public URLs:

```typescript
const { data: signedUrl } = await supabase.storage
  .from('land-area-images')
  .createSignedUrl(filePath, 3600); // URL valid for 1 hour
```

## 8. Troubleshooting

### Issue: "new row violates row-level security policy"
**Solution**: Make sure you've applied all the policies above and that the user is authenticated.

### Issue: Images not loading
**Solution**: 
- Verify the bucket is set to `public: true`
- Check that the public read policy is applied
- Verify the image URL format is correct

### Issue: Upload fails
**Solution**:
- Check file size limits
- Verify allowed MIME types
- Ensure user is authenticated
- Check the upload policy is applied

### Issue: Cannot delete old images
**Solution**:
- Verify the DELETE policy is applied
- Check that the file path is correct
- Ensure user has proper permissions

## 9. Monitoring and Maintenance

### View Storage Usage
```sql
SELECT 
  bucket_id,
  COUNT(*) as file_count,
  SUM(metadata->>'size')::bigint as total_size_bytes,
  pg_size_pretty(SUM(metadata->>'size')::bigint) as total_size
FROM storage.objects
WHERE bucket_id = 'land-area-images'
GROUP BY bucket_id;
```

### List All Images
```sql
SELECT 
  name,
  metadata->>'size' as size_bytes,
  created_at,
  updated_at
FROM storage.objects
WHERE bucket_id = 'land-area-images'
ORDER BY created_at DESC
LIMIT 100;
```

### Clean Up Old Images (if needed)
```sql
-- Delete images older than 1 year
DELETE FROM storage.objects
WHERE bucket_id = 'land-area-images'
AND created_at < NOW() - INTERVAL '1 year';
```

## 10. Cost Considerations

Supabase Storage pricing (as of 2025):
- **Free Tier**: 1GB storage, 2GB bandwidth per month
- **Pro Plan**: 100GB storage, 200GB bandwidth per month
- **Additional**: $0.021/GB storage, $0.09/GB bandwidth

**Estimated usage for land images:**
- Average image: 2-3MB
- 1000 images ≈ 2-3GB storage
- Plan accordingly based on your needs

---

## Summary Checklist

- [ ] Create `land-area-images` bucket (public)
- [ ] Apply INSERT policy for uploads
- [ ] Apply SELECT policy for public read
- [ ] Apply UPDATE policy for updates
- [ ] Apply DELETE policy for deletions
- [ ] Set file size limit (optional)
- [ ] Set allowed MIME types (optional)
- [ ] Test upload functionality
- [ ] Verify images are accessible
- [ ] Monitor storage usage

Once all policies are in place, the Land Area Image feature will work seamlessly!

