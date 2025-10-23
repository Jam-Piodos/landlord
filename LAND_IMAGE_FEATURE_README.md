# Land Area Image Capture Feature

## Overview
This feature allows surveyors to capture geo-tagged images of land areas with embedded GPS coordinates and camera metadata (EXIF data). Images are stored in Supabase Storage and linked to land area records.

## What Was Added

### 1. Packages Installed
- `@capacitor/camera` - Capacitor plugin for camera access
- `exifr` - Library for extracting EXIF metadata from images
- `@capacitor/cli` - For syncing Capacitor plugins

### 2. Database Schema
The `land_areas` table includes:
- `land_image_url` (text) - Public URL of the stored image
- `exif_data` (jsonb) - GPS coordinates and camera metadata

See `database-schema-with-image.sql` for the complete schema.

### 3. Supabase Storage
Images are stored in a Supabase Storage bucket called `land-area-images`.
See `SUPABASE_STORAGE_SETUP.md` for complete setup instructions and policies.

### 4. Features Implemented

#### 📸 Image Capture
- **"Capture Land Image" Button**: Available in the Land Information modal
- **Camera Integration**: Opens device camera to take a photo
- **EXIF Extraction**: Automatically extracts GPS coordinates, camera info, and metadata
- **Image Preview**: Shows captured image before saving

#### 🔄 Update Protection
- **Existing Image Check**: Detects if a land area already has an image
- **Confirmation Dialog**: Asks permission before replacing existing images
- **Old Image Cleanup**: Automatically deletes old images when updating

#### 💾 Image Storage
- **Supabase Storage**: Images uploaded to cloud storage
- **Public URLs**: Images accessible via public URLs
- **Metadata Storage**: GPS and camera data stored in database

#### 👁️ Image Viewing
- **In-App Display**: View land image in Land Information modal
- **Full-Size View**: Click image to open full-size in new tab
- **Metadata Display**: Shows GPS coordinates, camera make/model, capture date

## How to Use

### For Surveyors:

#### Capturing a New Image
1. **Select a land area** by clicking on a polygon on the map
2. In the Land Information modal, click **"Capture Land Image"**
3. Take a photo of the land using your device camera
4. Review the captured image and metadata in the preview
5. Click **"Save Image"** to upload and attach to the land record

#### Updating an Existing Image
1. Follow steps 1-3 above
2. A confirmation dialog will appear: "Image Already Exists"
3. Review the new image preview
4. Click **"Yes, Replace Image"** to update, or **"Cancel"** to keep the old image

#### Viewing Saved Images
1. Open any land area with an image
2. The image appears at the top of the Land Information modal
3. Below the image, view the Image Metadata section showing:
   - GPS Latitude/Longitude
   - Altitude
   - Camera make and model
   - Capture date
4. Click the image to view full-size in a new browser tab

## Image Metadata Captured

When available, the following data is extracted and stored:

### GPS Data
- **Latitude** - Exact north-south position
- **Longitude** - Exact east-west position
- **Altitude** - Height above sea level in meters

### Camera Information
- **Make** - Camera manufacturer (e.g., "Samsung", "Apple")
- **Model** - Device model (e.g., "SM-G998B", "iPhone 14")
- **Software** - Camera software version

### Photo Details
- **Date/Time** - When the photo was captured
- **ISO** - Camera sensitivity setting
- **Focal Length** - Lens focal length in millimeters
- **Exposure Time** - Shutter speed in seconds
- **F-Number** - Aperture setting
- **Image Dimensions** - Width × height in pixels
- **Flash** - Flash status
- **White Balance** - White balance setting
- **Orientation** - Image orientation

## Setup Instructions

### 1. Database Setup
Run the SQL script in Supabase SQL Editor:
```bash
# See database-schema-with-image.sql
```

Add these columns to your `land_areas` table:
```sql
ALTER TABLE public.land_areas ADD COLUMN IF NOT EXISTS exif_data jsonb NULL;
ALTER TABLE public.land_areas ADD COLUMN IF NOT EXISTS land_image_url text NULL;
```

### 2. Supabase Storage Setup
Follow the complete guide in `SUPABASE_STORAGE_SETUP.md`:

1. **Create bucket** `land-area-images` (public)
2. **Apply policies**:
   - INSERT: Allow authenticated uploads
   - SELECT: Allow public read access
   - UPDATE: Allow authenticated updates
   - DELETE: Allow authenticated deletions

Quick setup SQL:
```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('land-area-images', 'land-area-images', true)
ON CONFLICT (id) DO NOTHING;

-- Apply policies (see SUPABASE_STORAGE_SETUP.md for full policies)
```

### 3. Build for Android
```bash
# Install dependencies
npm install

# Build web assets
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

### 4. Android Permissions
The Camera plugin automatically requests permissions. Verify in `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
```

## File Structure

### Storage Organization
```
land-area-images/
└── land-images/
    ├── land-{uuid}-{timestamp}.jpg
    ├── land-{uuid}-{timestamp}.jpg
    └── ...
```

### Example Data
**Image URL** (stored in `land_image_url`):
```
https://yourproject.supabase.co/storage/v1/object/public/land-area-images/land-images/land-abc123-1729695000000.jpg
```

**EXIF Data** (stored in `exif_data` jsonb):
```json
{
  "latitude": 14.599512,
  "longitude": 120.984222,
  "altitude": 15.5,
  "make": "Samsung",
  "model": "SM-G998B",
  "dateTime": "2025-10-23T14:30:00.000Z",
  "iso": 100,
  "focalLength": 5.4
}
```

## Best Practices

### For Accurate GPS Data
1. **Enable Location Services** on the device before taking photos
2. **Grant GPS Permission** to the camera app
3. **Take photos on-site** for accurate coordinates
4. **Wait for GPS lock** - give the device a moment to acquire satellites
5. **Use native camera** - some third-party apps strip EXIF data

### For Better Images
1. **Good lighting** - Take photos in daylight when possible
2. **Steady shots** - Hold device steady to avoid blur
3. **Clear view** - Capture clear identifying features of the land
4. **Proper orientation** - Hold device upright for proper image orientation
5. **File size** - Images are limited to 5MB by default

### Data Management
1. **Review before saving** - Check GPS coordinates are present
2. **Update when needed** - Replace images if land changes significantly
3. **Verify location** - Compare EXIF GPS with mapped polygon boundaries
4. **Regular backups** - Supabase handles backups, but monitor storage usage

## Troubleshooting

### Camera Not Opening
- ✅ Check camera permissions in device settings
- ✅ Ensure app has camera access
- ✅ Try restarting the app
- ✅ Update Capacitor plugins: `npm update @capacitor/camera`

### No GPS Data in Image
- ✅ Enable Location Services on device
- ✅ Grant location permission to camera
- ✅ Use the device's native camera app
- ✅ Take photo outdoors for better GPS signal
- ✅ Check if device has GPS capability

### Image Upload Fails
- ✅ Check internet connection
- ✅ Verify Supabase Storage bucket exists
- ✅ Confirm storage policies are applied
- ✅ Check file size (must be under limit)
- ✅ Ensure user is authenticated

### Image Not Displaying
- ✅ Verify image URL is saved in database
- ✅ Check bucket is set to public
- ✅ Confirm public read policy is applied
- ✅ Try opening URL directly in browser
- ✅ Check browser console for errors

### Cannot Replace Image
- ✅ Ensure user is authenticated
- ✅ Verify DELETE policy is applied
- ✅ Check UPDATE policy is applied
- ✅ Confirm user has proper permissions

## Technical Details

### Files Modified
- **`src/pages/Home.tsx`** - Main implementation
  - `captureLandImage()` - Camera capture and EXIF extraction
  - `saveImageToLandArea()` - Upload to Supabase Storage
  - `openViewLandInfo()` - Fetch and display images
  - Image viewer in Land Information modal
  - Update confirmation modal

### Storage Flow
1. User captures image with camera
2. App extracts EXIF data from image blob
3. Check if land area already has image
4. If exists, show confirmation dialog
5. Upload image blob to Supabase Storage
6. Generate public URL
7. Save URL and EXIF to database
8. Delete old image if updating
9. Refresh land area data
10. Display image and metadata

### Database Fields
```typescript
interface LandArea {
  // ... other fields
  land_image_url: string | null;  // Public URL of image
  exif_data: {                      // GPS and camera metadata
    latitude?: number;
    longitude?: number;
    altitude?: number;
    make?: string;
    model?: string;
    dateTime?: string;
    // ... more fields
  } | null;
}
```

## Security & Privacy

### Current Implementation (Public Bucket)
- Images are **publicly accessible** via URL
- Anyone with the URL can view the image
- URLs can be shared without authentication
- Suitable for public land records

### For Private Images
If you need to restrict access:
1. Create a **private bucket** instead of public
2. Use **signed URLs** with expiration
3. Update policies to require authentication
4. See `SUPABASE_STORAGE_SETUP.md` for details

## Storage & Costs

### Supabase Storage Limits
- **Free Tier**: 1GB storage, 2GB bandwidth/month
- **Pro Tier**: 100GB storage, 200GB bandwidth/month

### Estimated Usage
- Average photo: **2-3 MB**
- 100 land areas with images: **200-300 MB**
- 1000 land areas with images: **2-3 GB**

### Optimization Tips
- Use 90% JPEG quality (current setting)
- Resize images before upload (future enhancement)
- Clean up old images when updated
- Monitor storage usage regularly

## Future Enhancements

Potential improvements:
- 📷 **Multiple images per land area** (image gallery)
- 🗜️ **Image compression** before upload
- 📏 **Image resizing** for thumbnails
- 🔒 **Private image storage** option
- 🏷️ **Image annotations** (draw on images)
- 📍 **GPS verification** (compare with polygon)
- 🌐 **Offline image queue** (upload when online)
- 🎯 **Image cropping** before save
- 📤 **Bulk image upload** from gallery
- 🔍 **Image search by GPS** coordinates

## Support & Documentation

- **Supabase Storage**: https://supabase.com/docs/guides/storage
- **Capacitor Camera**: https://capacitorjs.com/docs/apis/camera
- **exifr Library**: https://github.com/MikeKovarik/exifr

For issues or questions, consult these documentation files:
- `SUPABASE_STORAGE_SETUP.md` - Bucket and policy setup
- `database-schema-with-image.sql` - Database schema
- `package.json` - Dependencies and versions

