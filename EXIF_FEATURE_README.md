# Camera EXIF Data Capture Feature

## Overview
This feature allows users to capture images with EXIF data (including GPS coordinates, camera information, and image metadata) for land areas in the Landlord app.

## What Was Added

### 1. Packages Installed
- `@capacitor/camera` - Capacitor plugin for camera access
- `exifr` - Library for extracting EXIF data from images

### 2. Database Schema
The `land_areas` table already includes an `exif_data` column (jsonb type) for storing EXIF information. See `database-schema-exif.sql` for the complete schema.

### 3. Features Implemented

#### Camera Capture
- **Capture Button**: A "Capture EXIF" button is available in the Land Information modal
- **Image Preview**: Shows the captured image with extracted EXIF data
- **EXIF Extraction**: Automatically extracts:
  - GPS coordinates (latitude, longitude, altitude)
  - Camera information (make, model)
  - Image metadata (date/time, dimensions)
  - Camera settings (ISO, focal length, exposure, f-number)
  
#### Data Display
- **EXIF Data Section**: Displays saved EXIF data in the Land Information view
- **Formatted Display**: Shows GPS coordinates, camera info, and capture date in a user-friendly format

#### Data Storage
- **Save to Database**: EXIF data is stored as JSON in the `exif_data` column
- **Persistent Storage**: Data remains attached to the land area for future reference

## How to Use

### For Surveyors:
1. Open a land area by clicking on a polygon on the map
2. In the Land Information modal, click the **"Capture EXIF"** button
3. Take a photo of the land using your device camera
4. Review the captured image and EXIF data
5. Click **"Save to Land Area"** to attach the EXIF data to the land record
6. The EXIF data will now appear in the Land Information view

### EXIF Data Fields
The following data is captured (when available):
- **GPS Latitude/Longitude**: Exact location where photo was taken
- **Altitude**: Height above sea level in meters
- **Date/Time**: When the photo was captured
- **Camera Make/Model**: Device used to capture the image
- **ISO**: Camera sensitivity setting
- **Focal Length**: Lens focal length in mm
- **Exposure Time**: Shutter speed in seconds
- **F-Number**: Aperture setting
- **Image Dimensions**: Width and height in pixels
- **Software**: Camera software version

## Building and Testing

### Web Development
```bash
npm run dev
```
Note: Camera features require a device with a camera. Testing on desktop browsers may have limitations.

### Building for Android
```bash
# Build the web assets
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

### Android Permissions
The Camera plugin will automatically request camera permissions when needed. Make sure your `AndroidManifest.xml` includes:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
```

These permissions are typically added automatically by Capacitor.

## Important Notes

### GPS Data Requirements
- **Enable Location Services**: Ensure the device has GPS/location services enabled
- **Camera GPS Settings**: Some camera apps strip EXIF data; use the native camera app
- **Permissions**: The app may need location permissions for GPS data in photos

### EXIF Data Availability
- Not all cameras include EXIF data
- Some devices may strip GPS data for privacy
- The feature gracefully handles missing data by showing only available fields

### Best Practices
1. **Take photos on-site**: GPS coordinates are most accurate when captured at the actual location
2. **Check EXIF data**: Review the captured data before saving to ensure GPS coordinates are present
3. **Multiple captures**: You can capture multiple images; the most recent EXIF data will be saved
4. **Verify location**: Compare EXIF GPS coordinates with the mapped polygon boundaries

## Database Structure

### EXIF Data Format (JSON)
```json
{
  "latitude": 14.599512,
  "longitude": 120.984222,
  "altitude": 15.5,
  "make": "Samsung",
  "model": "SM-G998B",
  "dateTime": "2025-10-23T14:30:00.000Z",
  "software": "Android 13",
  "orientation": 1,
  "exposureTime": 0.008,
  "fNumber": 1.8,
  "iso": 100,
  "focalLength": 5.4,
  "flash": 0,
  "whiteBalance": 0,
  "imageWidth": 4000,
  "imageHeight": 3000
}
```

## Troubleshooting

### Camera Not Opening
- Check device permissions
- Ensure the app has camera access
- Try restarting the app

### No EXIF Data Found
- Verify GPS is enabled on the device
- Check camera settings to ensure EXIF data is preserved
- Try a different camera app
- Some photos from gallery may have stripped EXIF data

### Data Not Saving
- Ensure you have an internet connection
- Check Supabase connection
- Verify the land area is selected before capturing

## Future Enhancements
Potential improvements for this feature:
- Store actual image files (currently only EXIF metadata is stored)
- Gallery of images per land area
- Automatic geotagging verification
- EXIF data comparison with polygon boundaries
- Image compression and optimization
- Offline image storage

## Technical Details

### Files Modified
- `src/pages/Home.tsx` - Main implementation
  - Added camera capture function
  - Added EXIF extraction logic
  - Added EXIF data modal
  - Updated view modal to display EXIF data
  - Updated database queries to fetch/save EXIF data

### New Dependencies
- `@capacitor/camera@^7.x` - Camera plugin
- `exifr@^7.x` - EXIF parsing library

### API Changes
- `openViewLandInfo()` - Now fetches `exif_data` field
- `saveExifToLandArea()` - New function to save EXIF data
- `captureImageWithExif()` - New function to capture and extract EXIF

## Support
For issues or questions, please contact the development team or refer to:
- [Capacitor Camera Documentation](https://capacitorjs.com/docs/apis/camera)
- [exifr Library Documentation](https://github.com/MikeKovarik/exifr)

