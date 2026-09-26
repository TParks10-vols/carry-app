# Carry · Moving day guide

Carry is a phone-friendly installable web app for recording boxes by voice, finding contents, and telling you a box's drop location. It stores a working copy on the device, so the inventory and typed search are available offline after the app has loaded once. Connect a Google Sheet when you want a shared directory across devices.

## Run Carry on this computer

Run `Start Carry.ps1` from PowerShell, then open `http://127.0.0.1:8765/` in a browser. Keep the PowerShell window open while you use it. This local address is for this computer; a phone cannot use the computer's `127.0.0.1` address.

## Get Carry on a phone

1. Publish `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `carry-icon.png`, and `carry-icon-192.png` to an HTTPS static host, such as GitHub Pages. The local `127.0.0.1` address works only on the computer running it.
2. On Android, open the hosted link in Chrome, allow microphone access, then use **⋮ → Install app** (or **Add to Home screen**). Android Chrome is the primary voice target.
3. On iPhone, open the same link in Safari and choose **Share → Add to Home Screen**. Use Quick Find if voice input is unavailable in the browser.
4. Connect the Google Sheet in Carry on the phone; this shares the inventory between phones. The installed app keeps a local copy for offline box lookups.

Voice recognition varies by browser and can require internet access through the browser's speech service. Carry prefers on-device recognition when the browser provides it. Typed search and editing remain available if voice input cannot start.

## Connect a Google Sheet

1. Create or open a Google Sheet for this move. On its **Extensions → Apps Script** menu, replace the starter code with the contents of `Google Apps Script.gs`, then save.
2. In Apps Script, open **Project Settings → Script Properties** and add `CARRY_ACCESS_KEY`. Set its value to a long, random phrase that you will also enter into Carry on each device.
3. Choose **Deploy → New deployment → Web app**. Set it to execute as your Google account, and allow access to anyone. Deploy, authorize the script's Sheets access, then copy the deployed URL ending in `/exec`.
4. In Carry, choose **Connect directory**, paste the web app URL and access key, then choose one:
   - **Connect & download** makes the Google Sheet the starting list on this device.
   - **Upload this list** replaces the Sheet's inventory with this device's list.
5. After connecting, Carry sends additions, edits, and deletions to the Sheet. If someone edits the Sheet directly, tap **Refresh from sheet** in Carry to load those changes.

The script uses the five inventory columns `Box Number/ID`, `Box Size`, `Contents`, `Drop Location`, and `Special Notes` in a tab named `Inventory`. It creates that tab if it is missing. Upload replaces the five-column inventory, so use the initial upload only when this device's list is the one you want to keep. The shared access key is saved in this browser's local storage; use the app only on devices you trust, and avoid putting highly sensitive information in the inventory.

## Local backup and import

**Save CSV** exports all five inventory columns. **Import CSV** loads a file with those headers, including a CSV exported from `Moving Inventory.xlsx`. Without a Sheet connection, data remains only in this browser on this device.

## Voice features

- **Record a box** guides you through box ID, size, contents, destination, and special notes, then asks you to confirm before saving.
- **Find its room** listens for box IDs and speaks the matching destination and handling notes.
- **Find what you need** searches the contents and reads the box and location aloud.
- **Quick find** provides the same lookup in text when speaking is inconvenient or unsupported.

Speech recognition availability varies by browser. On Android Chrome, browser speech recognition is used; it may use an online speech service. Carry does not run its own transcription service. Spoken answers use the device's speech voices.

## Search update
Box IDs can contain letters, numbers, or full names such as Ironing Board and Baby Bath. In Unloading, say the full ID or item name. The Where is the …? text field searches item names and contents with close matching for partial words and small spelling mistakes. Typed searches are silent. Voice search starts listening without an opening spoken prompt and still reads the results aloud.

To install this update, publish index.html, app.js, styles.css, and sw.js together to the existing GitHub Pages site. Reopen Carry after deployment. Keep the existing Apps Script URL and access key.

