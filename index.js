
const express = require('express');
const app = express();
app.use(express.json());
const cors = require('cors');
const allowedOrigins = [
  'https://alfread648.wixsite.com',
  'https://alfread648.wixsite.com/pass-generator',
  'https://editor.wix.com',
  undefined  // for local tools like Postman or curl
];

app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));


const { google } = require('googleapis');
require('dotenv').config();
const key = require('./wallet-service.json');
const jwt = require('jsonwebtoken');

const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
});

app.post('/generate-pass', async (req, res) => {
  const { name, surname, email, points } = req.body;
  const issuerId = process.env.ISSUER_ID;

  if (!email) return res.status(400).json({ error: "Email is required" });

  const userId = email.replace(/[^a-zA-Z0-9]/g, '_'); // safe ID
  const objectId = `${issuerId}.${userId}_eventpass`;

  const passPayload = {
    id: objectId,
    classId: `${issuerId}.sample_event_class`,
    state: "ACTIVE",
    barcode: {
      type: "QR_CODE",
      value: email
    },
    ticketHolderName: `${name} ${surname}`,
    ticketNumber: `POINTS-${points}`
  };

  try {
    const client = await auth.getClient();
    const wallet = google.walletobjects({ version: 'v1', auth: client });

    // Attempt to insert the object
    await wallet.eventticketobject.insert({ requestBody: passPayload });

    const token = jwt.sign({
      iss: key.client_email,
      aud: 'google',
      origins: [],
      typ: 'savetowallet',
      payload: { eventTicketObjects: [passPayload] }
    }, key.private_key, { algorithm: 'RS256' });

    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;
    res.json({ walletUrl: saveUrl });

  } catch (e) {
    if (e.code === 409) {
      // Object already exists, just generate token
      const token = jwt.sign({
        iss: key.client_email,
        aud: 'google',
        origins: [],
        typ: 'savetowallet',
        payload: {
          eventTicketObjects: [{ id: objectId }]
        }
      }, key.private_key, { algorithm: 'RS256' });

      const saveUrl = `https://pay.google.com/gp/v/save/${token}`;
      res.status(200).json({ message: "Pass already exists", walletUrl: saveUrl });

    } else {
      console.error('FULL ERROR:', JSON.stringify(e, null, 2));
  res.status(500).json({ error: "Failed to generate pass", details: e.message });
    }
  }
});

app.get("/", (req, res) => {
  res.send("✅ Render backend is running");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
