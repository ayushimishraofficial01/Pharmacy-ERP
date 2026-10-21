// Phase 10 — Google Drive / OneDrive backup upload integration
// (requirement 11). Real, publicly documented REST endpoints — Google
// Drive API v3 and Microsoft Graph API — not a fabricated vendor API. No
// credentials are ever hardcoded: access tokens come from environment
// variables (GOOGLE_DRIVE_ACCESS_TOKEN / ONEDRIVE_ACCESS_TOKEN) that your
// deployment sets from a real OAuth2 flow you run outside this app. Neither
// path has been exercised against a live account in this sandbox (no
// network access) — see the final report for that caveat.
//
// KNOWN LIMITATION: the OneDrive path here uses a simple PUT upload, which
// the Graph API only supports for files under 4MB. A full MongoDB dump can
// easily exceed that. For larger archives you need Graph's resumable
// upload-session API instead — NOT implemented here; this adapter will
// return an ERROR result (not a fabricated success) if the file exceeds
// that size, so a real gap is visible rather than silently mishandled.

const fs = require('fs');
const path = require('path');

async function uploadToGoogleDrive({ filePath, folderId }) {
  const accessToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!accessToken) return { uploaded: false, error: 'GOOGLE_DRIVE_ACCESS_TOKEN environment variable is not set' };
  if (typeof fetch !== 'function') return { uploaded: false, error: 'No fetch implementation available in this Node runtime (requires Node 18+)' };

  const fileName = path.basename(filePath);
  const metadata = { name: fileName, ...(folderId && { parents: [folderId] }) };
  const fileBuffer = fs.readFileSync(filePath);

  const boundary = `boundary-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  try {
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { uploaded: false, error: `Google Drive API responded ${response.status}: ${text}`.slice(0, 500) };
    }
    const data = await response.json();
    return { uploaded: true, remoteFileId: data.id, remoteUrl: `https://drive.google.com/file/d/${data.id}/view` };
  } catch (err) {
    return { uploaded: false, error: `Google Drive upload failed: ${err.message}` };
  }
}

async function uploadToOneDrive({ filePath, remoteFolderPath = 'PharmacyERP-Backups' }) {
  const accessToken = process.env.ONEDRIVE_ACCESS_TOKEN;
  if (!accessToken) return { uploaded: false, error: 'ONEDRIVE_ACCESS_TOKEN environment variable is not set' };
  if (typeof fetch !== 'function') return { uploaded: false, error: 'No fetch implementation available in this Node runtime (requires Node 18+)' };

  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);
  if (stats.size >= 4 * 1024 * 1024) {
    return { uploaded: false, error: `File is ${stats.size} bytes — exceeds the 4MB simple-upload limit. A resumable upload session is required for larger files and is not implemented in this adapter.` };
  }
  const fileBuffer = fs.readFileSync(filePath);

  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${remoteFolderPath}/${fileName}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
      body: fileBuffer,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { uploaded: false, error: `OneDrive (Graph) API responded ${response.status}: ${text}`.slice(0, 500) };
    }
    const data = await response.json();
    return { uploaded: true, remoteFileId: data.id, remoteUrl: data.webUrl || null };
  } catch (err) {
    return { uploaded: false, error: `OneDrive upload failed: ${err.message}` };
  }
}

module.exports = { uploadToGoogleDrive, uploadToOneDrive };
