// Phase 10 — file upload middleware for the Excel/CSV purchase import
// (requirement 12). Memory storage (not disk) since files are parsed
// in-process and never need to persist.
//
// `multer` is a new dependency added to package.json. app.js requires every
// route file eagerly at boot, so a hard `require('multer')` failure here
// would crash the ENTIRE server if `npm install` hasn't been run yet — not
// just purchase-import. To avoid that, the require is attempted once at
// load time but wrapped in try/catch; if it fails, `single()` below returns
// a middleware that responds with a clear 500 instead of ever calling
// multer, and every other route in the app keeps working normally.
let multer = null;
let loadError = null;
try {
  // eslint-disable-next-line global-require
  multer = require('multer');
} catch (err) {
  loadError = err;
}

function single(fieldName) {
  if (!multer) {
    return (req, res) => {
      res.status(500).json({ success: false, message: 'The "multer" package is not installed. Run `npm install` (it was added to package.json for Phase 10 purchase import) and try again.', errors: null });
    };
  }
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — generous for a single supplier invoice's worth of line items
    fileFilter: (req, file, cb) => {
      const allowedExt = /\.(csv|xlsx|xls)$/i;
      if (!allowedExt.test(file.originalname)) return cb(new Error('Only .csv, .xlsx, or .xls files are accepted'));
      cb(null, true);
    },
  });
  return upload.single(fieldName);
}

module.exports = { single, isAvailable: () => !!multer, loadError };
