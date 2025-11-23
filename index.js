const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
// Paystack webhook bodies are raw until verified, so we use raw body parsing
app.use(bodyParser.raw({ type: 'application/json' }));

// --- CONFIGURATION (Reads from Environment Variables on Render) ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Column Indices (0-based: C=2, H=7)
const EMAIL_COLUMN_INDEX = 2; // Column C
const STATUS_COLUMN_INDEX = 7; // Column H
const STATUS_PAID = 'Paid';


// This route receives the webhook from Paystack
// This route receives the webhook from Paystack
app.post('/', async (req, res) => {
    // 1. Acknowledge immediately before processing (CRUCIAL for Paystack)
    res.status(200).send('Webhook Received');

    try {
        const signature = req.headers['x-paystack-signature'];
        const payload = req.body.toString();

        // 2. Security Check (Signature Verification)
        const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
            .update(payload)
            .digest('hex');

        if (hash !== signature) {
            console.error('SECURITY FAILURE: Signature mismatch.');
            return;
        }

        const eventData = JSON.parse(payload);

        // 3. Process the 'charge.success' event
        if (eventData.event === 'charge.success') {
            const customerEmail = eventData.data.customer.email;
            console.log(`Processing secure payment for: ${customerEmail}`);

            // Define the credentials object
            const creds = {
                client_email: process.env.CLIENT_EMAIL,
                private_key: JSON.parse(`"${process.env.PRIVATE_KEY}"`),
            };

            // 1. Initialize the doc object *with* the credentials. (Correct for v4.x)
            const doc = new GoogleSpreadsheet(SPREADSHEET_ID, { auth: creds });

            // 2. Load the document structure asynchronously.
            await doc.loadInfo();
            // ==========================================================

            // Assuming your sheet is the first tab (index 0)
            const sheet = doc.sheetsByIndex[0];
            const rows = await sheet.getRows();

            // 4. Find and Update Row
            for (const row of rows) {
                const sheetEmail = row._rawData[EMAIL_COLUMN_INDEX];

                if (sheetEmail && sheetEmail.toString().trim().toLowerCase() === customerEmail.toLowerCase()) {
                    // Update the status column (Column H is index 7)
                    row._rawData[STATUS_COLUMN_INDEX] = STATUS_PAID;
                    await row.save();
                    console.log(`Status updated to Paid for: ${customerEmail}`);
                    return;
                }
            }
        }
    } catch (error) {
        console.error('Webhook Processing Error:', error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});