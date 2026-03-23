  Implementation Plan: Magazine PDF Upload Feature

  Overview

  Add a PDF upload capability to the existing settings panel that allows users to upload magazine
   PDFs (max 100MB) which will be stored in /public/play/`<filename>`/.

---

  Architecture Changes Required

1. Backend Changes (local-server.js)

  Dependencies to add:

- multer - for handling multipart/form-data file uploads

  New API Endpoint:
  POST /api/upload-magazine

- Accepts: multipart/form-data with PDF file
- Validates: file type (PDF only), size (≤100MB)
- Creates: /public/play/<magazine_name>/ directory
- Stores: PDF file in the new directory
- Returns: success/error response

2. Frontend Changes

  Settings Panel (DesktopLayout.tsx & TabletLayout.tsx):

- Add upload button/area within the existing .setting popup
- File input restricted to .pdf files
- Client-side validation for 100MB limit
- Upload progress indicator
- Success/error feedback

  Styling (DesktopLayout.scss & TabletLayout.scss):

- Style for upload button/dropzone
- Progress indicator styling
- May need to increase .setting panel height (currently 300px)

---

  Detailed Implementation Steps

  Step 1: Install Dependencies

  npm install multer

  Step 2: Backend - Add Upload Endpoint

  In local-server.js:
  const multer = require('multer');

  // Configure multer storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const magazineName = path.parse(file.originalname).name;
      const destDir = path.join(process.cwd(), 'public', 'play', magazineName);
      fs.mkdirSync(destDir, { recursive: true });
      cb(null, destDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });

  // File filter - PDF only
  const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  };

  const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
  });

  // Upload endpoint
  app.post('/api/upload-magazine', upload.single('magazine'), (req, res) => {
    // Handle success/error
  });

  Step 3: Frontend - Add Upload UI

  In the settings panel (after the Magazine dropdown):

<div className="speed-controls upload-section">
    <div><Upload /></div>
    <input
      type="file"
      accept=".pdf,application/pdf"
      onChange={handleMagazineUpload}
      id="magazine-upload"
    />
    <label htmlFor="magazine-upload">Upload PDF</label>
  </div>

  Step 4: Frontend - Upload Handler

  const handleMagazineUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Client-side validation
    if (file.size > 100 * 1024 * 1024) {
      alert('File size exceeds 100MB limit');
      return;
    }

    const formData = new FormData();
    formData.append('magazine', file);

    // Upload with progress tracking
    // Refresh magazine list on success
  };

---

  File Structure After Upload

  When user uploads My_Magazine.pdf:
  /public/play/My_Magazine/
  └── My_Magazine.pdf

  Note: Audio scripts, keywords, and flashcards would need to be added separately (out of scope
  for this feature).

---

  Validation Summary

  ┌────────────────────┬────────────────────┬───────────────────────────────────────┐
  │     Validation     │      Location      │                Method                 │
  ├────────────────────┼────────────────────┼───────────────────────────────────────┤
  │ PDF type only      │ Backend + Frontend │ accept=".pdf" + multer fileFilter     │
  ├────────────────────┼────────────────────┼───────────────────────────────────────┤
  │ 100MB max          │ Backend + Frontend │ Client check + multer limits.fileSize │
  ├────────────────────┼────────────────────┼───────────────────────────────────────┤
  │ Duplicate handling │ Backend            │ Check if directory exists             │
  └────────────────────┴────────────────────┴───────────────────────────────────────┘

---

  UI/UX Considerations

1. Upload button placement: Below the Magazine dropdown in settings panel
2. Progress feedback: Show upload percentage for large files
3. Success action: Auto-refresh magazine list, optionally auto-select new magazine
4. Error handling: Display clear error messages for invalid file type/size

---

  Questions Before Implementation

1. Duplicate handling: If a magazine with the same name exists, should we:
   - Reject the upload?
   - Overwrite the existing PDF?
   - Add a suffix (e.g., Magazine_1)?
2. Magazine list refresh: After successful upload, should the new magazine be automaticallyselected?
3. Upload progress: Do you want a visible progress bar for large file uploads?

---
